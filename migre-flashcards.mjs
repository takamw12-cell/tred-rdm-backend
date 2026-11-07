/**
 * Crée la table `flashcard` sur Turso, sans drizzle-kit — les Karteikarten
 * de la répétition espacée (V2, Pilier 1 : page /flashcards, bloc « Heute zu
 * wiederholen » du tableau de bord).
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-flashcards.mjs
 *
 * Idempotent : IF NOT EXISTS partout. Le relancer ne coûte rien.
 * Tant qu'elle n'a pas tourné, l'app reste debout : le bloc du tableau de
 * bord est masqué et la génération répond « not_migrated ».
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
  `CREATE TABLE IF NOT EXISTS flashcard (
     id text PRIMARY KEY NOT NULL,
     user_id text NOT NULL,
     front_content text NOT NULL,
     back_content text NOT NULL,
     topic text DEFAULT '' NOT NULL,
     source_type text DEFAULT 'manual' NOT NULL,
     source_id text,
     source_label text DEFAULT '' NOT NULL,
     next_review_date integer NOT NULL,
     interval_days integer DEFAULT 0 NOT NULL,
     ease_factor real DEFAULT 2.5 NOT NULL,
     reviews integer DEFAULT 0 NOT NULL,
     lapses integer DEFAULT 0 NOT NULL,
     last_reviewed_at integer,
     created_at integer NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS flashcard_due_idx ON flashcard (user_id, next_review_date)`,
  `CREATE INDEX IF NOT EXISTS flashcard_source_idx ON flashcard (user_id, source_type, source_id)`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT count(*) AS n FROM flashcard" } },
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
console.log("  table flashcard      : OK");
console.log("  deux index           : OK");
console.log("  lignes presentes     : " + (rows[0]?.[0]?.value ?? "0"));
