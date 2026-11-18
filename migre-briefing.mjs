/**
 * Crée les tables `daily_briefing` et `exam_date` sur Turso, sans drizzle-kit —
 * la carte « Dein Briefing » du tableau de bord (2026-11-18) :
 *
 *   daily_briefing   le briefing du jour, gardé : une ligne par compte. C'est
 *                    le cache qui évite d'appeler le modèle à chaque ouverture.
 *   exam_date        les dates d'examen saisies (« Klausur hinzufügen »).
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-briefing.mjs
 *
 * Idempotent : IF NOT EXISTS partout. Le relancer ne coûte rien.
 * Tant qu'il n'a pas tourné, l'app reste debout : la carte s'affiche avec les
 * phrases du code, sans cache — donc sans appel au modèle — et sans le bouton
 * « Klausur hinzufügen ».
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
  `CREATE TABLE IF NOT EXISTS daily_briefing (
     user_id text PRIMARY KEY NOT NULL,
     day text NOT NULL,
     locale text DEFAULT 'de' NOT NULL,
     kind text NOT NULL,
     exam_key text DEFAULT '' NOT NULL,
     payload text DEFAULT '{}' NOT NULL,
     text text,
     model_calls integer DEFAULT 0 NOT NULL,
     refreshes integer DEFAULT 0 NOT NULL,
     updated_at integer NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS exam_date (
     id text PRIMARY KEY NOT NULL,
     user_id text NOT NULL,
     subject text NOT NULL,
     exam_day text NOT NULL,
     created_at integer NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS exam_date_user_idx ON exam_date (user_id, exam_day)`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT (SELECT count(*) FROM daily_briefing) AS b, (SELECT count(*) FROM exam_date) AS e" } },
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
console.log("  table daily_briefing : OK");
console.log("  table exam_date      : OK");
console.log("  index                : OK");
console.log("  briefings gardes     : " + (rows[0]?.[0]?.value ?? "0"));
console.log("  examens saisis       : " + (rows[0]?.[1]?.value ?? "0"));
