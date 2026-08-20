// Ajoute la colonne `subscription_status` à la table `user_plan`.
// Même méthode que create-push-token.mjs, qui avait fonctionné.
//
// Depuis un dossier neuf (hors du projet, pour éviter le workspace Bun) :
//   mkdir C:\tmp-migr && cd C:\tmp-migr
//   npm init -y && npm install @libsql/client
//   copy C:\dev\tred-rdm\aerostudy-ai\.env .
//   copy <ce fichier> .
//   node --env-file=.env add-subscription-status.mjs

import { createClient } from "@libsql/client";

const url = process.env.DATABASE_URL;
const authToken = process.env.DATABASE_AUTH_TOKEN;

if (!url) {
  console.error("❌ DATABASE_URL manquant. Le .env est-il bien copié ici ?");
  process.exit(1);
}

const db = createClient({ url, authToken });

try {
  const before = await db.execute(`PRAGMA table_info(user_plan)`);
  const has = before.rows.some((r) => r.name === "subscription_status");

  if (has) {
    console.log("✅ La colonne subscription_status existe déjà. Rien à faire.");
  } else {
    // SQLite n'a pas de "ADD COLUMN IF NOT EXISTS" : d'où la vérification
    // au-dessus. Colonne nullable, donc aucune ligne existante n'est touchée.
    await db.execute(`ALTER TABLE user_plan ADD COLUMN subscription_status text`);
    console.log("✅ Colonne subscription_status ajoutée.");
  }

  const after = await db.execute(`PRAGMA table_info(user_plan)`);
  console.log("\nColonnes de user_plan :");
  for (const row of after.rows) console.log(`   - ${row.name} (${row.type})`);

  const rows = await db.execute(`SELECT count(*) AS n FROM user_plan`);
  console.log(`\n${rows.rows[0].n} ligne(s) dans user_plan — aucune donnée modifiée.`);
} catch (err) {
  console.error("\n❌ Échec :", err.message);
  process.exit(1);
} finally {
  db.close();
}
