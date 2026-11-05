import { betterAuth } from "better-auth";
import { sendMail, resetPasswordMail } from "./lib/mail";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { db } from "./database";

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
const TRUSTED_ORIGINS = [
  process.env.WEBSITE_URL,
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

export const auth = betterAuth({
  basePath: "/api/auth",
  baseURL: process.env.WEBSITE_URL,
  database: drizzleAdapter(db, { provider: "sqlite" }),
  emailAndPassword: {
    enabled: true,
    // Sans ceci, un étudiant qui se trompe de mot de passe à l'inscription
    // est bloqué DÉFINITIVEMENT : Better Auth n'envoie rien de lui-même.
    sendResetPassword: async ({ user, url }) => {
      const mail = resetPasswordMail(url, user.name);
      await sendMail({ to: user.email, ...mail });
    },
    // Une heure. Assez pour aller chercher l'e-mail, assez court pour qu'un
    // lien retrouvé dans une boîte partagée ne serve plus à rien.
    resetPasswordTokenExpiresIn: 3600,
  },
  secret: process.env.BETTER_AUTH_SECRET,
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
