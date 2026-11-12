/**
 * Ajoute le profil d'études à `user_access` sur Turso, sans drizzle-kit :
 * filière, Hochschule, semestre, niveau. Le style d'apprentissage
 * (`learning_style`) y est déjà.
 *
 * Jusqu'ici ce profil ne vivait que dans le navigateur : un étudiant qui
 * changeait d'appareil le perdait.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-profil-complet.mjs
 *
 * Idempotent : chaque colonne n'est ajoutée que si elle manque. Le relancer
 * ne coûte rien. Tant qu'il n'a pas tourné, l'app reste debout : le profil
 * reste simplement dans le navigateur, comme avant.
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

const [cols] = await pipeline(["SELECT name FROM pragma_table_info('user_access')"]);
const present = new Set((cols?.response?.result?.rows ?? []).map((r) => r[0]?.value));
if (present.size === 0) {
  console.error("  x  table user_access introuvable");
  process.exit(1);
}

const COLUMNS = [
  ["studiengang", "text DEFAULT '' NOT NULL"],
  ["universitaet", "text DEFAULT '' NOT NULL"],
  ["semester", "text DEFAULT '' NOT NULL"],
  ["niveau", "text DEFAULT '' NOT NULL"],
  // NULL = l'etudiant n'a encore rien enregistre cote serveur.
  ["profile_updated_at", "integer"],
];

for (const [name, type] of COLUMNS) {
  if (present.has(name)) {
    console.log("  " + name.padEnd(20) + ": deja presente");
  } else {
    await pipeline([`ALTER TABLE user_access ADD COLUMN ${name} ${type}`]);
    console.log("  " + name.padEnd(20) + ": AJOUTEE");
  }
}

const [n] = await pipeline(["SELECT count(*) FROM user_access WHERE profile_updated_at IS NOT NULL"]);
console.log("  profils enregistres : " + (n?.response?.result?.rows?.[0]?.[0]?.value ?? "0"));
console.log("\n  Termine. Aucun redeploiement necessaire.\n");
