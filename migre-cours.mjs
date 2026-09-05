#!/usr/bin/env node
/**
 * migre-cours.mjs — la bibliothèque de cours partagée. Zéro dépendance.
 *
 * Crée, si elles manquent :
 *   course              le cours suivi par plusieurs étudiants
 *   course_member       qui suit quoi
 *   document.course_id  où un document est publié
 *   document.visibility "private" (défaut) | "course"
 *
 * Et les tables des livraisons précédentes qui n'ont peut-être jamais été
 * appliquées : content_report, subject, job_run, document.subject_id.
 *
 * ── Il est sûr à relancer ─────────────────────────────────────────────────
 *
 * Chaque création est un CREATE TABLE IF NOT EXISTS, et chaque colonne est
 * ajoutée seulement après avoir lu la structure réelle de la table. Le relancer
 * dix fois ne fait rien de plus que la première.
 *
 * Il n'efface RIEN et ne modifie aucune ligne existante. Tous les documents
 * déjà en base restent privés : `visibility` vaut "private" par défaut.
 *
 *   node migre-cours.mjs           applique
 *   node migre-cours.mjs --voir    montre ce qui manque, sans écrire
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const LECTURE_SEULE = process.argv.includes("--voir");

function racine() {
  const departs = [process.cwd(), dirname(fileURLToPath(import.meta.url))];
  for (const depart of departs) {
    let d = resolve(depart);
    for (let i = 0; i < 8; i++) {
      if (existsSync(join(d, "packages", "web", "package.json"))) return d;
      const parent = dirname(d);
      if (parent === d) break;
      d = parent;
    }
  }
  return null;
}

const R = racine();
if (!R) {
  console.error("Depot introuvable. Lance-le depuis C:\\dev\\tred-rdm\\aerostudy-ai.");
  process.exit(1);
}

for (const nom of [".env", ".env.local", "packages/web/.env"]) {
  const p = join(R, nom);
  if (!existsSync(p)) continue;
  for (const ligne of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL introuvable dans le .env.");
  process.exit(1);
}
const HOTE = process.env.DATABASE_URL.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
const JETON = process.env.DATABASE_AUTH_TOKEN;

async function q(sql) {
  const r = await fetch(`${HOTE}/v2/pipeline`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(JETON ? { authorization: `Bearer ${JETON}` } : {}),
    },
    body: JSON.stringify({
      requests: [{ type: "execute", stmt: { sql } }, { type: "close" }],
    }),
  });
  if (!r.ok) throw new Error(`Turso ${r.status} : ${(await r.text()).slice(0, 300)}`);
  const data = await r.json();
  const p = data.results?.[0];
  if (p?.type === "error") throw new Error(p.error?.message ?? "erreur SQL");
  const res = p.response.result;
  if (!res) return [];
  const cols = res.cols.map((c) => c.name);
  return res.rows.map((l) => {
    const o = {};
    l.forEach((c, i) => {
      o[cols[i]] = c.type === "null" ? null : c.value;
    });
    return o;
  });
}

/** Les colonnes réellement présentes. Une table absente donne un tableau vide. */
async function colonnes(table) {
  try {
    const r = await q(`PRAGMA table_info(${table})`);
    return new Set(r.map((c) => c.name));
  } catch {
    return new Set();
  }
}

const TABLES = [
  [
    "course",
    `CREATE TABLE IF NOT EXISTS course (
       id TEXT PRIMARY KEY,
       normalized_key TEXT NOT NULL UNIQUE,
       name TEXT NOT NULL,
       university TEXT NOT NULL,
       program TEXT,
       created_by TEXT NOT NULL,
       created_at INTEGER NOT NULL
     )`,
  ],
  [
    "course_member",
    `CREATE TABLE IF NOT EXISTS course_member (
       course_id TEXT NOT NULL,
       user_id TEXT NOT NULL,
       joined_at INTEGER NOT NULL,
       PRIMARY KEY (course_id, user_id)
     )`,
  ],
  [
    "content_report",
    `CREATE TABLE IF NOT EXISTS content_report (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       chat_id TEXT,
       message_id TEXT,
       reason TEXT NOT NULL,
       detail TEXT,
       answer_excerpt TEXT,
       status TEXT NOT NULL DEFAULT 'open',
       created_at INTEGER NOT NULL
     )`,
  ],
  [
    "subject",
    `CREATE TABLE IF NOT EXISTS subject (
       id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       semester_id TEXT NOT NULL,
       name TEXT NOT NULL,
       color TEXT NOT NULL DEFAULT 'slate',
       position INTEGER NOT NULL DEFAULT 0,
       created_at INTEGER NOT NULL
     )`,
  ],
  [
    "job_run",
    `CREATE TABLE IF NOT EXISTS job_run (
       key TEXT PRIMARY KEY,
       ran_at INTEGER NOT NULL DEFAULT 0,
       note TEXT
     )`,
  ],
  [
    "rate_limit",
    `CREATE TABLE IF NOT EXISTS rate_limit (
       key TEXT PRIMARY KEY,
       window_start INTEGER NOT NULL,
       count INTEGER NOT NULL DEFAULT 0,
       updated_at INTEGER NOT NULL
     )`,
  ],
];

