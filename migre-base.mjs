/**
 * Met la base Turso au niveau du code.
 *
 *     node <chemin>\migre-base.mjs
 *
 * Lançable depuis n'importe où dans le dépôt. Idempotent : chaque étape est
 * conditionnelle, le relancer ne coûte rien et ne casse rien.
 *
 * Ce qu'il applique :
 *
 *   1. `content_report` — la table du signalement des réponses de l'IA.
 *      Exigée par Google Play. Si tu l'as déjà créée, cette étape ne fait rien.
 *
 *   2. `subject` — les Fächer, le niveau entre le semestre et les documents.
 *
 *   3. `document.subject_id` — la colonne qui range un document dans un Fach.
 *      SQLite ne connaît pas ADD COLUMN IF NOT EXISTS : on lit d'abord la
 *      structure de la table, sinon un deuxième passage échouerait.
 *
 * drizzle-kit ne peut pas faire ce travail sur ta machine : il passe par
 * esbuild, et ton node_modules porte le binaire Windows.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function trouverEnv() {
  const departs = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const depart of departs) {
    let d = depart;
    for (let i = 0; i < 8; i++) {
      const c = join(d, ".env");
      if (existsSync(c)) return c;
      const p = dirname(d);
      if (p === d) break;
      d = p;
    }
  }
  return null;
}

const chemin = trouverEnv();
if (!chemin) {
  console.error("\n  x  Aucun .env trouve.\n");
  process.exit(1);
}

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

async function sql(requetes) {
  const res = await fetch(`${url}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      requests: [
        ...requetes.map((s) => ({ type: "execute", stmt: { sql: s } })),
        { type: "close" },
      ],
    }),
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
  const ko = (body.results ?? []).filter((r) => r.type === "error");
  if (ko.length) {
    for (const f of ko) console.error("  x  " + (f.error?.message ?? "erreur"));
    process.exit(1);
  }
  return body.results ?? [];
}

console.log("");

// ── 1 et 2 : les tables ─────────────────────────────────────────────────
await sql([
  `CREATE TABLE IF NOT EXISTS content_report (
     id text PRIMARY KEY NOT NULL,
     user_id text NOT NULL,
     conversation_id text,
     message_id text,
     reason text NOT NULL,
     excerpt text DEFAULT '' NOT NULL,
     note text DEFAULT '' NOT NULL,
     locale text DEFAULT 'de' NOT NULL,
     created_at integer NOT NULL,
     resolved_at integer
   )`,
  `CREATE INDEX IF NOT EXISTS content_report_open_idx ON content_report (resolved_at, created_at)`,
  `CREATE INDEX IF NOT EXISTS content_report_user_idx ON content_report (user_id)`,
  `CREATE TABLE IF NOT EXISTS subject (
     id text PRIMARY KEY NOT NULL,
     user_id text NOT NULL,
     semester_id text NOT NULL,
     name text NOT NULL,
     color text DEFAULT 'slate' NOT NULL,
     position integer DEFAULT 0 NOT NULL,
     created_at integer NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS subject_semester_idx ON subject (semester_id, position)`,
  `CREATE INDEX IF NOT EXISTS subject_user_idx ON subject (user_id)`,
  `CREATE TABLE IF NOT EXISTS job_run (
     key text PRIMARY KEY NOT NULL,
     ran_at integer DEFAULT 0 NOT NULL,
     note text DEFAULT '' NOT NULL
   )`,
]);
console.log("  content_report        OK");
console.log("  subject               OK");
console.log("  job_run               OK");

// ── 3 : la colonne, seulement si elle manque ────────────────────────────
const [colonnes] = await sql([`SELECT name FROM pragma_table_info('document')`]);
const noms = (colonnes?.response?.result?.rows ?? []).map((r) => r[0]?.value);

if (noms.includes("subject_id")) {
  console.log("  document.subject_id   deja presente");
} else {
  await sql([`ALTER TABLE document ADD COLUMN subject_id text`]);
  console.log("  document.subject_id   ajoutee");
}
await sql([
  `CREATE INDEX IF NOT EXISTS document_subject_idx ON document (subject_id)`,
]);
console.log("  document_subject_idx  OK");

// ── Etat ────────────────────────────────────────────────────────────────
const etat = await sql([
  `SELECT count(*) FROM content_report`,
  `SELECT count(*) FROM subject`,
  `SELECT count(*) FROM document`,
  `SELECT count(*) FROM document WHERE subject_id IS NULL`,
]);
const n = (i) => etat[i]?.response?.result?.rows?.[0]?.[0]?.value ?? "?";

console.log(`
  signalements          ${n(0)}
  Facher                ${n(1)}
  documents             ${n(2)}   dont ${n(3)} non classes

  La base correspond maintenant au code. Deploie, puis ouvre un semestre
  dans le tableau de bord : la rangee des Facher est sous les semestres.
`);
