import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import {
  mailCanReachAnyone,
  mailConfigured,
  mailLang,
  linkOnWebsite,
  sendMail,
  resetPasswordMail,
  verifyEmailMail,
  type MailLang,
} from "./lib/mail";
import { userAccess } from "./database/schema";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { db } from "./database";
import { getAccess } from "./lib/access";
import { isValidSignupName } from "./lib/display-name";
import { startTrial, type TrialDb } from "./lib/trial";
import { betaFree } from "./lib/plan";

// Social logins are optional: each is enabled only when its env vars are set.
const googleEnabled =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
const appleEnabled =
  !!process.env.APPLE_CLIENT_ID && !!process.env.APPLE_CLIENT_SECRET;

/**
 * Origines autorisées : le site public, l'app mobile (schéma Expo « tred:// »),
 * le développement local, et ce que TRUSTED_ORIGINS ajoute (séparées par des
 * virgules — par ex. l'origine de l'app de bureau).
 */
export const TRUSTED_ORIGINS = [
  process.env.WEBSITE_URL,
  process.env.BETTER_AUTH_URL,
  // Domaine public de TRED (www et la racine, qui redirige vers www) — et
  // l'ancienne URL Railway, pour que les liens déjà envoyés restent valides.
  "https://www.tred-tutor.de",
  "https://tred-tutor.de",
  "https://aerostudy-production-0c66.up.railway.app",
  // Domaine *.up.railway.app, posé automatiquement par Railway : filet de
  // sécurité si WEBSITE_URL manque, pour que la connexion web ne casse pas.
  process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : undefined,
  // App mobile : build (tred://) et Expo Go (exp://). Aucun navigateur ne
  // peut se présenter avec ces schémas : sans risque, même en production.
  "tred://",
  "exp://",
  ...(process.env.NODE_ENV === "production"
    ? []
    : ["http://localhost:4200", "http://localhost:3000"]),
  ...(appleEnabled ? ["https://appleid.apple.com"] : []),
  ...(process.env.TRUSTED_ORIGINS ?? "").split(","),
]
  // « https://x.app/ » → « https://x.app » ; « tred:// » reste intact.
  .map((o) => o?.trim().replace(/^(https?:\/\/[^/]+)\/$/, "$1"))
  .filter((o): o is string => Boolean(o));

if (process.env.NODE_ENV === "production" && !process.env.WEBSITE_URL) {
  console.warn(
    "[auth] WEBSITE_URL manquant : seules ces origines sont acceptées →",
    TRUSTED_ORIGINS.join(", "),
  );
}

/**
 * Vérification de l'adresse à l'inscription — UNIQUEMENT si un e-mail peut
 * réellement partir vers n'importe qui (clé Resend + MAIL_FROM sur un domaine
 * vérifié). Sinon l'exiger enfermerait dehors chaque nouvel inscrit : le
 * lien ne partirait jamais (incident du 5 nov. 2026, adresse de test Resend).
 */
const verifyByMail = mailCanReachAnyone();
/** Ce serveur confirme-t-il les adresses par e-mail ? Lu par la garde d'administration. */
export const emailVerificationActive = verifyByMail;
if (process.env.NODE_ENV === "production" && !verifyByMail) {
  console.warn(
    mailConfigured()
      ? "[auth] MAIL_FROM n'est pas sur un domaine vérifié : inscription SANS vérification d'e-mail, et les e-mails ne partent qu'au propriétaire du compte Resend."
      : "[auth] RESEND_API_KEY absente : inscription SANS vérification d'e-mail.",
  );
}

/**
 * Langue de l'e-mail : celle choisie dans l'app (user_access.locale), sinon
 * celle du navigateur qui a fait la demande (une inscription n'a pas encore
 * de réglage), sinon l'allemand. Ne lève jamais.
 */
async function langOf(userId: string, request?: Request): Promise<MailLang> {
  try {
    const rows = await db
      .select({ locale: userAccess.locale })
      .from(userAccess)
      .where(eq(userAccess.userId, userId))
      .limit(1);
    if (rows[0]?.locale) return mailLang(rows[0].locale);
  } catch {
    /* table absente ou base indisponible : on passe au navigateur */
  }
  const accept = request?.headers.get("accept-language")?.slice(0, 2).toLowerCase();
  return mailLang(accept);
}

