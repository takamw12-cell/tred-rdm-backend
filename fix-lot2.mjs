// Réparation après le premier `bun run verify`.
//
//   node fix-lot2.mjs
//
// Trois choses :
//   1. `bun test` ne fouille plus tout le dépôt, seulement packages/web/tests ;
//   2. les copies en double du zip sont écartées (déplacées, pas supprimées) ;
//   3. l'état du lot 1 est vérifié et signalé.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TRASH = path.join(ROOT, "_a-supprimer");

let ok = 0;
const notes = [];

/* ══ 1. Les tests ne cherchent plus qu'au bon endroit ══════════════════ */

// `bun test` sans argument parcourt TOUT le dépôt. Il ramasse donc les vieux
// dossiers d'essai et les copies du zip, et fait échouer la vérification pour
// des raisons qui n'ont rien à voir avec le code déployé.
const pkgPath = path.join(ROOT, "package.json");

if (!fs.existsSync(pkgPath)) {
  notes.push("package.json introuvable — tu n'es pas à la racine du projet.");
} else {
  const before = fs.readFileSync(pkgPath, "utf8");
  let pkg;
  try {
    pkg = JSON.parse(before);
  } catch {
    notes.push("package.json illisible — modifie les scripts à la main.");
    pkg = null;
  }

  if (pkg) {
    pkg.scripts ??= {};
    const wantTest = "bun test --cwd packages/web";
    const wantVerify = `bunx tsc --noEmit -p packages/web && ${wantTest}`;

    if (pkg.scripts.test === wantTest && pkg.scripts.verify === wantVerify) {
      console.log("⏭️  package.json — déjà fait");
    } else {
      pkg.scripts.test = wantTest;
      pkg.scripts.verify = wantVerify;
      fs.writeFileSync(pkgPath + ".bak", before, "utf8");
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
      console.log("✅ package.json — les tests ne portent plus que sur packages/web/tests");
      ok++;
    }
  }
}

/* ══ 2. Les doublons ═══════════════════════════════════════════════════ */

// Dossiers créés par une décompression dans l'Explorateur, qui range le contenu
// dans un sous-dossier au nom du zip. Le projet se retrouve alors en double :
// les tests tournent deux fois, et un `git add -A` embarquerait la copie.
const STRAYS = ["tred-lot2", "tred-lot1", "_p5"];

for (const name of STRAYS) {
  const dir = path.join(ROOT, name);
  if (!fs.existsSync(dir)) continue;

  // Le lot 1 mérite un mot avant d'être écarté : il n'a peut-être jamais tourné.
  if (name === "tred-lot1" && fs.existsSync(path.join(dir, "patch-lot1.mjs"))) {
    notes.push(
      "tred-lot1\\patch-lot1.mjs existe mais le lot 1 n'est pas appliqué.\n" +
        "     Ce dossier est laissé en place — voir la fin de ce message.",
    );
    continue;
  }

  fs.mkdirSync(TRASH, { recursive: true });

  // On déplace, on ne supprime pas : si l'un de ces dossiers contenait quelque
  // chose à toi, il est encore là, à côté.
  let dest = path.join(TRASH, name);
  let n = 2;
  while (fs.existsSync(dest)) dest = path.join(TRASH, `${name}-${n++}`);

  fs.renameSync(dir, dest);
  console.log(`✅ ${name}\\ → _a-supprimer\\${path.basename(dest)}`);
  ok++;
}

// Ce dossier ne doit surtout pas partir sur Railway.
const giPath = path.join(ROOT, ".gitignore");
if (fs.existsSync(giPath)) {
  const gi = fs.readFileSync(giPath, "utf8");
  if (!gi.split(/\r?\n/).includes("_a-supprimer/")) {
    fs.writeFileSync(giPath, gi.replace(/\s*$/, "\n") + "_a-supprimer/\n", "utf8");
    console.log("✅ .gitignore — _a-supprimer/ ignoré");
    ok++;
  }
}

/* ══ 3. Où en est le lot 1 ? ═══════════════════════════════════════════ */

const mail = path.join(ROOT, "packages", "web", "src", "api", "lib", "mail.ts");
const lot1Applied = fs.existsSync(mail);

console.log(`\n${ok} correction(s) appliquée(s)`);

if (notes.length) {
  console.log("\n⚠️  À savoir :");
  for (const n of notes) console.log("   • " + n);
}

if (lot1Applied) {
  console.log("\n✅ Lot 1 en place (api/lib/mail.ts trouvé).");
} else {
  console.log(`
════════════════════════════════════════════════════════════════
  LE LOT 1 N'EST PAS APPLIQUÉ.
════════════════════════════════════════════════════════════════

  Il contient la réinitialisation du mot de passe. Sans elle, un
  étudiant qui se trompe de mot de passe à l'inscription est bloqué
  définitivement — personne ne peut le débloquer, pas même toi.

  C'est plus important que la recherche.
`);
}

console.log("\n👉 Ensuite :  bun run verify");
