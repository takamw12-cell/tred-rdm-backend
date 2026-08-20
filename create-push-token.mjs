// Crée la table `push_token` dans Turso, sans passer par drizzle-kit.
// Équivalent exact de ce que `drizzle-kit push` aurait généré pour le schéma
// défini dans packages/web/src/api/database/schema.ts.
//
// Lancer depuis la racine du projet :
//   bun --env-file=.env create-push-token.mjs

import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url) {
  console.error("❌ DATABASE_URL manquant. Le fichier .env est-il bien à la racine ?");
  process.exit(1);
}

console.log("→ Connexion à", url.replace(/\/\/.*@/, "//"));

const db = createClient({ url, authToken });

try {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS push_token (
      token        text    PRIMARY KEY NOT NULL,
      user_id      text    NOT NULL,
      platform     text    NOT NULL,
      device_name  text,
      app_version  text,
      created_at   integer NOT NULL,
      updated_at   integer NOT NULL
    )
  `);

  await db.execute(
    `CREATE INDEX IF NOT EXISTS push_token_user_id_idx ON push_token (user_id)`,
  );

  // Vérification : on relit la structure réellement présente en base.
  const info = await db.execute(`PRAGMA table_info(push_token)`);

  if (info.rows.length === 0) {
    console.error("❌ La table n'a pas été créée.");
    process.exit(1);
  }

  console.log("\n✅ Table push_token en place. Colonnes :");
  for (const row of info.rows) {
    console.log(`   - ${row.name} (${row.type})`);
  }

  // Contrôle de bon sens : les tables existantes n'ont pas été touchées.
  const tables = await db.execute(
    `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
  );
  console.log("\nTables présentes :", tables.rows.map((r) => r.name).join(", "));
  console.log("\nTerminé. Tu peux passer à Railway.");
} catch (err) {
  console.error("\n❌ Échec :", err.message);
  process.exit(1);
} finally {
  db.close();
}
