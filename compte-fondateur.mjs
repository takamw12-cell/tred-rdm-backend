#!/usr/bin/env node
/**
 * compte-fondateur.mjs — passe un compte au tarif « founder ». Zéro dépendance.
 *
 * ── Pourquoi ce script existe ─────────────────────────────────────────────
 *
 * Ton propre compte tournait sur le tarif gratuit : 20 messages par mois. Tu
 * les as consommés en testant ta propre application, et le tuteur a cessé de
 * répondre au milieu d'une séance de débogage.
 *
 * Ce n'est pas seulement gênant : Apple exige un COMPTE DE DÉMONSTRATION
 * fonctionnel pour l'examen (guideline 2.1(a)). Un compte de démonstration qui
 * tombe à court de quota pendant que l'examinateur l'essaie fait rejeter la
 * fiche. Il te faut donc de toute façon au moins un compte sans limite.
 *
 * ── Ce qu'il fait exactement ──────────────────────────────────────────────
 *
 *   plan        = "founder"      500 messages/mois au lieu de 20
 *   validUntil  = NULL           n'expire jamais
 *
 * Il remet aussi à zéro les compteurs du mois en cours, sans quoi le tarif
 * changerait mais le blocage resterait jusqu'au 1er.
 *
 * Le plafond de jetons (100 000/mois) n'est PAS touché : c'est le seul
 * garde-fou entre toi et une facture Anthropic surprise. Tu es à 15 864.
 *
 *   node compte-fondateur.mjs                       (ton compte)
 *   node compte-fondateur.mjs demo@tred.app         (un autre)
 *   node compte-fondateur.mjs --voir                (ne change rien)
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const LECTURE_SEULE = args.includes("--voir");
const EMAIL = args.find((a) => !a.startsWith("--")) ?? "takamw12@gmail.com";

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
  console.error("Dépôt introuvable. Lance-le depuis C:\\dev\\tred-rdm\\aerostudy-ai.");
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

/** Une valeur SQL typée pour l'API HTTP de Turso. */
const val = (v) =>
  v === null
    ? { type: "null" }
    : typeof v === "number"
      ? { type: "integer", value: String(Math.trunc(v)) }
      : { type: "text", value: String(v) };

async function q(sql, args = []) {
  const r = await fetch(`${HOTE}/v2/pipeline`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(JETON ? { authorization: `Bearer ${JETON}` } : {}),
    },
    body: JSON.stringify({
      requests: [{ type: "execute", stmt: { sql, args: args.map(val) } }, { type: "close" }],
    }),
  });
  if (!r.ok) throw new Error(`Turso ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const p = data.results?.[0];
  if (p?.type === "error") throw new Error(p.error?.message ?? "erreur SQL");
  const res = p.response.result;
  const cols = res.cols.map((c) => c.name);
  return res.rows.map((l) => {
    const o = {};
    l.forEach((c, i) => {
      o[cols[i]] =
        c.type === "null"
          ? null
          : c.type === "integer" || c.type === "float"
            ? Number(c.value)
            : c.value;
    });
    return o;
  });
}

const users = await q("SELECT id, email, name FROM user WHERE email = ?", [EMAIL]);
if (users.length === 0) {
  console.error(`\nAucun compte ${EMAIL}.\n`);
  process.exit(1);
}
const { id: uid, name } = users[0];

const maintenant = new Date();
const periode = `${maintenant.getUTCFullYear()}-${String(maintenant.getUTCMonth() + 1).padStart(2, "0")}`;

const avant = await q("SELECT plan, valid_until FROM user_plan WHERE user_id = ?", [uid]);
const compteurs = await q(
  "SELECT metric, count FROM usage_counter WHERE user_id = ? AND period = ?",
  [uid, periode],
);

console.log(`\nCompte  ${EMAIL}${name ? `  (${name})` : ""}`);
console.log(`Avant   tarif ${avant[0]?.plan ?? "free (aucune ligne)"}`);
for (const c of compteurs) console.log(`        ${c.metric} = ${c.count}`);

if (LECTURE_SEULE) {
  console.log("\n--voir : rien n'a été modifié.\n");
  process.exit(0);
}

// ── L'écriture ────────────────────────────────────────────────────────────
// UPSERT plutôt que UPDATE : un compte qui n'a jamais payé n'a AUCUNE ligne
// dans user_plan, et un UPDATE seul ne toucherait rien en annonçant un succès.
await q(
  `INSERT INTO user_plan (user_id, plan, valid_until, updated_at)
   VALUES (?, 'founder', NULL, ?)
   ON CONFLICT(user_id) DO UPDATE SET
     plan = 'founder', valid_until = NULL, updated_at = excluded.updated_at`,
  [uid, Math.floor(Date.now() / 1000)],
);

// Les compteurs de messages du mois. `tokens_out` est laissé intact : c'est le
// plafond en euros, et le remettre à zéro reviendrait à retirer le seul frein
// à la facture Anthropic.
await q(
  "DELETE FROM usage_counter WHERE user_id = ? AND period = ? AND metric <> 'tokens_out'",
  [uid, periode],
);

const apres = await q("SELECT plan, valid_until FROM user_plan WHERE user_id = ?", [uid]);
const restants = await q(
  "SELECT metric, count FROM usage_counter WHERE user_id = ? AND period = ?",
  [uid, periode],
);

console.log(`\nAprès   tarif ${apres[0]?.plan} · expire ${apres[0]?.valid_until ?? "jamais"}`);
console.log(`        500 messages/mois`);
for (const c of restants) console.log(`        ${c.metric} = ${c.count}  (conservé)`);
console.log("\nRecharge la page du chat. C'est immédiat, rien à redéployer.\n");
