/**
 * Marque comme VÉRIFIÉS les comptes créés avant l'arrivée de la vérification
 * d'e-mail (bêta ouverte, nov. 2026).
 *
 *     node C:\dev\tred-rdm\aerostudy-ai\migre-email-verifie.mjs
 *
 * À LANCER JUSTE APRÈS LE DÉPLOIEMENT (ou juste avant). Sans lui, un ami déjà
 * inscrit qui se reconnecte reçoit d'abord un e-mail de confirmation — il
 * n'est pas bloqué (le lien arrive), mais c'est une friction inutile.
 *
 * Idempotent : ne touche que les comptes encore non vérifiés, et n'efface rien.
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

const [count] = await pipeline(["SELECT COUNT(*) FROM user WHERE email_verified = 0"]);
const n = Number(count?.response?.result?.rows?.[0]?.[0]?.value ?? 0);
if (n === 0) {
  console.log("  Tous les comptes sont deja verifies. Rien a faire.");
} else {
  await pipeline(["UPDATE user SET email_verified = 1, updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000 WHERE email_verified = 0"]);
  console.log(`  ${n} compte(s) marque(s) comme verifie(s).`);
}
