// Lot 1 : mot de passe oublié · barrière d'erreur · consentement de rétractation.
//
//   node patch-lot1.mjs
//
// Version 2 : le branchement est maintenant complet. La v1 posait les fichiers
// et laissait trois raccords à faire à la main ; ils sont automatisés ici, et
// les libellés sont ajoutés dans TOUTES les langues — sans quoi TypeScript
// refuse de compiler, puisque le type `Messages` exige que les trois fichiers
// aient exactement les mêmes clés.
//
// Idempotent, .bak avant chaque écriture. Chaque bloc est indépendant : si
// l'un ne reconnaît pas ton fichier, il est signalé et les autres passent
// quand même.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API = path.join(ROOT, "packages", "web", "src", "api");
const WEB = path.join(ROOT, "packages", "web", "src", "web");

const F = {
  auth: path.join(API, "auth.ts"),
  apiIndex: path.join(API, "index.ts"),
  appTsx: path.join(WEB, "app.tsx"),
  login: path.join(WEB, "pages", "login.tsx"),
  pricing: path.join(WEB, "pages", "pricing.tsx"),
  messages: path.join(WEB, "i18n", "messages"),
};

let ok = 0;
let skipped = 0;
const failed = [];

function patch(label, file, fn) {
  if (!fs.existsSync(file)) {
    failed.push(`${label} — fichier absent : ${path.relative(ROOT, file)}`);
    return;
  }
  const before = fs.readFileSync(file, "utf8");
  let after;
  try {
    after = fn(before);
  } catch (err) {
    failed.push(`${label} — ${err.message}`);
    return;
  }
  if (after === null) {
    console.log(`⏭️  ${label} — déjà fait`);
    skipped++;
    return;
  }
  if (after === undefined) {
    failed.push(`${label} — motif introuvable dans ${path.relative(ROOT, file)}`);
    return;
  }
  fs.writeFileSync(file + ".bak", before, "utf8");
  fs.writeFileSync(file, after, "utf8");
  console.log(`✅ ${label}`);
  ok++;
}

/* ══ A. Mot de passe oublié — backend ══════════════════════════════════ */

patch("auth.ts — envoi du lien de réinitialisation", F.auth, (s) => {
  if (s.includes("sendResetPassword")) return null;

  const re = /emailAndPassword:\s*\{\s*enabled:\s*true\s*\}/;
  if (!re.test(s)) return undefined;

  let out = s.replace(
    re,
    `emailAndPassword: {
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
  }`,
  );

  const imp = `import { betterAuth } from "better-auth";`;
  if (!out.includes(imp)) return undefined;
  out = out.replace(
    imp,
    `${imp}\nimport { sendMail, resetPasswordMail } from "./lib/mail";`,
  );

  return out;
});

/* ══ B. Journal d'erreurs — route serveur ══════════════════════════════ */

patch("api/index.ts — route /api/errors", F.apiIndex, (s) => {
  if (s.includes('"/api/errors"')) return null;

  const anchor = `app.get("/api/config"`;
  if (!s.includes(anchor)) return undefined;

  const route = `// ── Rapports d'erreur du navigateur ───────────────────────────────────────
// Volontairement PUBLIQUE et sans base de données : ce qui compte, c'est que
// l'erreur apparaisse dans les journaux Railway. Une table demanderait une
// migration, une purge et une page d'administration — pour une information
// que tu vas lire trois fois par semaine.
//
// Réponse 204 dans TOUS les cas : un rapport d'erreur qui échoue et déclenche
// un second rapport est une boucle qu'on ne veut pas découvrir en production.
app.post("/api/errors", async (c) => {
  try {
    const body = (await c.req.json()) as Record<string, unknown>;
    const ip = (c.req.header("x-forwarded-for") ?? "").split(",")[0]?.trim();
    console.error(
      "[client-error]",
      JSON.stringify({
        kind: body.kind,
        area: body.area,
        message: String(body.message ?? "").slice(0, 300),
        url: body.url,
        at: body.at,
        ip,
        stack: String(body.stack ?? "").slice(0, 800),
      }),
    );
  } catch {
    /* corps illisible : rien à journaliser, rien à signaler */
  }
  return c.body(null, 204);
});

${anchor}`;

  return s.replace(anchor, route);
});

/* ══ C. Route publique + barrière d'erreur, dans app.tsx ═══════════════ */

