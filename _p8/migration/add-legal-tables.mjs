// Ajoute la colonne `locale` à user_access et crée la table translation_cache.
//
//   mkdir C:\tmp-migr && cd C:\tmp-migr
//   npm init -y && npm install @libsql/client
//   copy C:\dev\tred-rdm\aerostudy-ai\.env .
//   copy <ce fichier> .
//   node --env-file=.env add-legal-tables.mjs

import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url) {
  console.error("❌ DATABASE_URL manquant. Le .env est-il bien copié ici ?");
  process.exit(1);
}

const db = createClient({ url, authToken });

try {
  // 1. locale dans user_access — PAS dans `user`, qui appartient à Better Auth
  //    et serait réécrite au prochain generate.
  const cols = await db.execute(`PRAGMA table_info(user_access)`);
  if (cols.rows.some((r) => r.name === "locale")) {
    console.log("✅ user_access.locale existe déjà.");
  } else {
    await db.execute(
      `ALTER TABLE user_access ADD COLUMN locale text NOT NULL DEFAULT 'de'`,
    );
    console.log("✅ Colonne user_access.locale ajoutée (défaut 'de').");
  }

  // 2. Cache de traduction.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS translation_cache (
      id              text    PRIMARY KEY NOT NULL,
      source_hash     text    NOT NULL,
      target_locale   text    NOT NULL,
      translated_text text    NOT NULL,
      hits            integer NOT NULL DEFAULT 0,
      created_at      integer NOT NULL
    )
  `);
  await db.execute(`
    CREATE INDEX IF NOT EXISTS translation_cache_hash_idx
      ON translation_cache (source_hash, target_locale)
  `);
  console.log("✅ Table translation_cache prête.");

  const info = await db.execute(`PRAGMA table_info(user_access)`);
  console.log("\nColonnes de user_access :");
  for (const row of info.rows) console.log(`   - ${row.name} (${row.type})`);

  const tables = await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
  );
  console.log("\nTables :", tables.rows.map((r) => r.name).join(", "));
  console.log("\nTerminé. Aucune donnée existante modifiée.");
} catch (err) {
  console.error("\n❌ Échec :", err.message);
  process.exit(1);
} finally {
  db.close();
}
