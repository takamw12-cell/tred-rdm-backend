// Applique les trois correctifs restants, dans le bon ordre.
//
//   node tout.mjs
//
// Chaque étape est le script que tu aurais lancé toi-même ; ils sont
// simplement enchaînés ici pour qu'il n'y ait qu'une commande et qu'aucun
// ordre ne puisse être inversé. Tous sont idempotents : relancer ne fait rien
// de plus.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

const STEPS = [
  {
    script: "patch-solide.mjs",
    title: "La mémoire ne peut plus casser le chat",
    why: "Sans lui, une table manquante fait tomber /api/agent/messages.",
  },
  {
    script: "patch-langues.mjs",
    title: "Dix langues côté serveur",
    why: "Sept de tes langues retombaient en allemand en silence.",
  },
  {
    script: "patch-bleu.mjs",
    title: "Palette bleu calque",
    why: "Les jetons de couleur dans styles.css, pour les deux thèmes.",
  },
  {
    script: "patch-fond.mjs",
    title: "Fond animé",
    why: "Monté sur /login et derrière l'application.",
  },
];

// L'ordre compte : la palette pose le jeton `--amb` que le fond utilise. Un
// fond monté avant la palette retomberait sur la couleur des boutons.

if (!fs.existsSync(path.join(ROOT, "packages", "web"))) {
  console.log("\n⚠️  Pas de dossier packages\\web ici.");
  console.log("   Tu n'es pas à la racine du projet, ou le zip a été");
  console.log("   décompressé ailleurs.\n");
  process.exit(1);
}

const results = [];

for (const [i, step] of STEPS.entries()) {
  const file = path.join(ROOT, step.script);

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ${i + 1}/${STEPS.length}  ${step.title}`);
  console.log(`        ${step.why}`);
  console.log("═".repeat(64));

  if (!fs.existsSync(file)) {
    console.log(`\n⚠️  ${step.script} introuvable — le zip n'est pas décompressé ici.`);
    results.push({ step, status: "absent" });
    continue;
  }

  const run = spawnSync(process.execPath, [file], {
    stdio: "inherit",
    cwd: ROOT,
  });

  results.push({
    step,
    status: run.status === 0 ? "ok" : "erreur",
  });
}

/* ── Bilan ──────────────────────────────────────────────────────────────── */

console.log(`\n${"═".repeat(64)}`);
console.log("  BILAN");
console.log("═".repeat(64));

for (const r of results) {
  const mark = r.status === "ok" ? "✅" : r.status === "absent" ? "⚠️ " : "❌";
  console.log(`  ${mark}  ${r.step.title}`);
}

const bad = results.filter((r) => r.status !== "ok");

// La migration ne peut pas être lancée d'ici : elle a besoin de ton .env, donc
// de bun. On se contente de rappeler si la table manque à l'appel.
console.log(`
${"═".repeat(64)}
  ENSUITE
${"═".repeat(64)}

  1. La table de la mémoire, si ce n'est pas déjà fait :

       bun --env-file=.env migration-memoire.mjs

  2. La vérification, puis l'envoi :

       bun run verify
       git add -A && git commit -m "correctifs" && git push

  3. Railway : onglet Deployments. Un déploiement doit apparaître dans
     la minute qui suit le push, et finir en vert. S'il n'apparaît pas,
     c'est que Railway n'écoute pas ce dépôt — et c'est là qu'est le
     vrai problème, pas dans le code.
`);

process.exit(bad.length === 0 ? 0 : 1);
