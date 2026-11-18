// Test de charge contre une base Turso de STAGING — jamais la production.
//
//   bun scripts/stress-test-turso.mjs                    # paliers 100, 500, 1000
//   bun scripts/stress-test-turso.mjs --stages=100       # un seul palier
//   bun scripts/stress-test-turso.mjs --dry-run          # vérifie les réglages, ne lance rien
//
// Ce que fait ce script, dans l'ordre :
//   1. lit TURSO_STAGING_URL et TURSO_STAGING_TOKEN dans l'environnement, ou
//      dans le fichier `.env.stress.local` à la racine (ignoré par git — modèle :
//      `.env.stress.example`). Rien n'est écrit en dur, rien n'est affiché ;
//   2. REFUSE de partir si cette base est celle de la production (comparée au
//      DATABASE_URL du `.env`), ou si son nom ne dit pas « staging / stress / test » ;
//   3. lance les faux services (scripts/stress-mocks.mjs : Anthropic, stockage,
//      Sentry), puis un serveur web et un worker LOCAUX branchés sur la base de
//      staging. Leur environnement est construit ici, variable par variable :
//      aucune clé du `.env` (Anthropic, ElevenLabs, Resend…) ne leur parvient ;
//   4. lance scripts/simulate-users.mjs contre ce serveur local ;
//   5. arrête tout et laisse le rapport dans RAPPORT-STRESS-TEST-TURSO.md.
//
// Une branche Turso est une COPIE de la production, comptes réels compris. Le
// serveur de test tourne donc avec les rappels du soir, l'agent de rétention et
// le résumé du matin coupés, et sans clé d'e-mail : aucun étudiant réel ne peut
// recevoir un message ou une notification à cause de ce test.
//
// Prérequis : un Redis local (STRESS_REDIS_URL, défaut redis://127.0.0.1:6399)
// et le build du front (`bun run build:web`). Voir scripts/README.md.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "packages", "web");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const DRY_RUN = flag("dry-run");

const stop = (message) => {
  console.error(`\n  x  ${message}\n`);
  process.exit(2);
};

/** Lit un fichier KEY=valeur. Ne lève pas, n'affiche rien. */
function readEnvFile(file) {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line))
        .filter(Boolean)
        .map((m) => [m[1], m[2].replace(/^(["'])(.*)\1$/, "$2")]),
    );
  } catch {
    return {};
  }
}

const stressFile = readEnvFile(path.join(ROOT, ".env.stress.local"));
const setting = (name, fallback = "") => (process.env[name] ?? stressFile[name] ?? fallback).trim();

const TURSO_URL = setting("TURSO_STAGING_URL");
const TURSO_TOKEN = setting("TURSO_STAGING_TOKEN");
const REDIS_URL = setting("STRESS_REDIS_URL", "redis://127.0.0.1:6399");
const PORT = Number(setting("STRESS_PORT", "4587"));
const BASE = `http://localhost:${PORT}`;

/* ── Gardes ─────────────────────────────────────────────────────────────── */

if (!TURSO_URL || !TURSO_TOKEN) {
  stop("TURSO_STAGING_URL et TURSO_STAGING_TOKEN sont requis (environnement, ou fichier .env.stress.local — modèle : .env.stress.example).");
}
const hostOf = (url) => {
  try {
    return new URL(url.replace(/^libsql:/, "https:")).hostname.toLowerCase();
  } catch {
    return "";
  }
};
const stagingHost = hostOf(TURSO_URL);
if (!/^(libsql|https):\/\//.test(TURSO_URL) || !stagingHost) stop("TURSO_STAGING_URL doit être une adresse Turso (libsql://… ou https://…).");

// La production : le DATABASE_URL du .env de la racine (et celui de l'environnement, s'il y en a un).
const productionHosts = [readEnvFile(path.join(ROOT, ".env")).DATABASE_URL, process.env.DATABASE_URL].filter(Boolean).map(hostOf).filter(Boolean);
if (productionHosts.includes(stagingHost)) {
  stop("Refusé : TURSO_STAGING_URL est la base de PRODUCTION (même adresse que DATABASE_URL). Crée une branche de staging et donne SON adresse.");
}
if (!/staging|stress|test/.test(stagingHost) && !flag("db-name-ok")) {
  stop(`Refusé : le nom de la base (« ${stagingHost.split(".")[0]} ») ne contient ni « staging », ni « stress », ni « test ». Si c'est bien une base jetable, relance avec --db-name-ok.`);
}
if (!fs.existsSync(path.join(WEB, "dist", "index.html"))) stop("Le build du front manque (packages/web/dist). Lance d'abord : bun run build:web");

console.log(`Base de staging : ${stagingHost} · Redis : ${REDIS_URL.replace(/\/\/[^@]*@/, "//***@")} · serveur local : ${BASE}`);
if (DRY_RUN) {
  console.log("--dry-run : réglages valides, rien n'a été lancé.");
  process.exit(0);
}

/* ── L'environnement du serveur et du worker : construit ici, rien d'hérité du .env ── */

const SYSTEM_VARS = ["PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "ComSpec", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "HOMEDRIVE", "HOMEPATH", "APPDATA", "LOCALAPPDATA", "LANG"];
const system = Object.fromEntries(SYSTEM_VARS.filter((k) => process.env[k]).map((k) => [k, process.env[k]]));
const AI_PORT = 4598;
const S3_PORT = 4599;
const SENTRY_PORT = 4597;
const serverEnv = {
  ...system,
  NODE_ENV: "production",
  PORT: String(PORT),
  WEBSITE_URL: BASE,
  BETTER_AUTH_URL: BASE,
  // Secret jetable, tiré à chaque lancement.
  BETTER_AUTH_SECRET: Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join(""),
  DATABASE_URL: TURSO_URL,
  DATABASE_AUTH_TOKEN: TURSO_TOKEN,
  REDIS_URL,
  // Faux services locaux : aucun appel payant, aucun fichier ni erreur ne sort de la machine.
  ANTHROPIC_API_KEY: "sk-ant-stress-fake",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${AI_PORT}/v1`,
  S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
  S3_BUCKET: "stress",
  S3_ACCESS_KEY_ID: "local",
  S3_SECRET_ACCESS_KEY: "local-stress",
  SENTRY_DSN: `http://stress@127.0.0.1:${SENTRY_PORT}/1`,
  // La branche de staging contient les comptes réels : personne ne doit être contacté.
  DISABLE_EVENING_REMINDER: "true",
  DISABLE_RETENTION_AGENT: "true",
  DISABLE_MORNING_DIGEST: "true",
};

/* ── Lancement ──────────────────────────────────────────────────────────── */

const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "tred-stress-turso-"));
const children = [];
function start(name, args, { cwd, env }) {
  const logFile = path.join(logDir, `${name}.log`);
  const out = fs.openSync(logFile, "w");
  const child = spawn(process.execPath, args, { cwd, env, stdio: ["ignore", out, out], windowsHide: true });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown) console.error(`  !  ${name} s'est arrêté (code ${code}). Journal : ${logFile}`);
  });
  return { child, logFile };
}
let shuttingDown = false;
function shutdown(code) {
  shuttingDown = true;
  for (const child of children) child.kill();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(url, label, seconds) {
  for (let i = 0; i < seconds; i += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) return await res.json().catch(() => ({}));
    } catch {
      /* pas encore prêt */
    }
    await sleep(1000);
  }
  console.error(`\n  x  ${label} ne répond pas après ${seconds} s. Journaux : ${logDir}\n`);
  return shutdown(2);
}

