/**
 * Crée les tables du parrainage sur Turso, sans drizzle-kit (2026-11-18) :
 *
 *   referral_code   un code par compte (« TRED-7K2QXM »)
 *   referral        un parrain par filleul ; +15 crédits à chacun
 *
 * À part de la table `user`, qui appartient à Better Auth. Voir
 * packages/web/src/api/lib/referral.ts.
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-referral.mjs
 *
 * Idempotent : IF NOT EXISTS partout. Tant qu'il n'est pas lancé, la page
 * « Freunde einladen » dit que le parrainage n'est pas encore disponible.
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
  `CREATE TABLE IF NOT EXISTS referral_code (
     user_id text PRIMARY KEY NOT NULL,
     code text NOT NULL,
     created_at integer NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS referral_code_code_unique ON referral_code (code)`,
  `CREATE TABLE IF NOT EXISTS referral (
     referee_id text PRIMARY KEY NOT NULL,
     referrer_id text NOT NULL,
     created_at integer NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS referral_referrer_idx ON referral (referrer_id)`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT (SELECT count(*) FROM referral_code) AS c, (SELECT count(*) FROM referral) AS r" } },
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
console.log("  table referral_code  : OK");
console.log("  table referral       : OK");
console.log("  codes crees          : " + (rows[0]?.[0]?.value ?? "0"));
console.log("  parrainages          : " + (rows[0]?.[1]?.value ?? "0"));
