/**
 * E-mails « Tipps & Neuigkeiten » (2026-11-19), sur Turso, sans drizzle-kit :
 *
 *   marketing_consent     le consentement : pending → confirmed (double opt-in) → revoked
 *   marketing_email_log   un e-mail de campagne par compte et par campagne
 *
 * Voir packages/web/src/api/lib/marketing.ts.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-marketing.mjs
 *
 * Idempotent : IF NOT EXISTS partout. Avant, la case de l'inscription ne fait
 * rien et aucun e-mail de campagne ne part.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Remonte depuis ce fichier jusqu'au premier .env trouvé. */
function trouverEnv() {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidat = join(dir, ".env");
    if (existsSync(candidat)) return candidat;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const chemin = trouverEnv();
if (!chemin) {
  console.error("\n  x  Aucun .env trouve en remontant depuis le script.\n");
  process.exit(1);
}
console.log("  .env lu depuis " + chemin);

const env = Object.fromEntries(
  readFileSync(chemin, "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = (env.DATABASE_URL ?? "").replace(/^libsql:\/\//, "https://").replace(/\/$/, "");
const token = env.DATABASE_AUTH_TOKEN ?? "";

if (!url) {
  console.error("  x  DATABASE_URL absent du .env");
  process.exit(1);
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS marketing_consent (
     user_id text PRIMARY KEY NOT NULL,
     status text NOT NULL,
     source text NOT NULL,
     requested_at integer NOT NULL,
     confirmed_at integer,
     revoked_at integer
   )`,
  `CREATE TABLE IF NOT EXISTS marketing_email_log (
     id text PRIMARY KEY NOT NULL,
     user_id text NOT NULL,
     campaign text NOT NULL,
     sent_at integer NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS marketing_email_log_user_idx ON marketing_email_log (user_id)`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT (SELECT count(*) FROM marketing_consent WHERE status = 'confirmed') AS c, (SELECT count(*) FROM marketing_email_log) AS r" } },
  { type: "close" },
];

const res = await fetch(`${url}/v2/pipeline`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify({ requests }),
}).catch((e) => {
  console.error("  x  Reseau : " + e.message);
  process.exit(1);
});

if (!res.ok) {
  console.error(`  x  Turso a repondu ${res.status}`);
  console.error((await res.text()).slice(0, 400));
  process.exit(1);
}

const body = await res.json();
const failed = (body.results ?? []).filter((r) => r.type === "error");
if (failed.length > 0) {
  for (const f of failed) console.error("  x  " + (f.error?.message ?? "erreur"));
  process.exit(1);
}

const rows = body.results?.[STATEMENTS.length]?.response?.result?.rows ?? [];
console.log("  table marketing_consent   : OK");
console.log("  table marketing_email_log : OK");
console.log("  consentements confirmes   : " + (rows[0]?.[0]?.value ?? "0"));
console.log("  e-mails de campagne       : " + (rows[0]?.[1]?.value ?? "0"));
