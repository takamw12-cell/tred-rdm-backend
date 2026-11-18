/**
 * Crée la table `study_day` sur Turso, sans drizzle-kit — la série de jours
 * d'étude (« flamme » du tableau de bord, 2026-11-18) :
 *
 *   study_day   une ligne par compte et par jour civil de Berlin où une
 *               question a été posée au tuteur. La série est recalculée à la
 *               lecture (packages/web/src/api/lib/streak.ts).
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-streak.mjs
 *
 * Idempotent : IF NOT EXISTS partout. Le relancer ne coûte rien. Tant qu'il
 * n'est pas lancé, la flamme affiche 0 et rien ne tombe.
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
  `CREATE TABLE IF NOT EXISTS study_day (
     user_id text NOT NULL,
     day text NOT NULL,
     created_at integer NOT NULL,
     PRIMARY KEY (user_id, day)
   )`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT count(*) AS n FROM study_day" } },
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
console.log("  table study_day      : OK");
console.log("  jours enregistres    : " + (rows[0]?.[0]?.value ?? "0"));
