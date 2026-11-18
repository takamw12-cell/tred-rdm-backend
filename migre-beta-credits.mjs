/**
 * 10 crédits de bienvenue pour les comptes de la bêta (décision du fondateur,
 * 18 nov. 2026). À lancer JUSTE AVANT de poser BILLING_ENABLED=true.
 *
 * Depuis b5104bf, chaque NOUVEAU compte reçoit 10 crédits à l'inscription, et
 * ce don est inscrit au journal sous l'identifiant « welcome:<compte> ». Ce
 * script donne les mêmes 10 crédits, sous le même identifiant, à chaque compte
 * qui ne les a pas encore. Conséquences :
 *   · un compte ne reçoit JAMAIS deux fois ses crédits de bienvenue, même si
 *     le script est relancé, ou s'il s'est inscrit après le déploiement ;
 *   · pas besoin de date limite : « avant aujourd'hui » = « sans don de bienvenue ».
 *
 * Par défaut le script ne fait que COMPTER. Pour écrire :
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-beta-credits.mjs           (compte seulement)
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-beta-credits.mjs --apply   (donne les crédits)
 *
 * Tout se fait dans UNE transaction : soit tous les comptes sont crédités et
 * journalisés, soit aucun. Il faut que migre-*.mjs des crédits (purchased_credits,
 * credit_transactions) aient déjà été lancés — c'est le cas en production.
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

const APPLY = process.argv.includes("--apply");
const WELCOME = 10;

// Les comptes sans don de bienvenue au journal.
const TARGETS = `SELECT u.id FROM user u WHERE NOT EXISTS (SELECT 1 FROM credit_transactions t WHERE t.id = 'welcome:' || u.id)`;

const STATEMENTS = APPLY
  ? [
      "BEGIN",
      `CREATE TEMP TABLE beta_welcome AS ${TARGETS}`,
      // Le journal d'abord : son identifiant empêche tout second don.
      `INSERT INTO credit_transactions (id, user_id, amount, type, description, source, created_at)
         SELECT 'welcome:' || id, id, ${WELCOME}, 'grant', 'Willkommen bei TRED (Beta)', 'credits', unixepoch() FROM beta_welcome`,
      `INSERT INTO purchased_credits (user_id, credits_remaining, last_purchased_at, updated_at)
         SELECT id, ${WELCOME}, unixepoch(), unixepoch() FROM beta_welcome WHERE true
         ON CONFLICT (user_id) DO UPDATE SET credits_remaining = credits_remaining + ${WELCOME}, updated_at = excluded.updated_at`,
      "SELECT count(*) FROM beta_welcome",
      "DROP TABLE beta_welcome",
      "COMMIT",
    ]
  : [`SELECT count(*) FROM (${TARGETS})`, "SELECT count(*) FROM user"];

const requests = [...STATEMENTS.map((sql) => ({ type: "execute", stmt: { sql } })), { type: "close" }];

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
  console.error("  x  Rien n'a ete ecrit (transaction annulee).");
  process.exit(1);
}

const value = (i) => body.results?.[i]?.response?.result?.rows?.[0]?.[0]?.value ?? "0";
if (APPLY) {
  console.log(`  comptes credites     : ${value(STATEMENTS.indexOf("SELECT count(*) FROM beta_welcome"))} (+${WELCOME} credits chacun)`);
  console.log("  relancer le script ne donne rien de plus.");
} else {
  console.log(`  comptes sans credits de bienvenue : ${value(0)} sur ${value(1)}`);
  console.log("  rien n'a ete ecrit. Pour donner les credits : ajouter --apply");
}
