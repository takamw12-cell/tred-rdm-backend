// Fond animé : montage sur la page de connexion et derrière l'application.
//
//   node patch-fond.mjs
//
// Idempotent, .bak avant chaque écriture.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB = path.join(ROOT, "packages", "web", "src", "web");

const F = {
  login: path.join(WEB, "pages", "login.tsx"),
  layout: path.join(WEB, "components", "layout.tsx"),
  component: path.join(WEB, "components", "ambient-background.tsx"),
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

if (!fs.existsSync(F.component)) {
  failed.push(
    "ambient-background.tsx absent — le zip n'a pas été décompressé à la racine du projet.",
  );
}

/* ══ A. Page de connexion — variante visible ═══════════════════════════ */

patch("login.tsx — fond « hero »", F.login, (s) => {
  if (s.includes("AmbientBackground")) return null;

  const root = `    <div className="paper-grid relative flex min-h-screen items-center justify-center overflow-hidden px-4">`;
  if (!s.includes(root)) return undefined;

  let out = s;

  const btnImp = `import { Button } from "@/components/ui/button";`;
  if (!out.includes(btnImp)) return undefined;
  out = out.replace(
    btnImp,
    `${btnImp}\nimport { AmbientBackground } from "@/components/ambient-background";`,
  );

  // `paper-grid` disparaît : le composant dessine désormais la même trame, avec
  // les mêmes jetons `--grid-line` et `--grid-step`. En garder deux
  // superposées ferait apparaître des lignes doubles.
  out = out.replace(
    root,
    `    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <AmbientBackground variant="hero" />`,
  );

  return out;
});

/* ══ B. Coquille de l'application — variante discrète ══════════════════ */

patch("layout.tsx — fond « ambient »", F.layout, (s) => {
  if (s.includes("AmbientBackground")) return null;

  const root = `    <div className="bg-background flex min-h-screen">`;
  if (!s.includes(root)) return undefined;

  let out = s;

  const btnImp = `import { Button } from "@/components/ui/button";`;
  if (!out.includes(btnImp)) return undefined;
  out = out.replace(
    btnImp,
    `${btnImp}\nimport { AmbientBackground } from "@/components/ambient-background";`,
  );

  // `bg-background` s'en va : cette couleur est déjà peinte par <body> dans
  // styles.css. La garder ici poserait un aplat opaque PAR-DESSUS le fond, qui
  // deviendrait invisible.
  out = out.replace(
    root,
    `    <div className="relative flex min-h-screen">
      <AmbientBackground />`,
  );

  return out;
});

/* ══ Bilan ═════════════════════════════════════════════════════════════ */

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);

if (failed.length) {
  console.log("\n⚠️  À faire à la main :");
  for (const f of failed) console.log("   • " + f);
}

console.log("\n👉 Ensuite :  bun run verify");
