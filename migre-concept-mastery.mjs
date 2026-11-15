/**
 * Crée la table `concept_mastery` : le score de maîtrise par concept et par
 * étudiant (modèle de l'apprenant, packages/web/src/api/lib/concept-mastery.ts),
 * sans drizzle-kit.
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-concept-mastery.mjs
 *
 * Idempotent : une table déjà présente est laissée telle quelle. Le relancer
 * ne coûte rien. Tant qu'il n'a pas tourné, l'app reste debout : le tuteur
 * répond comme avant, sans score de maîtrise.
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

async function pipeline(sqls) {
  const requests = [...sqls.map((sql) => ({ type: "execute", stmt: { sql } })), { type: "close" }];
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
  return body.results;
}

// score : 0 a 1 (0,5 = concept pas encore juge). error_patterns : JSON, un
// compteur par type d'erreur ({"einheit":2,"vorzeichen":1}).
// concept_key : le nom normalise — une ligne par concept et par compte.
// Les memes instructions sont rejouees par tests/concept-mastery.test.ts.
const INSTRUCTIONS = [
  `CREATE TABLE IF NOT EXISTS concept_mastery (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    concept TEXT NOT NULL,
    concept_key TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    score REAL NOT NULL DEFAULT 0.5,
    attempts INTEGER NOT NULL DEFAULT 0,
    correct INTEGER NOT NULL DEFAULT 0,
    error_patterns TEXT NOT NULL DEFAULT '{}',
    last_seen INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS concept_mastery_user_key ON concept_mastery (user_id, concept_key)`,
  `CREATE INDEX IF NOT EXISTS concept_mastery_user_score ON concept_mastery (user_id, score)`,
];

await pipeline(INSTRUCTIONS);
console.log("  concept_mastery : table et index en place");

const [n] = await pipeline(["SELECT count(*) FROM concept_mastery"]);
console.log("  lignes : " + (n?.response?.result?.rows?.[0]?.[0]?.value ?? "0"));
console.log("\n  Termine. Aucun redeploiement necessaire.\n");
