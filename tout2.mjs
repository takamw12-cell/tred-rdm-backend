// Les deux correctifs issus de la lecture de ton VRAI dépôt.
//
//   node tout2.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const STEPS = [
  { script: "patch-reglages.mjs", title: "Libellés de la page Réglages" },
  { script: "patch-recherche.mjs", title: "Recherche Ctrl/⌘ + K remontée" },
];

if (!fs.existsSync(path.join(ROOT, "packages", "web"))) {
  console.log("\n⚠️  Pas de dossier packages\\web ici — tu n'es pas à la racine.\n");
  process.exit(1);
}

const results = [];
for (const [i, step] of STEPS.entries()) {
  console.log(`\n${"═".repeat(60)}\n  ${i + 1}/${STEPS.length}  ${step.title}\n${"═".repeat(60)}`);
  const file = path.join(ROOT, step.script);
  if (!fs.existsSync(file)) {
    console.log(`⚠️  ${step.script} introuvable.`);
    results.push({ step, ok: false });
    continue;
  }
  const run = spawnSync(process.execPath, [file], { stdio: "inherit", cwd: ROOT });
  results.push({ step, ok: run.status === 0 });
}

console.log(`\n${"═".repeat(60)}\n  BILAN\n${"═".repeat(60)}`);
for (const r of results) console.log(`  ${r.ok ? "✅" : "❌"}  ${r.step.title}`);

console.log(`
  Les deux pages elles-mêmes — settings.tsx et language-switcher.tsx —
  sont livrées entières dans ce zip : elles remplacent les maquettes.

👉 Ensuite :

     bun run verify
     git add -A && git commit -m "pages reelles" && git push
`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