start("mocks", [path.join(ROOT, "scripts", "stress-mocks.mjs")], { cwd: WEB, env: { ...system, STRESS_AI_PORT: String(AI_PORT), STRESS_S3_PORT: String(S3_PORT), STRESS_SENTRY_PORT: String(SENTRY_PORT) } });
await waitFor(`http://127.0.0.1:${AI_PORT}/__stats`, "Le faux Anthropic", 20);

// Depuis packages/web, jamais depuis la racine : Bun chargerait le .env de la production.
const web = start("server", ["src/__server.ts"], { cwd: WEB, env: serverEnv });
const worker = start("worker", ["src/worker.ts"], { cwd: WEB, env: serverEnv });
await waitFor(`${BASE}/api/health`, "Le serveur local", 180);

// Le worker signale sa présence dans Redis ; la file n'est « active » qu'ensuite.
let config = {};
for (let i = 0; i < 45; i += 1) {
  config = await waitFor(`${BASE}/api/config`, "Le serveur local", 10);
  if (config.features?.importQueue) break;
  await sleep(1000);
}
if (config.emailVerification) {
  console.error("\n  x  Refusé : ce serveur peut envoyer des e-mails.\n");
  shutdown(2);
}
if (!config.features?.importQueue) console.warn("  !  La file d'import n'est pas active (Redis joignable ? worker démarré ?) : les imports seront traités dans la requête.");

const passthrough = argv.filter((a) => !["--db-name-ok", "--dry-run"].includes(a));
if (!passthrough.some((a) => a.startsWith("--stages"))) passthrough.push("--stages=100,500,1000");
if (!passthrough.some((a) => a.startsWith("--report"))) passthrough.push("--report=RAPPORT-STRESS-TEST-TURSO.md");

const robots = spawn(
  process.execPath,
  [
    path.join(ROOT, "scripts", "simulate-users.mjs"),
    `--base=${BASE}`,
    `--redis=${REDIS_URL}`,
    `--server-log=${web.logFile}`,
    `--worker-log=${worker.logFile}`,
    `--pids=web:${web.child.pid},worker:${worker.child.pid}`,
    "--database=Turso (base de staging)",
    ...passthrough,
  ],
  { cwd: WEB, env: system, stdio: "inherit", windowsHide: true },
);
robots.on("exit", (code) => {
  console.log(`\nJournaux du serveur et du worker : ${logDir}`);
  shutdown(code ?? 1);
});
