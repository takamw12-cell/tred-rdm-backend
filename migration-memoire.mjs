// Crée la table `misconception` dans Turso. SANS dépendance : `fetch` suffit.
//
//   bun --env-file=.env migration-memoire.mjs
//
// Idempotent. Ne touche à aucune donnée existante.

const rawUrl = process.env.DATABASE_URL ?? "";
const token = process.env.DATABASE_AUTH_TOKEN ?? "";

if (!rawUrl) {
  console.error("❌ DATABASE_URL absent. Vérifie le chemin passé à --env-file.");
  process.exit(1);
}
if (rawUrl.startsWith("file:")) {
  console.error(`❌ DATABASE_URL pointe sur un fichier local : ${rawUrl}`);
  console.error("   Utilise le .env qui contient l'URL Turso de production.");
  process.exit(1);
}

const base = rawUrl.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
console.log(`Base : ${base}`);

async function run(statements) {
  const res = await fetch(`${base}/v2/pipeline`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      requests: [
        ...statements.map((sql) => ({ type: "execute", stmt: { sql } })),
        { type: "close" },
      ],
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 400)}`);

  const json = JSON.parse(text);
  // Une erreur SQL arrive dans un HTTP 200. Sans ce contrôle, le script
  // annoncerait un succès alors que rien n'a été créé.
  return (json.results ?? []).map((r, i) =>
    r?.type === "error"
      ? { ok: false, sql: statements[i], message: r.error?.message ?? "erreur inconnue" }
      : { ok: true, rows: r?.response?.result?.rows ?? [] },
  );
}

const cell = (row, i) => row?.[i]?.value ?? row?.[i] ?? null;

try {
  const results = await run([
    `CREATE TABLE IF NOT EXISTS misconception (
       id          text    PRIMARY KEY NOT NULL,
       user_id     text    NOT NULL,
       semester_id text,
       topic       text    NOT NULL DEFAULT 'Allgemein',
       label       text    NOT NULL,
       detail      text    NOT NULL DEFAULT '',
       status      text    NOT NULL DEFAULT 'open',
       times_seen  integer NOT NULL DEFAULT 1,
       first_seen  integer NOT NULL,
       last_seen   integer NOT NULL
     )`,
    // La requête chaude est « les lacunes ouvertes de CET utilisateur » : c'est
    // exactement ce couple de colonnes qu'il faut indexer.
    `CREATE INDEX IF NOT EXISTS misconception_user_status_idx
       ON misconception (user_id, status)`,
  ]);

  const failed = results.find((r) => !r.ok);
  if (failed) throw new Error(failed.message);
  console.log("✅ Table misconception prête.");

  // Vérification par un aller-retour réel. Créer la table ne prouve pas qu'on
  // peut y écrire ni que les valeurs par défaut se comportent comme prévu.
  const now = Date.now();
  const probe = `__probe_${now}`;

  const [ins] = await run([
    `INSERT INTO misconception (id, user_id, label, first_seen, last_seen)
       VALUES ('${probe}', '__probe__', 'Testeintrag', ${now}, ${now})`,
  ]);
  if (!ins.ok) throw new Error(ins.message);

  const [sel] = await run([
    `SELECT status, times_seen, topic FROM misconception WHERE id = '${probe}'`,
  ]);
  if (!sel.ok) throw new Error(sel.message);

  const row = sel.rows?.[0];
  const status = cell(row, 0);
  const times = Number(cell(row, 1));
  const topic = cell(row, 2);

  await run([`DELETE FROM misconception WHERE id = '${probe}'`]);

  if (status !== "open" || times !== 1 || topic !== "Allgemein") {
    throw new Error(
      `valeurs par défaut inattendues : status=${status}, times_seen=${times}, topic=${topic}`,
    );
  }

  console.log("✅ Écriture, lecture et valeurs par défaut vérifiées.");
  console.log("\n👉 Ensuite :  node patch-memoire.mjs");
} catch (err) {
  console.error(`\n❌ ${err.message}`);
  console.error("\n   Rien n'a été laissé à moitié fait : la table est créée ou non.");
  process.exit(1);
}
