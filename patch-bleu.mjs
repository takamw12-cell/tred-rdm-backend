// Palette « bleu calque » : remplace le turquoise dans styles.css.
//
//   node patch-bleu.mjs
//
// Le script ne remplace pas du texte au hasard : il repère les blocs `:root`
// et `.dark`, puis réécrit la VALEUR des jetons qu'il connaît, par leur nom.
// Un jeton absent est ignoré, un jeton déjà bleu est laissé tel quel — d'où
// l'idempotence. Sauvegarde .bak avant écriture.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CSS = path.join(ROOT, "packages", "web", "src", "web", "styles.css");

/* ── Ce qui change, et ce qui ne change pas ────────────────────────────────
 *
 * Le bleu a EXACTEMENT la clarté du turquoise qu'il remplace : #0f4f49 et
 * #10427b ont la même luminosité perçue, #3fbfa8 et #72aaf2 aussi. Les boutons
 * ne deviennent donc ni plus lourds ni plus clairs — seule la teinte tourne.
 * C'est ce qui évite l'impression de thème plaqué par-dessus.
 *
 * Les neutres sont très légèrement refroidis (leur teinte passe du vert au
 * bleu, à saturation et clarté constantes) pour ne pas jurer avec l'accent.
 *
 * NE CHANGENT PAS : l'ambre `--signature`, le vert `--mastered`, le rouge
 * `--destructive`. Ce sont des couleurs de SENS, pas de marque — les faire
 * suivre l'accent leur ferait perdre ce qu'elles signalent.
 */

const LIGHT = {
  "--background": "#f3f5f7",
  "--foreground": "#15181b",
  "--card-foreground": "#15181b",
  "--popover-foreground": "#15181b",
  "--primary": "#10427b",
  "--primary-foreground": "#f5f7fa",
  "--signature-foreground": "#15181b",
  "--secondary": "#e8ebf0",
  "--secondary-foreground": "#2a3138",
  "--muted": "#e8ebf0",
  "--muted-foreground": "#59616b",
  "--accent": "#e0e5ec",
  "--accent-foreground": "#15181b",
  "--border": "#dde1e7",
  "--input": "#d3d8e0",
  "--ring": "#10427b",
  "--new": "#98a1ab",
  "--chart-1": "#10427b",
  "--chart-2": "#4a7cb8",
  "--chart-5": "#59616b",
  "--sidebar": "#eef1f5",
  "--sidebar-foreground": "#15181b",
  "--sidebar-primary": "#10427b",
  "--sidebar-primary-foreground": "#f5f7fa",
  "--sidebar-accent": "#e0e5ec",
  "--sidebar-accent-foreground": "#15181b",
  "--sidebar-border": "#dde1e7",
  "--sidebar-ring": "#10427b",
  "--grid-line": "rgb(21 24 27 / 0.05)",
};

const DARK = {
  "--background": "#0f1215",
  "--foreground": "#e7eaef",
  "--card": "#171a1f",
  "--card-foreground": "#e7eaef",
  "--popover": "#171a1f",
  "--popover-foreground": "#e7eaef",
  "--primary": "#72aaf2",
  "--primary-foreground": "#06182e",
  "--signature-foreground": "#15181b",
  "--secondary": "#1f242c",
  "--secondary-foreground": "#e7eaef",
  "--muted": "#1f242c",
  "--muted-foreground": "#99a1ad",
  "--accent": "#282f38",
  "--accent-foreground": "#e7eaef",
  "--border": "rgb(231 234 239 / 0.12)",
  "--input": "rgb(231 234 239 / 0.18)",
  "--ring": "#72aaf2",
  "--new": "#6b7480",
  "--chart-1": "#72aaf2",
  "--chart-2": "#a8c9f8",
  "--chart-5": "#99a1ad",
  "--sidebar": "#12161b",
  "--sidebar-foreground": "#e7eaef",
  "--sidebar-primary": "#72aaf2",
  "--sidebar-primary-foreground": "#06182e",
  "--sidebar-accent": "#282f38",
  "--sidebar-accent-foreground": "#e7eaef",
  "--sidebar-border": "rgb(231 234 239 / 0.12)",
  "--sidebar-ring": "#72aaf2",
  "--grid-line": "rgb(231 234 239 / 0.045)",
};

