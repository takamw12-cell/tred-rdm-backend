/**
 * Documents et conversations liés au module (Fach) choisi en haut du Hörsaal.
 * Sans drizzle-kit. Lançable depuis N'IMPORTE QUEL dossier du dépôt : le script
 * remonte lui-même jusqu'au .env de la racine.
 *
 * ÉTAPE 1 — schéma. Toujours faite, idempotente :
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-documents-contexte.mjs
 *
 *   Ajoute `chat_conversation.subject_id` : le module sous lequel une
 *   conversation a été tenue. C'est ce qui donne SA session à chaque module
 *   (packages/web/src/api/lib/chat-sessions.ts). Tant que la colonne manque,
 *   l'app reste debout : un module ouvre simplement un tableau vide.
 *   La table `document` a déjà `semester_id` et `subject_id` : rien à y ajouter.
 *
 * ÉTAPE 2 — données. Seulement si on la demande :
 *
 *     node migre-documents-contexte.mjs --module=ELT --email=toi@exemple.de
 *     node migre-documents-contexte.mjs --module=ELT --email=toi@exemple.de --appliquer
 *
 *   Range dans le module nommé les documents de CE compte qui n'ont pas encore
 *   de module, dans le semestre de ce module. Sans `--appliquer` : l'aperçu
 *   seulement (la liste, rien n'est écrit). Options :
 *
 *     --semestre="Semestre 1"   si deux semestres ont un module du même nom
 *     --sans-semestre           prendre aussi les documents sans semestre
 *     --compte=admin            à la place de --email : la première adresse
 *                               de ADMIN_EMAILS dans le .env
 *
 *   Le compte n'est jamais deviné : sans adresse, l'étape 2 refuse. Un module
 *   « ELT » peut exister chez d'autres étudiants ; leurs documents ne sont ni
 *   lus ni touchés. Les documents déjà rangés dans un module ne bougent pas.
 *   Pour défaire : le Dashboard (« In ein Fach verschieben … »).
 *
 * Les deux fonctions sont rejouées sur une vraie base par
 * packages/web/tests/migre-documents-contexte.test.ts.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** `--module=ELT --semestre=Semestre 1 --email=… --sans-semestre --appliquer` */
