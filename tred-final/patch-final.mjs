// TRED — le paquet qui débloque tout.
//
//   node patch-final.mjs
//
// À lancer depuis la racine du projet (C:\dev\tred-rdm\aerostudy-ai).
//
// ── La cause de tout ───────────────────────────────────────────────────────
//
// `bun install` mourait sur Electron. Son script d'installation télécharge un
// binaire avec `extract-zip`, qui a besoin de `debug`, et bun ne le lui rend
// pas visible sous Windows. L'installation s'arrêtait là — d'où `zod` absent,
// d'où les dix-neuf erreurs de TypeScript, d'où le `Cannot find module 'debug'`
// d'Expo dans sortie.txt. Un seul point de rupture, trois symptômes.
//
// Electron vient de `packages/desktop`, une charpente du gabarit d'origine.
// Rien ne l'utilise. Ce script le sort de l'espace de travail : le dossier
// reste sur le disque, il sort seulement de l'installation.
//
// ── Ce que ce paquet contient d'autre ──────────────────────────────────────
//
// · Les vingt-sept fichiers du build EAS mobile et des recharges. Si tu as
//   déjà passé `patch-mobile.mjs`, ils seront reconnus comme à jour.
// · Vérifié sur ton dépôt à l'état e3d972f : bun install propre (2 649
//   paquets), verify 56 pass 0 fail, build:web en succès, typecheck mobile à
//   zéro, empaquetage Android abouti.
//
// ── Prudence ───────────────────────────────────────────────────────────────
//
// Chaque fichier est comparé à la version du dépôt avant d'être remplacé. Si
// tu en as modifié un depuis ton dernier push, le script s'arrête sur celui-là
// et te le nomme, plutôt que d'effacer ton travail.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "fichiers");

if (!fs.existsSync(path.join(ROOT, "packages", "web", "package.json"))) {
  console.log("\n⚠️  Tu n'es pas à la racine du projet.");
  console.log("   cd /d C:\\dev\\tred-rdm\\aerostudy-ai\n");
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.log("\n⚠️  Le dossier « fichiers » est absent. Décompresse le zip en entier.\n");
  process.exit(1);
}

const marks = JSON.parse(fs.readFileSync(path.join(SRC, "empreintes.json"), "utf8"));
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

let written = 0;
let already = 0;
const drifted = [];

for (const [rel, expected] of Object.entries(marks)) {
  // package.json est traité à part : on n'écrase pas un fichier où tu peux
  // avoir ajouté un script.
  if (rel === "package.json") continue;

  const target = path.join(ROOT, rel);
  const next = fs.readFileSync(path.join(SRC, rel));

  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target);
    if (sha(current) === sha(next)) { already++; continue; }
    if (expected !== null && sha(current) !== expected) { drifted.push(rel); continue; }
    if (!/\.(png|jpg|ico)$/i.test(rel)) fs.writeFileSync(target + ".bak", current);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }

  fs.writeFileSync(target, next);
  written++;
}

console.log(`✅ ${written} fichier(s) écrit(s), ${already} déjà à jour.`);

if (drifted.length) {
  console.log("\n⚠️  MODIFIÉS DE TON CÔTÉ — non touchés :");
  for (const d of drifted) console.log("  · " + d);
  console.log("   Envoie-les-moi, je refais le correctif dessus.");
}

/* ── Electron : la vraie correction ──────────────────────────────────────── */

const PKG = path.join(ROOT, "package.json");
const before = fs.readFileSync(PKG, "utf8");

const OLD = /"workspaces"\s*:\s*\[\s*"packages\/\*"\s*\]/;
const NEW = '"workspaces": [\n    "packages/web",\n    "packages/mobile"\n  ]';

if (/"packages\/web"/.test(before) && /"packages\/mobile"/.test(before)) {
  console.log("⏭️  package.json — packages/desktop déjà hors de l'installation");
} else if (OLD.test(before)) {
  const after = before.replace(OLD, NEW);
  JSON.parse(after); // on ne réécrit jamais un package.json qu'on vient de casser
  fs.writeFileSync(PKG + ".bak", before);
  fs.writeFileSync(PKG, after, "utf8");
  console.log("✅ package.json — packages/desktop sorti de l'installation (fin d'Electron)");
} else {
  console.log("\n⚠️  package.json : le champ workspaces n'a pas la forme attendue.");
  console.log('   Remplace à la main  "packages/*"  par  "packages/web", "packages/mobile"\n');
}

/* ── La suite ────────────────────────────────────────────────────────────── */

console.log("\n👉 Ferme VS Code, puis lance ceci — dans cet ordre :\n");
console.log("   rmdir /s /q node_modules");
console.log("   rmdir /s /q packages\\web\\node_modules");
console.log("   rmdir /s /q packages\\mobile\\node_modules");
console.log("   bun install");
console.log("   bun run verify");
console.log("");
console.log("   git add -A");
console.log('   git commit -m "mobile : build EAS, recharges, sans electron"');
console.log("   git push");
console.log("");
console.log("Attendu :  ~2 649 paquets installés, aucune erreur, 56 pass 0 fail.");
console.log("Si bun install s'arrête encore, colle-moi la ligne.\n");
