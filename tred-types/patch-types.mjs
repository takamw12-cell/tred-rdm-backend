// TRED — remise en état du typage, et la vraie cause des langues du chat.
//
//   node patch-types.mjs
//
// À lancer depuis la racine du projet (C:\dev\tred-rdm\aerostudy-ai).
//
// ── Ce que ce paquet corrige ───────────────────────────────────────────────
//
// 1. `bun run verify` ne vérifiait RIEN. `packages/web/tsconfig.json` contient
//    `"files": []` avec des `references` : `tsc -p packages/web` ne compile
//    donc aucun fichier. La vraie commande — celle qui vise `tsconfig.app.json`
//    — remontait 98 erreurs. (Les greffons Vite, dans l'autre sous-projet, ne
//    sont volontairement pas inclus : ils dépendent de `sharp`, dont les types
//    ne sont pas installés partout. `vite build` les exerce déjà.)
//
// 2. La page de chat portait son PROPRE dictionnaire de traduction, écrit à la
//    main, 135 lignes, deux langues. Elle ne lisait pas les fichiers de langue
//    de l'application. C'est cela, et rien d'autre, qui faisait que « les
//    langues ne fonctionnent pas dans le chat ».
//
// 3. `es.ts` contenait de l'anglais et exportait une constante nommée `en`.
//    L'espagnol n'a jamais existé.
//
// 4. Le serveur n'acceptait que quatre langues. Choisir l'italien faisait
//    échouer l'enregistrement, silencieusement.
//
// ── Prudence ───────────────────────────────────────────────────────────────
//
// Chaque fichier remplacé est comparé à la version du dépôt avant d'être
// touché. Si tu l'as modifié entre-temps, le script s'arrête sur ce fichier et
// te le dit, plutôt que d'effacer ton travail.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "fichiers");

if (!fs.existsSync(path.join(ROOT, "packages", "web", "package.json"))) {
  console.log("\n⚠️  Tu n'es pas à la racine du projet.\n");
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.log("\n⚠️  Le dossier « fichiers » est absent à côté du script.");
  console.log("   Décompresse le zip en entier.\n");
  process.exit(1);
}

const marks = JSON.parse(fs.readFileSync(path.join(SRC, "empreintes.json"), "utf8"));
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

let written = 0;
const skipped = [];
const drifted = [];

for (const [rel, expected] of Object.entries(marks)) {
  const target = path.join(ROOT, rel);
  const source = path.join(SRC, rel);
  const next = fs.readFileSync(source);

  if (fs.existsSync(target)) {
    const current = fs.readFileSync(target);

    if (sha(current) === sha(next)) {
      skipped.push(rel);
      continue;
    }
    // `expected === null` : fichier nouveau, il n'a pas de version d'origine.
    if (expected !== null && sha(current) !== expected) {
      drifted.push(rel);
      continue;
    }
    fs.writeFileSync(target + ".bak", current);
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }

  fs.writeFileSync(target, next);
  written++;
}

/* ── package.json : remplacement chirurgical, jamais un écrasement ───────── */

const PKG = path.join(ROOT, "package.json");
const before = fs.readFileSync(PKG, "utf8");
const OLD = '"verify": "bunx tsc --noEmit -p packages/web && bun test --cwd packages/web"';
const NEW = '"verify": "bunx tsc --noEmit -p packages/web/tsconfig.app.json && bun test --cwd packages/web"';

if (before.includes(NEW)) {
  console.log("⏭️  package.json — verify déjà corrigé");
} else if (before.includes(OLD)) {
  fs.writeFileSync(PKG + ".bak", before);
  fs.writeFileSync(PKG, before.replace(OLD, NEW), "utf8");
  console.log("✅ package.json — verify compile enfin le code de l'application");
  written++;
} else {
  skipped.push("package.json (script verify introuvable — à changer à la main)");
}

/* ── Compte rendu ───────────────────────────────────────────────────────── */

console.log(`\n${written} fichier(s) écrit(s).`);

if (skipped.length) {
  console.log("\nDéjà à jour :");
  for (const s of skipped) console.log("  · " + s);
}

if (drifted.length) {
  console.log("\n⚠️  MODIFIÉS DE TON CÔTÉ — non touchés :");
  for (const d of drifted) console.log("  · " + d);
  console.log("\n   Envoie-moi ces fichiers, je refais le correctif dessus.");
}

console.log("\n👉 Ensuite :");
console.log("   bun run verify        (doit afficher 56 pass, 0 fail, aucune erreur)");
console.log("   git add -A && git commit -m \"typage : 98 erreurs, chat en 12 langues\" && git push");