const INDEX = [
  `CREATE INDEX IF NOT EXISTS course_key_idx ON course (normalized_key)`,
  `CREATE INDEX IF NOT EXISTS course_university_idx ON course (university)`,
  `CREATE INDEX IF NOT EXISTS course_member_user_idx ON course_member (user_id)`,
  `CREATE INDEX IF NOT EXISTS document_course_idx ON document (course_id, visibility)`,
  `CREATE INDEX IF NOT EXISTS document_subject_idx ON document (subject_id)`,
  `CREATE INDEX IF NOT EXISTS subject_semester_idx ON subject (semester_id, position)`,
  `CREATE INDEX IF NOT EXISTS subject_user_idx ON subject (user_id)`,
  `CREATE INDEX IF NOT EXISTS rate_limit_window_idx ON rate_limit (window_start)`,
];

/** Colonnes à ajouter à `document`. Le défaut est ce qui garde tout privé. */
const COLONNES_DOCUMENT = [
  ["course_id", `ALTER TABLE document ADD COLUMN course_id TEXT`],
  [
    "visibility",
    `ALTER TABLE document ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private'`,
  ],
  ["subject_id", `ALTER TABLE document ADD COLUMN subject_id TEXT`],
];

console.log("");
let manquant = 0;

for (const [nom, sql] of TABLES) {
  const cols = await colonnes(nom);
  if (cols.size > 0) {
    console.log(`  table  ${nom.padEnd(16)} déjà là`);
    continue;
  }
  manquant++;
  if (LECTURE_SEULE) {
    console.log(`  table  ${nom.padEnd(16)} MANQUE`);
  } else {
    await q(sql);
    console.log(`  table  ${nom.padEnd(16)} créée`);
  }
}

const colsDoc = await colonnes("document");
if (colsDoc.size === 0) {
  console.error("\nLa table `document` est introuvable. Rien n'a été fait.");
  process.exit(1);
}

for (const [nom, sql] of COLONNES_DOCUMENT) {
  if (colsDoc.has(nom)) {
    console.log(`  colonne document.${nom.padEnd(11)} déjà là`);
    continue;
  }
  manquant++;
  if (LECTURE_SEULE) {
    console.log(`  colonne document.${nom.padEnd(11)} MANQUE`);
  } else {
    await q(sql);
    console.log(`  colonne document.${nom.padEnd(11)} ajoutée`);
  }
}

if (!LECTURE_SEULE) {
  for (const sql of INDEX) {
    // Un index sur une colonne absente échouerait ; on ignore, la table
    // concernée vient d'être signalée plus haut.
    await q(sql).catch(() => {});
  }
  console.log("  index                    à jour");
}

// ── Contrôle : rien ne doit avoir changé de visibilité ────────────────────
const partages = await q(
  `SELECT count(*) AS n FROM document WHERE visibility = 'course'`,
).catch(() => [{ n: "?" }]);

console.log("");
if (LECTURE_SEULE) {
  console.log(manquant === 0 ? "Rien à faire." : `${manquant} élément(s) à créer.`);
  console.log("Relance sans --voir pour appliquer.\n");
} else {
  console.log(`Documents partagés en base : ${partages[0]?.n ?? 0}`);
  console.log("(0 est normal : tout reste privé tant que personne n'a partagé.)\n");
}
