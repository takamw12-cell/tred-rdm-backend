// Ce qu'il te reste à compléter dans les textes juridiques.
//
//   node check-legal.mjs      (ou : bun run legal)
//
// Ne modifie rien. Ne bloque rien. Il lit le fichier et te dit ce qui manque,
// document par document, pour que tu ne le découvres pas dans une lettre
// d'avocat.

import fs from "node:fs";
import path from "node:path";

const FILE = path.join(
  process.cwd(),
  "packages", "web", "src", "web", "data", "legal.ts",
);

if (!fs.existsSync(FILE)) {
  console.log(`⚠️  Fichier introuvable : ${path.relative(process.cwd(), FILE)}`);
  console.log("   Tu n'es pas à la racine du projet, ou le zip n'a pas été décompressé.");
  process.exit(1);
}

const source = fs.readFileSync(FILE, "utf8");

/**
 * Découpe le fichier par document.
 *
 * Chaque texte est un littéral de gabarit ouvert par « nom: ` » et fermé par
 * « `, ». On coupe là-dessus plutôt que d'importer le module : ce script doit
 * tourner sous node sans compilateur TypeScript.
 */
const DOCS = ["impressum", "datenschutz", "widerruf", "agb"];
const TITLES = {
  impressum: "Impressum",
  datenschutz: "Datenschutzerklärung",
  widerruf: "Widerrufsbelehrung",
  agb: "AGB",
};

let total = 0;
const rows = [];

for (const doc of DOCS) {
  const re = new RegExp(`\\n  ${doc}: \`([\\s\\S]*?)\`,\\n`);
  const found = source.match(re);

  if (!found) {
    rows.push({ doc, missing: null });
    continue;
  }

  // Les crochets contenant du texte court sur une seule ligne. Les tableaux
  // Markdown et les liens n'en produisent pas dans ces documents.
  const holes = found[1].match(/\[[^\]\n]{2,60}\]/g) ?? [];
  const unique = [...new Set(holes)];
  total += unique.length;
  rows.push({ doc, missing: unique });
}

console.log("\n  Textes juridiques — ce qu'il reste à compléter\n");

for (const { doc, missing } of rows) {
  const title = TITLES[doc];

  if (missing === null) {
    console.log(`  ⚠️  ${title} — texte introuvable dans data/legal.ts`);
    continue;
  }
  if (missing.length === 0) {
    console.log(`  ✅ ${title} — complet`);
    continue;
  }

  console.log(`  ❌ ${title} — ${missing.length} à compléter`);
  for (const hole of missing) console.log(`        ${hole}`);
}

console.log(`
  ────────────────────────────────────────────────────────────────
  ${total === 0 ? "Tout est rempli." : `${total} emplacement(s) au total.`}

  Le plus souvent oublié : le NUMÉRO DE TÉLÉPHONE. § 5 DDG exige un
  moyen de contact permettant une communication rapide et directe ;
  une adresse e-mail seule a été jugée insuffisante à plusieurs
  reprises. Un numéro de portable suffit.

  Ces textes décrivent fidèlement ce que ton code fait — c'est leur
  valeur. Ils ne sont pas pour autant validés : fais-les relire par
  un avocat avant d'ouvrir l'inscription au public. Une relecture
  d'un texte déjà exact coûte une fraction d'une rédaction.
  ────────────────────────────────────────────────────────────────
`);
