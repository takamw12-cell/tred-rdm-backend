/**
 * Ajoute à la table `user` les colonnes d'origine d'une inscription
 * (paramètres UTM du lien : quelle vidéo a amené quel compte), sans drizzle-kit.
 *
 * Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script remonte
 * lui-même jusqu'au .env de la racine.
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-utm.mjs
 *
 * Idempotent : une colonne déjà présente est laissée telle quelle. Le relancer
 * ne coûte rien. Tant qu'il n'a pas tourné, l'app reste debout : les
 * inscriptions se passent comme avant, sans origine enregistrée.
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

const [cols] = await pipeline(["SELECT name FROM pragma_table_info('user')"]);
const present = new Set((cols?.response?.result?.rows ?? []).map((r) => r[0]?.value));
if (present.size === 0) {
  console.error("  x  table user introuvable");
  process.exit(1);
}

// Texte libre nettoye par l'app (lettres, chiffres, . _ ~ -), 80 caracteres au plus.
// utm_at : instant de l'enregistrement (ms). NULL = compte sans origine connue.
const COLONNES = [
  ["utm_source", "text"],
  ["utm_medium", "text"],
  ["utm_campaign", "text"],
  ["utm_content", "text"],
  ["utm_term", "text"],
  ["utm_at", "integer"],
];

for (const [nom, type] of COLONNES) {
  if (present.has(nom)) {
    console.log(`  ${nom.padEnd(14)} : deja presente`);
  } else {
    await pipeline([`ALTER TABLE user ADD COLUMN ${nom} ${type}`]);
    console.log(`  ${nom.padEnd(14)} : AJOUTEE`);
  }
}

const [n] = await pipeline(["SELECT count(*) FROM user WHERE utm_at IS NOT NULL"]);
console.log("  comptes avec origine : " + (n?.response?.result?.rows?.[0]?.[0]?.value ?? "0"));
console.log("\n  Termine. Aucun redeploiement necessaire.\n");
