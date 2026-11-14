/**
 * Détection de secrets dans le bundle du navigateur. Module pur : le script
 * `check-bundle-secrets.ts` l'applique à `dist/`, les tests à des exemples.
 *
 * Tout ce qui est dans `dist/` est public : n'importe qui peut le télécharger
 * et le lire. Seules les valeurs `VITE_*` (clé PostHog, DSN Sentry, identifiant
 * AdSense…) ont le droit d'y être.
 */

export interface SecretPattern {
  name: string;
  re: RegExp;
}

/** Formes reconnaissables des clés des services utilisés par TRED. */
export const SECRET_PATTERNS: SecretPattern[] = [
  { name: "clé Anthropic", re: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "clé Stripe secrète", re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { name: "secret de webhook Stripe", re: /\bwhsec_[A-Za-z0-9]{16,}/g },
  { name: "clé ElevenLabs", re: /\bsk_[a-f0-9]{40,}\b/g },
  { name: "jeton Replicate", re: /\br8_[A-Za-z0-9]{30,}/g },
  { name: "clé Resend", re: /\bre_[A-Za-z0-9]{6,}_[A-Za-z0-9]{20,}/g },
  { name: "jeton GitHub", re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/g },
  { name: "identifiant de clé AWS / R2", re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "clé privée", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  // Les jetons Turso et Better Auth sont des JWT ; rien de public n'en est un.
  { name: "jeton JWT", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/g },
  { name: "adresse de la base Turso", re: /libsql:\/\/[a-z0-9-]+\.turso\.io/g },
];

export interface Finding {
  name: string;
  /** Les 6 premiers caractères seulement : le rapport ne recopie jamais un secret. */
  excerpt: string;
}

const redact = (s: string) => `${s.slice(0, 6)}…(${s.length} caractères)`;

/** Les secrets reconnaissables par leur forme. */
export function findSecretPatterns(text: string): Finding[] {
  const out: Finding[] = [];
  for (const { name, re } of SECRET_PATTERNS) {
    for (const m of text.matchAll(re)) out.push({ name, excerpt: redact(m[0]) });
  }
  return out;
}

/**
 * Les variables dont la VALEUR ne doit jamais sortir du serveur : tout ce qui
 * n'est pas `VITE_*`, assez long pour ne pas être un simple réglage
 * (« true », « 3000 », « de »).
 */
export function serverOnlyValues(env: Record<string, string | undefined>): Array<{ key: string; value: string }> {
  return Object.entries(env)
    .filter(([key, value]) => !key.startsWith("VITE_") && typeof value === "string" && value.length >= 16 && /(SECRET|TOKEN|KEY|PASSWORD|AUTH|DATABASE_URL|REDIS_URL)/.test(key))
    .map(([key, value]) => ({ key, value: value as string }));
}

/** Les valeurs de variables serveur retrouvées telles quelles dans un texte (on ne rend que leur NOM). */
export function findLeakedValues(text: string, secrets: Array<{ key: string; value: string }>): string[] {
  return secrets.filter((s) => text.includes(s.value)).map((s) => s.key);
}

/** Lit un fichier `.env` (KEY=valeur, guillemets facultatifs). */
export function parseEnvFile(content: string): Record<string, string> {
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}
