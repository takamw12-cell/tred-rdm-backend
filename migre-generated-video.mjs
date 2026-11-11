/**
 * Crée la table `generated_video` sur Turso, sans drizzle-kit — les vidéos
 * explicatives sur mesure du bouton « Als Video erklären » (script validé,
 * voix ElevenLabs, section « Meine Erklärvideos » du tableau de bord).
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-generated-video.mjs
 *
 * Idempotent : IF NOT EXISTS partout. Le relancer ne coûte rien.
 * Tant qu'elle n'a pas tourné, l'app reste debout : la génération répond
 * « not_migrated » et le bouton garde son comportement actuel.
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
  `CREATE TABLE IF NOT EXISTS generated_video (
     id text PRIMARY KEY NOT NULL,
     user_id text NOT NULL,
     chat_id text,
     message_id text,
     title text DEFAULT '' NOT NULL,
     prompt text DEFAULT '' NOT NULL,
     language text DEFAULT 'de' NOT NULL,
     status text DEFAULT 'pending' NOT NULL,
     error text,
     script text,
     audio_key text,
     video_key text,
     duration_ms integer DEFAULT 0 NOT NULL,
     saved integer DEFAULT 0 NOT NULL,
     created_at integer NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS generated_video_user_idx ON generated_video (user_id, created_at)`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT count(*) AS n FROM generated_video" } },
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
console.log("  table generated_video : OK");
console.log("  index                 : OK");
console.log("  lignes presentes      : " + (rows[0]?.[0]?.value ?? "0"));
