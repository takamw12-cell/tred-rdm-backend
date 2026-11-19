/**
 * « Dein Professor » et cache des voix, sur Turso, sans drizzle-kit (2026-11-19) :
 *
 *   professor_custom   prénom et voix choisis par l'étudiant
 *   tts_cache          où est rangé chaque extrait audio déjà payé
 *
 * Voir packages/web/src/api/lib/professor-custom.ts et api/tts/cache.ts.
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt :
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-prof-perso.mjs
 *
 * Idempotent : IF NOT EXISTS partout. Tant qu'il n'est pas lancé, l'écran
 * « Dein Professor » dit que la fonction arrive, et les voix ne sont gardées
 * qu'en mémoire du serveur.
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
  `CREATE TABLE IF NOT EXISTS professor_custom (
     user_id text PRIMARY KEY NOT NULL,
     name text,
     voice text,
     updated_at integer NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS tts_cache (
     key text PRIMARY KEY NOT NULL,
     voice_id text NOT NULL,
     chars integer NOT NULL,
     bytes integer NOT NULL,
     object_key text NOT NULL,
     hits integer DEFAULT 0 NOT NULL,
     created_at integer NOT NULL,
     last_used_at integer NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS tts_cache_last_used_idx ON tts_cache (last_used_at)`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT (SELECT count(*) FROM professor_custom) AS c, (SELECT count(*) FROM tts_cache) AS r" } },
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
console.log("  table professor_custom : OK");
console.log("  table tts_cache        : OK");
console.log("  professeurs nommes     : " + (rows[0]?.[0]?.value ?? "0"));
console.log("  extraits audio ranges  : " + (rows[0]?.[1]?.value ?? "0"));