export const auth = betterAuth({
  basePath: "/api/auth",
  // BETTER_AUTH_URL d'abord (convention Better Auth), WEBSITE_URL sinon.
  baseURL: process.env.BETTER_AUTH_URL || process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // Sans ceci, un étudiant qui se trompe de mot de passe à l'inscription
    // est bloqué DÉFINITIVEMENT : Better Auth n'envoie rien de lui-même.
    sendResetPassword: async ({ user, url }, request) => {
      const mail = resetPasswordMail(linkOnWebsite(url), user.name, await langOf(user.id, request));
      await sendMail({ to: user.email, ...mail });
    },
    // Une heure. Assez pour aller chercher l'e-mail, assez court pour qu'un
    // lien retrouvé dans une boîte partagée ne serve plus à rien.
    resetPasswordTokenExpiresIn: 3600,
    // Pas de session avant le clic sur le lien : une adresse inventée ne
    // donne pas accès au tuteur (et donc pas aux crédits d'IA).
    requireEmailVerification: verifyByMail,
  },
  emailVerification: {
    sendOnSignUp: verifyByMail,
    // Un compte non vérifié qui tente de se connecter reçoit un nouveau lien :
    // personne ne reste bloqué parce que le premier e-mail s'est perdu.
    sendOnSignIn: verifyByMail,
    // Le clic ouvre la session et mène au callbackURL (le Dashboard).
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }, request) => {
      const mail = verifyEmailMail(linkOnWebsite(url), user.name, await langOf(user.id, request));
      await sendMail({ to: user.email, ...mail });
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  // Un compte bloqué (admin → « Sperren ») ne peut plus ouvrir de session :
  // sans cela il se reconnectait, et seule la garde par requête le retenait.
  // En cas de panne de la base, on n'empêche pas TOUT LE MONDE de se
  // connecter : la garde par requête (authed, « Sperre ») reste en place.
  // Le nom complet est OBLIGATOIRE à l'inscription par e-mail (décision du
  // 12 nov. 2026). Vérifié ici aussi : un client qui contourne le formulaire
  // ne peut pas créer un compte sans nom. Les connexions Google / Apple ne
  // passent pas par cette route : leur nom vient du fournisseur.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      const body = (ctx.body ?? {}) as { name?: unknown; email?: unknown };
      const name = typeof body.name === "string" ? body.name : "";
      const email = typeof body.email === "string" ? body.email : "";
      if (!isValidSignupName(name, email)) {
        throw new APIError("BAD_REQUEST", { message: "NAME_REQUIRED", code: "NAME_REQUIRED" });
      }
    }),
  },
  databaseHooks: {
    // Tout nouveau compte commence par 14 jours illimités (lib/trial.ts).
    // Une panne ici ne doit jamais empêcher une inscription : sans essai, le
    // compte est simplement Free, et peut lancer l'essai depuis /pricing.
    user: {
      create: {
        after: async (user) => {
          // Bêta gratuite : tout est déjà ouvert, l'essai est gardé pour le lancement.
          if (betaFree()) return;
          await startTrial(db as unknown as TrialDb, user.id).catch((error) => {
            console.error("[auth] trial start failed", error);
          });
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const access = await getAccess(session.userId).catch(() => null);
          if (access && !access.isActive) throw new APIError("FORBIDDEN", { message: "ACCOUNT_DISABLED" });
        },
      },
    },
  },
  ...(googleEnabled || appleEnabled
    ? {
        socialProviders: {
          ...(googleEnabled
            ? {
                google: {
                  clientId: process.env.GOOGLE_CLIENT_ID!,
                  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
                },
              }
            : {}),
          ...(appleEnabled
            ? {
                apple: {
                  clientId: process.env.APPLE_CLIENT_ID!,
                  clientSecret: process.env.APPLE_CLIENT_SECRET!,
                },
              }
            : {}),
        },
      }
    : {}),
  // SÉCURITÉ (audit OWASP du 5 nov. 2026, A01/A07) : la liste est FIXE.
  // Avant, l'origine de la requête était renvoyée telle quelle (ou "*" sans
  // en-tête Origin). Better Auth valide les URL de redirection contre cette
  // liste : n'importe quel site pouvait donc demander un e-mail de
  // réinitialisation dont le lien renvoyait le token chez lui → vol de compte.
  trustedOrigins: TRUSTED_ORIGINS,
  plugins: [expo()],
});
