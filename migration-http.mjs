// Migration de la langue — SANS aucune dépendance.
//
//   bun --env-file=.env migration-http.mjs
//
// Pourquoi cette version : `@libsql/client` refuse de se résoudre dans ton
// workspace Bun. Turso expose une API HTTP, et `fetch` est intégré au moteur.
// Zéro module à installer, zéro problème d'arbre de dépendances.
//
// Idempotent : relançable sans risque, il ne touche à aucune donnée existante.

const rawUrl = process.env.DATABASE_URL ?? "";
const token = process.env.DATABASE_AUTH_TOKEN ?? "";

if (!rawUrl) {
  console.error("❌ DATABASE_URL absent.");
  console.error("   Vérifie le chemin passé à --env-file.");
  process.exit(1);
}

if (rawUrl.startsWith("file:")) {
  console.error("❌ DATABASE_URL pointe sur un fichier local, pas sur Turso.");
  console.error(`   ${rawUrl}`);
  console.error("   Ce script parle à Turso par HTTP. Vérifie ton .env.");
  process.exit(1);
}

// libsql://xxx.turso.io  →  https://xxx.turso.io
const base = rawUrl.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");
console.log(`Base : ${base}`);
if (!token) console.log("⚠️  DATABASE_AUTH_TOKEN absent — Turso refusera sûrement.");

/** Exécute une liste d'instructions SQL en un seul aller-retour. */
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

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} — ${text.slice(0, 400)}`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Réponse illisible : ${text.slice(0, 200)}`);
  }

  // Chaque instruction a son propre résultat. Une erreur au milieu ne se voit
  // PAS dans le code HTTP — elle est dans le corps. Sans ce contrôle, le
  // script annoncerait un succès alors que rien n'a été fait.
  const results = json.results ?? [];
  return results.map((r, i) => {
    if (r?.type === "error") {
      return { ok: false, sql: statements[i], message: r.error?.message ?? "erreur inconnue" };
    }
    return { ok: true, sql: statements[i], rows: r?.response?.result?.rows ?? [] };
  });
}

try {
  /* ── 1. La colonne locale ───────────────────────────────────────────── */
  // Volontairement dans user_access et NON dans `user` : cette dernière
  // appartient à Better Auth, dont le générateur de schéma la réécrit.

  const [info] = await run(["PRAGMA table_info(user_access)"]);
  if (!info.ok) throw new Error(`user_access illisible : ${info.message}`);

  const columns = info.rows.map((row) =>
    String(row[1]?.value ?? row[1] ?? "").toLowerCase(),
  );

  if (columns.includes("locale")) {
    console.log("✅ user_access.locale existe déjà.");
  } else {
    const [add] = await run([
      "ALTER TABLE user_access ADD COLUMN locale text NOT NULL DEFAULT 'de'",
    ]);
    if (!add.ok) throw new Error(`Ajout de la colonne : ${add.message}`);
    console.log("✅ Colonne user_access.locale ajoutée (défaut 'de').");
  }

  /* ── 2. Le cache de traduction ──────────────────────────────────────── */

  const cache = await run([
    `CREATE TABLE IF NOT EXISTS translation_cache (
       id              text    PRIMARY KEY NOT NULL,
       source_hash     text    NOT NULL,
       target_locale   text    NOT NULL,
       translated_text text    NOT NULL,
       hits            integer NOT NULL DEFAULT 0,
       created_at      integer NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS translation_cache_hash_idx
       ON translation_cache (source_hash, target_locale)`,
  ]);

  const failed = cache.find((r) => !r.ok);
  if (failed) throw new Error(`translation_cache : ${failed.message}`);
  console.log("✅ Table translation_cache prête.");

  /* ── 3. Relecture ───────────────────────────────────────────────────── */

  const [after] = await run(["PRAGMA table_info(user_access)"]);
  if (after.ok) {
    const names = after.rows.map((row) => String(row[1]?.value ?? row[1] ?? ""));
    console.log(`\nColonnes de user_access : ${names.join(", ")}`);
  }

  console.log("\nTerminé. Aucune donnée existante modifiée.");
} catch (error) {
  console.error(`\n❌ Échec : ${error.message}`);
  console.error("\nSi c'est une erreur 401 : DATABASE_AUTH_TOKEN est absent ou périmé.");
  console.error("Si c'est une erreur 404 : vérifie DATABASE_URL.");
  process.exit(1);
}