patch("app.tsx — route /reset-password + barrière d'erreur", F.appTsx, (s) => {
  if (s.includes("ResetPasswordPage")) return null;

  let out = s;

  const firstImport = out.match(/^import .*$/m);
  if (!firstImport) return undefined;
  out = out.replace(
    firstImport[0],
    `${firstImport[0]}
import ResetPasswordPage from "@/pages/reset-password";
import { ErrorBoundary, installGlobalErrorReporting } from "@/components/error-boundary";`,
  );

  // La route DOIT être hors de la zone authentifiée : on arrive dessus
  // déconnecté, par un lien reçu par e-mail.
  const rootRoute = `      <Route path="/" component={RootRedirect} />`;
  if (!out.includes(rootRoute)) return undefined;
  out = out.replace(
    rootRoute,
    `      <Route path="/reset-password" component={ResetPasswordPage} />\n${rootRoute}`,
  );

  // La barrière entoure la zone connectée. Placée là, une erreur de rendu
  // affiche un écran lisible au lieu d'une page blanche, et le rapport part
  // vers /api/errors — sinon tu n'apprends jamais que ça s'est produit.
  if (!out.includes("        <AppLayout>") || !out.includes("        </AppLayout>")) {
    return undefined;
  }
  out = out
    .replace(
      "        <AppLayout>",
      "        <ErrorBoundary area=\"app\">\n        <AppLayout>",
    )
    .replace(
      "        </AppLayout>",
      "        </AppLayout>\n        </ErrorBoundary>",
    );

  // Les promesses rejetées et les erreurs globales échappent à toute barrière
  // React. Cet appel les attrape ; il est protégé contre les appels répétés.
  const appFn = out.match(/^function App\(\) \{$/m);
  if (!appFn) return undefined;
  out = out.replace(
    appFn[0],
    `installGlobalErrorReporting();\n\n${appFn[0]}`,
  );

  return out;
});

/* ══ D. Page de connexion : l'action ═══════════════════════════════════ */

patch("login.tsx — action « mot de passe oublié »", F.login, (s) => {
  if (s.includes("forgetPassword")) return null;

  const anchor = `  const [invite, setInvite] = useState("");`;
  if (!s.includes(anchor)) return undefined;

  return s.replace(
    anchor,
    `${anchor}
  const [forgotSent, setForgotSent] = useState(false);

  /**
   * Envoie le lien de réinitialisation.
   *
   * On affiche « e-mail envoyé » MÊME si l'adresse est inconnue. Répondre
   * « ce compte n'existe pas » permettrait à n'importe qui de savoir qui est
   * inscrit chez toi, une adresse à la fois.
   */
  async function forgotPassword() {
    if (!email.trim()) {
      setError("Bitte gib zuerst deine E-Mail-Adresse ein.");
      return;
    }
    setError(null);
    setBusy(true);
    await authClient
      .forgetPassword({
        email: email.trim().toLowerCase(),
        redirectTo: \`\${window.location.origin}/reset-password\`,
      })
      .catch(() => {});
    setBusy(false);
    setForgotSent(true);
  }`,
  );
});

/* ══ E. Page de connexion : le lien visible ════════════════════════════ */

patch("login.tsx — lien visible sous le mot de passe", F.login, (s) => {
  if (s.includes('t("auth.forgotPassword")')) return null;

  const anchor = `          {error && (
            <p className="text-destructive text-sm font-medium">{error}</p>
          )}`;
  if (!s.includes(anchor)) return undefined;

  // Le lien n'apparaît qu'en mode connexion : à l'inscription, il n'y a pas
  // encore de mot de passe à oublier.
  return s.replace(
    anchor,
    `          {!isSignup && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void forgotPassword()}
                className="text-muted-foreground hover:text-foreground text-xs transition-colors"
              >
                {t("auth.forgotPassword")}
              </button>
            </div>
          )}

          {forgotSent && (
            <p className="text-muted-foreground text-sm">{t("auth.forgotSent")}</p>
          )}

${anchor}`,
  );
});

/* ══ F. Consentement de rétractation, sur la page d'abonnement ═════════ */

patch("pricing.tsx — consentement § 356 Abs. 5 BGB", F.pricing, (s) => {
  if (s.includes("WithdrawalConsent")) return null;

  let out = s;

  const btnImp = `import { Button } from "@/components/ui/button";`;
  if (!out.includes(btnImp)) return undefined;
  out = out.replace(
    btnImp,
    `${btnImp}\nimport { WithdrawalConsent } from "@/components/consent";`,
  );

  const busyAnchor = `  const busy = checkoutMut.isPending || portalMut.isPending;`;
  if (!out.includes(busyAnchor)) return undefined;
  out = out.replace(
    busyAnchor,
    `${busyAnchor}

  // § 356 Abs. 5 BGB : deux affirmations DISTINCTES, jamais précochées. Les
  // fusionner en une seule case annulerait l'effet — c'est précisément ce que
  // la jurisprudence allemande sanctionne.
  const [consentStart, setConsentStart] = useState(false);
  const [consentLose, setConsentLose] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const consentOk = consentStart && consentLose;`,
  );

  const blockAnchor = `            <div className="mt-auto pt-6">
              {isPaid ? (`;
  if (!out.includes(blockAnchor)) return undefined;
  out = out.replace(
    blockAnchor,
    `            <div className="mt-auto pt-6">
              {!isPaid && (
                <WithdrawalConsent
                  start={consentStart}
                  lose={consentLose}
                  onStart={(v) => {
                    setConsentStart(v);
                    setConsentError(false);
                  }}
                  onLose={(v) => {
                    setConsentLose(v);
                    setConsentError(false);
                  }}
                  error={consentError}
                />
              )}
              {isPaid ? (`,
  );

  const clickAnchor = `                  onClick={() => {
                    setError(null);
                    if (selected) checkoutMut.mutate(selected.priceId);
                  }}`;
  if (!out.includes(clickAnchor)) return undefined;
  out = out.replace(
    clickAnchor,
    `                  onClick={() => {
                    setError(null);
                    // Le bouton reste actif exprès : un bouton mort n'explique
                    // rien, un message rouge sous les cases, si.
                    if (!consentOk) {
                      setConsentError(true);
                      return;
                    }
                    if (selected) checkoutMut.mutate(selected.priceId);
                  }}`,
  );

  return out;
});

/* ══ G. Libellés, dans TOUTES les langues ══════════════════════════════ */

// Le type `Messages` est déduit de de.ts. Si une seule langue n'a pas
// exactement les mêmes clés, `tsc` échoue et le déploiement avec. La v1
// n'ajoutait les libellés qu'à l'allemand : c'était un piège.
const AUTH_TEXTS = {
  de: {
    forgotPassword: "Passwort vergessen?",
    forgotSent: "Wenn ein Konto zu dieser Adresse existiert, ist die E-Mail unterwegs.",
    resetTitle: "Neues Passwort setzen",
    newPassword: "Neues Passwort",
    confirmPassword: "Passwort bestätigen",
    passwordTooShort: "Mindestens 8 Zeichen.",
    passwordMismatch: "Die Passwörter stimmen nicht überein.",
    setNewPassword: "Passwort speichern",
    resetDone: "Passwort geändert. Du wirst zur Anmeldung weitergeleitet.",
    resetLinkInvalid: "Dieser Link ist abgelaufen oder wurde bereits verwendet.",
    backToLogin: "Zurück zur Anmeldung",
  },
  fr: {
    forgotPassword: "Mot de passe oublié ?",
    forgotSent: "Si un compte existe pour cette adresse, l'e-mail est parti.",
    resetTitle: "Nouveau mot de passe",
    newPassword: "Nouveau mot de passe",
    confirmPassword: "Confirme le mot de passe",
    passwordTooShort: "Au moins 8 caractères.",
    passwordMismatch: "Les deux mots de passe ne correspondent pas.",
    setNewPassword: "Enregistrer",
    resetDone: "Mot de passe modifié. Redirection vers la connexion…",
    resetLinkInvalid: "Ce lien a expiré ou a déjà servi.",
    backToLogin: "Retour à la connexion",
  },
  en: {
    forgotPassword: "Forgot your password?",
    forgotSent: "If an account exists for this address, the email is on its way.",
    resetTitle: "Set a new password",
    newPassword: "New password",
    confirmPassword: "Confirm password",
    passwordTooShort: "At least 8 characters.",
    passwordMismatch: "The passwords do not match.",
    setNewPassword: "Save password",
    resetDone: "Password changed. Taking you to sign-in…",
    resetLinkInvalid: "This link has expired or was already used.",
    backToLogin: "Back to sign-in",
  },
};

function authLines(locale) {
  const texts = AUTH_TEXTS[locale] ?? AUTH_TEXTS.en;
  return Object.entries(texts)
    .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
    .join("\n");
}

if (!fs.existsSync(F.messages)) {
  failed.push(`libellés — dossier absent : ${path.relative(ROOT, F.messages)}`);
} else {
  const files = fs.readdirSync(F.messages).filter((f) => f.endsWith(".ts"));
  if (files.length === 0) failed.push("libellés — aucun fichier de langue trouvé");

  for (const file of files) {
    const locale = path.basename(file, ".ts");
    patch(`${file} — libellés de réinitialisation`, path.join(F.messages, file), (s) => {
      if (/^\s*resetTitle:/m.test(s)) return null;
      const re = /^(\s*auth:\s*\{)$/m;
      if (!re.test(s)) return undefined;
      return s.replace(re, `$1\n${authLines(locale)}`);
    });
  }
}

/* ══ Bilan ═════════════════════════════════════════════════════════════ */

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);

if (failed.length) {
  console.log("\n⚠️  À faire à la main :");
  for (const f of failed) console.log("   • " + f);
  console.log("\n   Ces fichiers diffèrent de ceux que j'ai analysés. Envoie-les-moi.");
}

console.log(`
👉 Il reste UNE chose que je ne peux pas faire à ta place :

   Sur Railway, ajoute deux variables d'environnement :

     RESEND_API_KEY   ta clé sur resend.com (gratuit jusqu'à 3 000 e-mails/mois)
     MAIL_FROM        par exemple :  TRED <noreply@ton-domaine.de>

   Sans elles, le serveur démarre quand même, mais aucun e-mail ne part :
   tu verras "[mail] RESEND_API_KEY absente" dans les journaux Railway.

👉 Ensuite :  bun run verify
`);
