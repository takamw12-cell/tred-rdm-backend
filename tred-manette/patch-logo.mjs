// Nouveau logo TRED — la manette.
//
//   node patch-logo.mjs
//
// À lancer depuis la racine du projet (C:\dev\tred-rdm\aerostudy-ai).
// Le script ne modifie que ce qu'il reconnaît, sauvegarde chaque fichier
// touché en .bak, et peut être relancé sans rien casser.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const SRC = path.join(HERE, "fichiers");

const WEB = path.join(ROOT, "packages", "web");
const LOGO = path.join(WEB, "src", "web", "components", "logo.tsx");
const PUBLIC = path.join(WEB, "public");
const INDEX = path.join(WEB, "index.html");
const MANIFEST = path.join(PUBLIC, "manifest.webmanifest");

if (!fs.existsSync(LOGO)) {
  console.log(`\n⚠️  Introuvable : packages/web/src/web/components/logo.tsx`);
  console.log("   Tu n'es pas à la racine du projet.\n");
  process.exit(1);
}
if (!fs.existsSync(SRC)) {
  console.log("\n⚠️  Le dossier « fichiers » est absent à côté du script.");
  console.log("   Décompresse le zip en entier, ne sors pas le .mjs tout seul.\n");
  process.exit(1);
}

let done = 0;
const skipped = [];

function backup(file) {
  if (fs.existsSync(file) && !fs.existsSync(file + ".bak")) {
    fs.copyFileSync(file, file + ".bak");
  }
}

/* ── 1. Le composant ───────────────────────────────────────────────────── */

backup(LOGO);
fs.copyFileSync(path.join(SRC, "logo.tsx"), LOGO);
console.log("✅ logo.tsx — manette + T jaune, thème clair et sombre");
done++;

/* ── 2. Les icônes ─────────────────────────────────────────────────────── */

fs.mkdirSync(PUBLIC, { recursive: true });
// Pas de .bak sur les icônes : ce sont des binaires, git les garde déjà, et
// dix-huit fichiers de sauvegarde de plus dans le dépôt ne servent personne.
const assets = fs.readdirSync(path.join(SRC, "public"));
for (const name of assets) {
  fs.copyFileSync(path.join(SRC, "public", name), path.join(PUBLIC, name));
}
console.log(`✅ public/ — ${assets.length} icônes remplacées (favicon, PWA, aperçu social)`);
done++;

/* ── 3. index.html : favicon vectoriel + couleur de barre ──────────────── */

if (fs.existsSync(INDEX)) {
  const before = fs.readFileSync(INDEX, "utf8");
  let out = before;

  // Un favicon SVG est net à toutes les tailles ; les .png restent en secours
  // pour les navigateurs qui ne le lisent pas.
  if (!out.includes('href="/favicon.svg"')) {
    const anchor = out.match(/^([ \t]*)<link rel="icon" href="\/favicon\.ico" sizes="any" \/>$/m);
    if (anchor) {
      out = out.replace(
        anchor[0],
        `${anchor[0]}\n${anchor[1]}<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
      );
    } else {
      skipped.push("index.html : lien du favicon introuvable");
    }
  }

  // La barre du navigateur affichait encore le vert sapin d'avant le passage
  // au bleu. On l'aligne sur --primary.
  out = out.replace(
    /<meta name="theme-color" content="#[0-9a-fA-F]{3,8}" \/>/,
    '<meta name="theme-color" content="#10427b" />',
  );

  if (out !== before) {
    backup(INDEX);
    fs.writeFileSync(INDEX, out, "utf8");
    console.log("✅ index.html — favicon vectoriel + theme-color bleu");
    done++;
  } else {
    console.log("⏭️  index.html — déjà à jour");
  }
} else {
  skipped.push("index.html absent");
}

/* ── 4. Le manifeste PWA ───────────────────────────────────────────────── */

if (fs.existsSync(MANIFEST)) {
  // Remplacement chirurgical des deux couleurs, pas une relecture JSON :
  // `JSON.stringify` reformaterait tout le fichier et noierait la vraie
  // modification dans deux cents lignes de diff.
  const before = fs.readFileSync(MANIFEST, "utf8");
  let out = before
    .replace(/"theme_color"\s*:\s*"#[0-9a-fA-F]{3,8}"/, '"theme_color": "#10427b"')
    .replace(/"background_color"\s*:\s*"#[0-9a-fA-F]{3,8}"/, '"background_color": "#f8f9fa"');

  try {
    JSON.parse(out);
  } catch {
    skipped.push("manifest.webmanifest : le résultat n'était plus du JSON, fichier laissé intact");
    out = before;
  }

  if (out !== before) {
    backup(MANIFEST);
    fs.writeFileSync(MANIFEST, out, "utf8");
    console.log("✅ manifest.webmanifest — couleurs alignées sur le thème bleu");
    done++;
  } else {
    console.log("⏭️  manifest.webmanifest — déjà à jour");
  }
} else {
  skipped.push("manifest.webmanifest absent");
}

/* ── Fin ───────────────────────────────────────────────────────────────── */

console.log(`\n${done} modification(s).`);
if (skipped.length) {
  console.log("\nNon traité :");
  for (const s of skipped) console.log("  · " + s);
}
console.log("\n👉 Ensuite :");
console.log("   bun run verify");
console.log("   git add -A && git commit -m \"logo manette\" && git push");
