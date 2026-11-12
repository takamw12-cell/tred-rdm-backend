/**
 * Referme le partage de cours en base (décision du 12 nov. 2026, UrhG).
 *
 * Tous les documents encore publiés dans un cours (`visibility = "course"`)
 * redeviennent privés. Le code ne lit déjà plus cette colonne : chaque
 * étudiant ne voit que ses propres documents. Ce script met la base en
 * accord avec le code, pour qu'aucune ligne ne reste « publiée ».
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-documents-prives.mjs
 *
 * Idempotent : le relancer ne change plus rien. Les tables `course`,
 * `course_member` et `semester_share` ne sont PAS touchées (elles serviront
 * plus tard). `course_id` est conservé sur les documents.
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

const compter = async () => {
  const [r] = await pipeline(["SELECT count(*) FROM document WHERE visibility = 'course'"]);
  return Number(r?.response?.result?.rows?.[0]?.[0]?.value ?? 0);
};

const avant = await compter();
console.log("  documents encore partages : " + avant);
if (avant > 0) {
  await pipeline(["UPDATE document SET visibility = 'private' WHERE visibility = 'course'"]);
  console.log("  repasses en prive         : " + avant);
}
const apres = await compter();
if (apres !== 0) {
  console.error("  x  il reste " + apres + " document(s) partages");
  process.exit(1);
}
console.log("  documents partages restants: 0");
console.log("\n  Termine. Aucun redeploiement necessaire.\n");