export function lireArguments(argv) {
  const valeur = (nom) => {
    const arg = argv.find((a) => a.startsWith(`--${nom}=`));
    const v = arg ? arg.slice(nom.length + 3).trim().replace(/^["']|["']$/g, "") : "";
    return v || null;
  };
  return {
    module: valeur("module"),
    semestre: valeur("semestre"),
    email: valeur("email"),
    sansSemestre: argv.includes("--sans-semestre"),
    appliquer: argv.includes("--appliquer"),
  };
}

/**
 * Étape 1. `run(sql, params)` exécute une requête et rend `{ rows, changes }`.
 * Rend « ajoutee » ou « deja_la ».
 */
export async function ajouterColonneModule(run, log = console.log) {
  const { rows } = await run("SELECT name FROM pragma_table_info('chat_conversation')");
  if (rows.some((r) => r.name === "subject_id")) {
    log("  chat_conversation.subject_id : deja en place");
    return "deja_la";
  }
  await run("ALTER TABLE chat_conversation ADD COLUMN subject_id TEXT");
  log("  chat_conversation.subject_id : colonne ajoutee");
  return "ajoutee";
}

/**
 * Étape 2. Rend `{ statut, documents }` :
 *   email_requis · compte_introuvable · module_introuvable · ambigu · apercu · fait
 */
export async function rangerDocuments(run, options, log = console.log) {
  const nom = (options.module ?? "").trim();
  const email = (options.email ?? "").trim();
  if (!nom) return { statut: "module_requis", documents: 0 };
  if (!email) {
    log("  x  Etape 2 : il faut dire QUEL compte (--email=... ou --compte=admin). Rien n'a ete lu ni ecrit.");
    return { statut: "email_requis", documents: 0 };
  }

  const comptes = await run("SELECT id FROM user WHERE lower(email) = lower(?)", [email]);
  if (comptes.rows.length !== 1) {
    log("  x  Aucun compte avec cette adresse. Rien n'a ete ecrit.");
    return { statut: "compte_introuvable", documents: 0 };
  }
  const userId = comptes.rows[0].id;

  // Les modules de CE compte qui portent ce nom (et, si demandé, de ce semestre).
  const modules = await run(
    `SELECT s.id, s.semester_id, s.name, sem.name AS semestre
       FROM subject s LEFT JOIN semester sem ON sem.id = s.semester_id
      WHERE s.user_id = ? AND lower(s.name) = lower(?)${options.semestre ? " AND lower(sem.name) = lower(?)" : ""}`,
    options.semestre ? [userId, nom, options.semestre] : [userId, nom],
  );
  if (modules.rows.length === 0) {
    const tous = await run(
      "SELECT s.name, sem.name AS semestre FROM subject s LEFT JOIN semester sem ON sem.id = s.semester_id WHERE s.user_id = ? ORDER BY sem.name, s.name",
      [userId],
    );
    log(`  x  Aucun module « ${nom} » pour ce compte. Rien n'a ete ecrit.`);
    log(tous.rows.length ? "     Modules de ce compte : " + tous.rows.map((m) => `${m.name} (${m.semestre ?? "sans semestre"})`).join(", ") : "     Ce compte n'a encore aucun module : creez-le d'abord dans le Dashboard.");
    return { statut: "module_introuvable", documents: 0 };
  }
  if (modules.rows.length > 1) {
    log(`  x  ${modules.rows.length} modules « ${nom} » pour ce compte : ` + modules.rows.map((m) => m.semestre ?? "sans semestre").join(", "));
    log('     Precisez lequel : --semestre="..."  Rien n\'a ete ecrit.');
    return { statut: "ambigu", documents: 0 };
  }
  const cible = modules.rows[0];

  // Les documents sans module de ce compte, dans le semestre du module.
  const portee = options.sansSemestre ? "(semester_id = ? OR semester_id IS NULL)" : "semester_id = ?";
  const params = [userId, cible.semester_id];
  const documents = await run(`SELECT title FROM document WHERE user_id = ? AND subject_id IS NULL AND ${portee} ORDER BY created_at`, params);

  log(`  Module « ${cible.name} » (${cible.semestre ?? "sans semestre"}) — documents sans module a y ranger : ${documents.rows.length}`);
  for (const d of documents.rows) log("     - " + d.title);
  if (!options.sansSemestre) {
    const orphelins = await run("SELECT count(*) AS n FROM document WHERE user_id = ? AND subject_id IS NULL AND semester_id IS NULL", [userId]);
    const n = Number(orphelins.rows[0]?.n ?? 0);
    if (n > 0) log(`     (${n} document(s) sans semestre ne sont pas pris ; ajoutez --sans-semestre pour les ranger aussi)`);
  }

  if (!options.appliquer) {
    log("  Apercu seulement : rien n'a ete ecrit. Relancez avec --appliquer pour ranger ces documents.");
    return { statut: "apercu", documents: documents.rows.length };
  }
  // Le semestre du module est écrit aussi : un document sans semestre le rejoint.
  const ecrit = await run(`UPDATE document SET subject_id = ?, semester_id = ? WHERE user_id = ? AND subject_id IS NULL AND ${portee}`, [cible.id, cible.semester_id, ...params]);
  log(`  Fait : ${ecrit.changes} document(s) ranges dans « ${cible.name} ».`);
  return { statut: "fait", documents: Number(ecrit.changes ?? 0) };
}

/* ── Ligne de commande ─────────────────────────────────────────────────── */

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

async function main() {
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

  /** Une requête paramétrée par l'API HTTP de Turso → `{ rows: [{colonne: valeur}], changes }`. */
  async function run(sql, params = []) {
    const args = params.map((v) => (v === null || v === undefined ? { type: "null" } : { type: "text", value: String(v) }));
    const res = await fetch(`${url}/v2/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ requests: [{ type: "execute", stmt: { sql, args } }, { type: "close" }] }),
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
    const first = (body.results ?? [])[0];
    if (!first || first.type === "error") {
      console.error("  x  " + (first?.error?.message ?? "erreur"));
      process.exit(1);
    }
    const result = first.response?.result ?? {};
    const cols = (result.cols ?? []).map((c) => c.name);
    const rows = (result.rows ?? []).map((r) => Object.fromEntries(r.map((cell, i) => [cols[i], cell?.value ?? null])));
    return { rows, changes: Number(result.affected_row_count ?? 0) };
  }

  const argv = process.argv.slice(2);
  const options = lireArguments(argv);
  // --compte=admin : l'adresse n'est pas tapée, elle vient du .env.
  if (!options.email && argv.includes("--compte=admin")) {
    options.email = (env.ADMIN_EMAILS ?? "").split(",")[0]?.trim() || null;
    if (!options.email) console.log("  (--compte=admin : ADMIN_EMAILS absent du .env)");
  }

  console.log("\n  Etape 1 — schema");
  await ajouterColonneModule(run);

  if (!options.module) {
    console.log("\n  Etape 2 non demandee (ajoutez --module=... --email=... pour ranger des documents existants).");
    console.log("\n  Termine. Aucun redeploiement necessaire.\n");
    return;
  }
  console.log("\n  Etape 2 — documents sans module");
  const fin = await rangerDocuments(run, options);
  console.log(fin.statut === "fait" || fin.statut === "apercu" ? "\n  Termine. Aucun redeploiement necessaire.\n" : "\n  Etape 2 non faite (voir ci-dessus).\n");
}

// Lancé directement (et non importé par les tests) : on exécute.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
