#!/usr/bin/env node
/**
 * pourquoi-le-chat-coupe.mjs — lecture seule, ZÉRO dépendance.
 *
 * « Die Verbindung wurde unterbrochen » est le message que l'interface affiche
 * pour N'IMPORTE QUEL échec. Il y a quatre causes possibles, et elles ne se
 * soignent pas pareil :
 *
 *   429  limiteur de débit    5 requêtes / minute sur /api/agent/*
 *   402  quota mensuel        LIMITS[plan].chat
 *   402  plafond de jetons    OUTPUT_TOKEN_CAP = 100 000 / mois
 *   5xx  vraie panne          clé Anthropic, modèle, réseau
 *
 * ── Pourquoi il ne charge PAS @libsql/client ──────────────────────────────
 *
 * Ce paquet a deux visages : une version web en pur fetch, et une version
 * Node qui appelle le module natif `libsql`. Sur ta machine, `bun install` n'a
 * jamais posé le natif — d'où le MODULE_NOT_FOUND. Turso expose de toute façon
 * une API HTTP ; ce script parle donc directement à ta base, sans rien
 * installer. C'est aussi ce qui le rend increvable.
 *
 *   node pourquoi-le-chat-coupe.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EMAIL = process.argv[2] ?? "takamw12@gmail.com";

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

// ── Les identifiants viennent du .env, jamais d'ici ───────────────────────
for (const nom of [".env", ".env.local", "packages/web/.env"]) {
  const p = join(R, nom);
  if (!existsSync(p)) continue;
  for (const ligne of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const val = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
}

const URL_BASE = process.env.DATABASE_URL;
const JETON = process.env.DATABASE_AUTH_TOKEN;
if (!URL_BASE) {
  console.error("DATABASE_URL introuvable dans le .env.");
  process.exit(1);
}

// libsql://xxx.turso.io → https://xxx.turso.io
const HOTE = URL_BASE.replace(/^libsql:\/\//, "https://").replace(/\/+$/, "");

/**
 * Une requête SQL par l'API HTTP de Turso.
 *
 * Les valeurs reviennent typées ({type:"integer", value:"42"}) : SQLite peut
 * dépasser ce qu'un nombre JavaScript représente exactement, donc Turso les
 * transporte en texte. On reconvertit ici, une fois.
 */
