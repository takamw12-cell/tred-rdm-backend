/**
 * Ajoute l'essai gratuit de 14 jours à `user_access` sur Turso, sans
 * drizzle-kit : une colonne `trial_ends_at` (millisecondes, NULL = l'essai
 * n'a jamais commencé).
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-trial.mjs
 *
 * Idempotent : la colonne n'est ajoutée que si elle manque. Tant qu'il n'a
 * pas tourné, l'app reste debout : il n'y a simplement pas d'essai, et tout
 * compte non abonné est Free.
 *
 * Les comptes EXISTANTS gardent NULL : ils peuvent lancer leur essai une
 * fois, depuis /pricing ou la fenêtre de limite. Les nouveaux comptes le
 * commencent à l'inscription.
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

if (present.has("trial_ends_at")) {
  console.log("  trial_ends_at       : deja presente");
} else {
  // NULL = l'essai n'a jamais commence.
  await pipeline(["ALTER TABLE user_access ADD COLUMN trial_ends_at integer"]);
  console.log("  trial_ends_at       : AJOUTEE");
}

const [n] = await pipeline([
  `SELECT count(*) FROM user_access WHERE trial_ends_at IS NOT NULL AND trial_ends_at > ${Date.now()}`,
]);
console.log("  essais en cours     : " + (n?.response?.result?.rows?.[0]?.[0]?.value ?? "0"));
console.log("\n  Termine. Aucun redeploiement necessaire.\n");
