// Durcissement : la mémoire ne doit JAMAIS casser le chat.
//
//   node patch-solide.mjs
//
// Idempotent, .bak avant écriture.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API = path.join(ROOT, "packages", "web", "src", "api");

const F = {
  memory: path.join(API, "lib", "memory.ts"),
  gitignore: path.join(ROOT, ".gitignore"),
};

let ok = 0;
let skipped = 0;
const failed = [];

function patch(label, file, fn) {
  if (!fs.existsSync(file)) {
    failed.push(`${label} — fichier absent : ${path.relative(ROOT, file)}`);
    return;
  }
  const before = fs.readFileSync(file, "utf8");
  let after;
  try {
    after = fn(before);
  } catch (err) {
    failed.push(`${label} — ${err.message}`);
    return;
  }
  if (after === null) {
    console.log(`⏭️  ${label} — déjà fait`);
    skipped++;
    return;
  }
  if (after === undefined) {
    failed.push(`${label} — motif introuvable dans ${path.relative(ROOT, file)}`);
    return;
  }
  fs.writeFileSync(file + ".bak", before, "utf8");
  fs.writeFileSync(file, after, "utf8");
  console.log(`✅ ${label}`);
  ok++;
}

/* ══ A. La mémoire ne peut plus faire tomber le chat ═══════════════════ */

// `lib/memory.ts` est livré RÉÉCRIT dans ce zip, pas rapiécé ici : envelopper
// trois corps de fonction par expression régulière est exactement le genre de
// manipulation qui casse un fichier en silence. Le fichier entier m'appartient,
// je le remplace.
const memoryFile = path.join(API, "lib", "memory.ts");
if (fs.existsSync(memoryFile)) {
  const content = fs.readFileSync(memoryFile, "utf8");
  if (content.includes("memoryFailed")) {
    console.log("✅ lib/memory.ts — version non bloquante en place");
    ok++;
  } else {
    failed.push(
      "lib/memory.ts — l'ancienne version est encore là : le zip n'a pas été décompressé à la racine.",
    );
  }
} else {
  failed.push("lib/memory.ts absent — décompresse le zip à la racine du projet.");
}

/* ══ B. Les sauvegardes .bak hors du dépôt ═════════════════════════════ */

// Les scripts écrivent un .bak à côté de chaque fichier modifié. C'est utile
// sur ta machine et ça n'a rien à faire sur GitHub ni sur Railway : le dernier
// envoi en a embarqué une dizaine.
patch(".gitignore — les .bak restent chez toi", F.gitignore, (s) => {
  const lines = s.split(/\r?\n/);
  if (lines.includes("*.bak")) return null;
  return s.replace(/\s*$/, "\n") + "\n# Sauvegardes des scripts de correctif\n*.bak\n";
});

if (fs.existsSync(F.gitignore)) {
  const tracked = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".bak")) tracked.push(path.relative(ROOT, full));
    }
  };
  walk(ROOT);

  if (tracked.length > 0) {
    console.log(`\nℹ️  ${tracked.length} fichier(s) .bak présent(s). Pour les retirer du dépôt`);
    console.log("   sans les supprimer de ton disque :\n");
    console.log('   git rm --cached -r --quiet "*.bak"\n');
  }
}

/* ══ Bilan ═════════════════════════════════════════════════════════════ */

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);

if (failed.length) {
  console.log("\n⚠️  À faire à la main :");
  for (const f of failed) console.log("   • " + f);
}

console.log("\n👉 Ensuite :  bun run verify");