async function q(sql, args = []) {
  const r = await fetch(`${HOTE}/v2/pipeline`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(JETON ? { authorization: `Bearer ${JETON}` } : {}),
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: {
            sql,
            args: args.map((v) => ({ type: "text", value: String(v) })),
          },
        },
        { type: "close" },
      ],
    }),
  });

  if (!r.ok) throw new Error(`Turso ${r.status} : ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  const premier = data.results?.[0];
  if (premier?.type === "error") throw new Error(premier.error?.message ?? "erreur SQL");

  const res = premier.response.result;
  const cols = res.cols.map((c) => c.name);
  return res.rows.map((ligne) => {
    const o = {};
    ligne.forEach((cell, i) => {
      o[cols[i]] =
        cell.type === "null"
          ? null
          : cell.type === "integer" || cell.type === "float"
            ? Number(cell.value)
            : cell.value;
    });
    return o;
  });
}

const CAP_JETONS = 100_000;
const LIMITS = {
  free: { chat: 20 },
  standard: { chat: 500 },
  premium: { chat: 500 },
  founder: { chat: 500 },
};

const maintenant = new Date();
const periode = `${maintenant.getUTCFullYear()}-${String(maintenant.getUTCMonth() + 1).padStart(2, "0")}`;

let users;
try {
  users = await q("SELECT id, email FROM user WHERE email = ?", [EMAIL]);
} catch (e) {
  console.error("\nImpossible de joindre la base :", e.message);
  console.error("Vérifie DATABASE_URL et DATABASE_AUTH_TOKEN dans le .env.\n");
  process.exit(1);
}

if (users.length === 0) {
  console.error(`Aucun compte ${EMAIL}.`);
  process.exit(1);
}
const uid = users[0].id;

console.log(`\nCompte   ${EMAIL}`);
console.log(`Période  ${periode}\n`);

// ── 1. Le tarif ───────────────────────────────────────────────────────────
const plans = await q(
  "SELECT plan, valid_until FROM user_plan WHERE user_id = ? LIMIT 1",
  [uid],
);
let plan = "free";
if (plans[0]) {
  const p = plans[0];
  // Drizzle stocke ce champ en SECONDES (mode "timestamp"), pas en
  // millisecondes. Le multiplier est la seule façon d'obtenir une vraie date.
  const expire = p.valid_until ? Number(p.valid_until) * 1000 : null;
  const perime = expire !== null && expire < Date.now();
  plan = perime || !p.plan ? "free" : p.plan;
  if (perime) {
    console.log(
      `⚠  Tarif « ${p.plan} » EXPIRÉ le ${new Date(expire).toISOString().slice(0, 10)} → retombé sur « free ».`,
    );
  }
}
console.log(`Tarif    ${plan}`);

// ── 2 et 3. Quota mensuel et plafond de jetons ────────────────────────────
const compteurs = await q(
  "SELECT metric, count FROM usage_counter WHERE user_id = ? AND period = ?",
  [uid, periode],
);
const parMetrique = Object.fromEntries(compteurs.map((r) => [r.metric, Number(r.count)]));
const chats = parMetrique.chat ?? 0;
const limiteChat = (LIMITS[plan] ?? LIMITS.free).chat;
const jetons = parMetrique.tokens_out ?? 0;

console.log("");
console.log(
  "  messages ce mois   " +
    `${chats} / ${limiteChat}`.padStart(16) +
    (chats >= limiteChat ? "   ← ÉPUISÉ" : ""),
);
console.log(
  "  jetons produits    " +
    `${jetons} / ${CAP_JETONS}`.padStart(16) +
    (jetons >= CAP_JETONS ? "   ← ÉPUISÉ" : ""),
);

if (compteurs.length > 2) {
  const autres = compteurs.filter((r) => r.metric !== "chat" && r.metric !== "tokens_out");
  for (const r of autres) {
    console.log("  " + String(r.metric).padEnd(19) + String(r.count).padStart(16));
  }
}

// ── 4. Le limiteur de débit ───────────────────────────────────────────────
let fenetres = [];
try {
  fenetres = await q(
    "SELECT key, window_start, count, updated_at FROM rate_limit WHERE key LIKE 'agent:%' ORDER BY window_start DESC LIMIT 8",
  );
} catch {
  console.log("\n  (table rate_limit absente — migration jamais appliquée)");
}

console.log("\n  Limiteur /api/agent/* — 5 requêtes par minute");
if (fenetres.length === 0) {
  console.log("    (aucune fenêtre enregistrée)");
} else {
  for (const f of fenetres) {
    const t = new Date(Number(f.window_start)).toISOString().slice(0, 16).replace("T", " ");
    const n = Number(f.count);
    console.log(`    ${t}Z   ${String(n).padStart(3)} requêtes${n > 5 ? "   ← BLOQUÉ" : ""}`);
  }
}

// ── Le verdict ────────────────────────────────────────────────────────────
console.log("\n─────────────────────────────────────────────────────────────");
const causes = [];
if (chats >= limiteChat)
  causes.push(`quota mensuel atteint (${chats}/${limiteChat}) → 402, jusqu'au 1er du mois`);
if (jetons >= CAP_JETONS)
  causes.push(`plafond de jetons atteint (${jetons}/${CAP_JETONS}) → 402, jusqu'au 1er du mois`);
if (fenetres.some((f) => Number(f.count) > 5))
  causes.push("limiteur de débit dépassé → 429, se libère tout seul en une minute");

if (causes.length === 0) {
  console.log("Aucun compteur n'est en cause.");
  console.log("La panne vient donc de l'appel au modèle lui-même :");
  console.log("clé ANTHROPIC_API_KEY, nom du modèle, ou réseau.");
} else {
  console.log("CAUSE :");
  for (const c of causes) console.log("  • " + c);
}
console.log("");
