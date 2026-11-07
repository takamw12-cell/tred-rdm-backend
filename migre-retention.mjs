/**
 * Crée les tables de l'agent de rétention sur Turso :
 *   user_notifications  — boîte de réception de l'étudiant + journal de l'agent
 *   retention_setting   — la pause (l'agent démarre EN PAUSE)
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-retention.mjs
 *
 * Idempotent : IF NOT EXISTS partout, et la ligne « paused » n'est écrite
 * que si elle manque (une pause ou une activation déjà choisie est gardée).
 * Après la migration, rien ne part tant que tu n'as pas cliqué
 * « Agent aktivieren » dans /admin/retention.
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
  `CREATE TABLE IF NOT EXISTS user_notifications (
     id text PRIMARY KEY NOT NULL,
     user_id text NOT NULL,
     kind text NOT NULL,
     title text NOT NULL,
     body text NOT NULL,
     data text DEFAULT '{}' NOT NULL,
     gap_id text,
     reason text DEFAULT '' NOT NULL,
     day_key text NOT NULL,
     channel text DEFAULT 'inbox' NOT NULL,
     push_sent integer DEFAULT 0 NOT NULL,
     status text DEFAULT 'unread' NOT NULL,
     created_at integer NOT NULL,
     opened_at integer,
     responded_at integer
   )`,
  `CREATE INDEX IF NOT EXISTS user_notifications_user_idx ON user_notifications (user_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS user_notifications_day_idx ON user_notifications (user_id, day_key)`,
  `CREATE INDEX IF NOT EXISTS user_notifications_created_idx ON user_notifications (created_at)`,
  `CREATE TABLE IF NOT EXISTS retention_setting (
     key text PRIMARY KEY NOT NULL,
     value text NOT NULL,
     updated_at integer NOT NULL
   )`,
  `INSERT OR IGNORE INTO retention_setting (key, value, updated_at) VALUES ('paused', '1', ${Date.now()})`,
];

const requests = [
  ...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })),
  { type: "execute", stmt: { sql: "SELECT value FROM retention_setting WHERE key = 'paused'" } },
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
const paused = (rows[0]?.[0]?.value ?? "1") === "1";
console.log("  tables user_notifications, retention_setting : OK");
console.log("  index                                        : OK");
console.log("  agent                                        : " + (paused ? "EN PAUSE (active-le dans /admin/retention)" : "ACTIF"));