/** Teinte du fond animé : plus soutenue que celle des boutons, voir plus bas. */
const AMB = { light: "#1d4ed8", dark: "#7aa7ff" };

/**
 * Découpe le bloc qui suit un sélecteur, en comptant les accolades.
 *
 * Une recherche naïve de la première `}` s'arrêterait à la fin du premier
 * commentaire contenant une accolade. Ici on compte, donc les blocs imbriqués
 * et les commentaires ne posent pas de problème.
 */
function blockRange(source, selector) {
  const at = source.indexOf(selector);
  if (at === -1) return null;
  const open = source.indexOf("{", at);
  if (open === -1) return null;

  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return { start: open + 1, end: i };
    }
  }
  return null;
}

/** Réécrit la valeur des jetons connus à l'intérieur d'un bloc. */
function rewrite(block, map) {
  let out = block;
  let changed = 0;

  for (const [token, value] of Object.entries(map)) {
    // Le nom exact, suivi de deux-points : `--border` ne doit pas attraper
    // `--border-radius` ni `--sidebar-border`.
    const re = new RegExp(`(^|\\n)(\\s*)${token}:\\s*[^;]+;`, "g");
    out = out.replace(re, (whole, lead, indent) => {
      if (whole.includes(`: ${value};`)) return whole;
      changed++;
      return `${lead}${indent}${token}: ${value};`;
    });
  }

  return { out, changed };
}

/** Ajoute `--amb` juste après `--grid-step` (clair) ou `--grid-line` (sombre). */
function addAmb(block, value, comment) {
  if (/^\s*--amb:/m.test(block)) return { out: block, changed: 0 };

  const anchor = block.match(/^(\s*)--grid-(?:step|line):[^;]+;/m);
  if (!anchor) return { out: block, changed: 0 };

  const indent = anchor[1];
  const insertion =
    `${anchor[0]}\n\n${indent}${comment}\n${indent}--amb: ${value};`;

  return { out: block.replace(anchor[0], insertion), changed: 1 };
}

/* ── Application ───────────────────────────────────────────────────────── */

if (!fs.existsSync(CSS)) {
  console.log(`⚠️  Fichier introuvable : ${path.relative(ROOT, CSS)}`);
  console.log("   Tu n'es pas à la racine du projet, ou l'arborescence a changé.");
  process.exit(1);
}

const before = fs.readFileSync(CSS, "utf8");
let source = before;
let total = 0;
const problems = [];

for (const [selector, map, amb, comment] of [
  [
    ":root {",
    LIGHT,
    AMB.light,
    "/* Teinte du fond animé — voir components/ambient-background.tsx */",
  ],
  [
    ".dark {",
    DARK,
    AMB.dark,
    "/* Teinte du fond animé — voir components/ambient-background.tsx */",
  ],
]) {
  const range = blockRange(source, selector);
  if (!range) {
    problems.push(`bloc ${selector.slice(0, -2)} introuvable`);
    continue;
  }

  const block = source.slice(range.start, range.end);
  const step1 = rewrite(block, map);
  const step2 = addAmb(step1.out, amb, comment);

  source = source.slice(0, range.start) + step2.out + source.slice(range.end);
  const n = step1.changed + step2.changed;
  total += n;
  console.log(
    n > 0
      ? `✅ ${selector.slice(0, -2)} — ${n} valeur(s) réécrite(s)`
      : `⏭️  ${selector.slice(0, -2)} — déjà en bleu`,
  );
}

// Le commentaire allemand parlait du vert profond qui devient vert vif.
source = source.replace(
  /\/\* Auf Schiefer trägt das tiefe Grün nicht mehr[\s\S]*?\*\//,
  `/* Auf Schiefer trägt das tiefe Blau nicht mehr — es wird zu hellem Blau,
     damit Schaltflächen den Kontrast für dunkle Schrift behalten. */`,
);

if (source !== before) {
  fs.writeFileSync(CSS + ".bak", before, "utf8");
  fs.writeFileSync(CSS, source, "utf8");
}

console.log(`\n${total} valeur(s) modifiée(s) dans styles.css`);

if (problems.length) {
  console.log("\n⚠️  À vérifier :");
  for (const p of problems) console.log("   • " + p);
}

console.log("\n👉 Ensuite :  bun run verify");
