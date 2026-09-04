/**
 * Crée la table `content_report` sur Turso, sans drizzle-kit.
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-content-report.mjs
 *
 * drizzle-kit ne peut pas faire ce travail ici : il passe par esbuild, et ton
 * node_modules contient la version Windows du binaire.
 *
 * Idempotent : IF NOT EXISTS partout. Le relancer ne coûte rien.
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
  `CREATE TABLE IF NOT EXISTS content_report (
     id text PRIMARY KEY NOT NULL,
     user_id text NOT NULL,
     conversation_id text,
     message_id text,
     reason text NOT NULL,
     excerpt text DEFAULT '' NOT NULL,
     note text DEFAULT '' NOT NULL,
     locale text DEFAULT 'de' NOT NULL,
     created_at integer NOT NULL,
     resolved_at integer
   )`,
  `CREATE INDEX IF NOT EXISTS content_report_open_idx ON content_report (resolved_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS content_report_user_idx ON content_report (user_id)`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT count(*) AS n FROM content_report" } },
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

const rows = body.results?.[3]?.response?.result?.rows ?? [];
console.log("  table content_report : OK");
console.log("  deux index           : OK");
console.log("  lignes presentes     : " + (rows[0]?.[0]?.value ?? "0"));
