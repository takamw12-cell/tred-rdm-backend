// Libellés manquants de la page Réglages.
//
//   node patch-reglages.mjs
//
// Les deux fichiers de page sont livrés entiers dans ce zip ; il ne reste que
// les textes à ajouter, dans chaque langue traduite.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "packages", "web", "src", "web", "i18n", "messages");

const TEXTS = {
  de: {
    subtitle: "Verwalte deine Einstellungen, dein Abo und dein Konto.",
    themeLabel: "Erscheinungsbild",
    themeLight: "Hell",
    themeDark: "Dunkel",
    themeSystem: "System",
    fontSizeLabel: "Schriftgröße",
    fontSizeDesc: "Gilt für Erklärungen, Formeln und Übungen.",
    interfaceLanguageDesc:
      "Sprachen mit · sind nur für den Tutor — die Oberfläche bleibt in der bisherigen Sprache.",
    exportFailed: "Der Export konnte nicht erstellt werden.",
    deleteFailed: "Das Konto konnte nicht gelöscht werden.",
    deleteConfirmLabel: "Zur Bestätigung LÖSCHEN eingeben",
    footnote: "Alle Einstellungen werden sofort gespeichert.",
  },
  fr: {
    subtitle: "Gère tes préférences, ton abonnement et ton compte.",
    themeLabel: "Thème",
    themeLight: "Clair",
    themeDark: "Sombre",
    themeSystem: "Système",
    fontSizeLabel: "Taille du texte",
    fontSizeDesc: "S'applique aux explications, aux formules et aux exercices.",
    interfaceLanguageDesc:
      "Les langues marquées d'un · valent pour le tuteur seulement — l'interface garde sa langue actuelle.",
    exportFailed: "L'export n'a pas pu être créé.",
    deleteFailed: "Le compte n'a pas pu être supprimé.",
    deleteConfirmLabel: "Saisis LÖSCHEN pour confirmer",
    footnote: "Chaque réglage est enregistré immédiatement.",
  },
  en: {
    subtitle: "Manage your preferences, your plan and your account.",
    themeLabel: "Theme",
    themeLight: "Light",
    themeDark: "Dark",
    themeSystem: "System",
    fontSizeLabel: "Text size",
    fontSizeDesc: "Applies to explanations, formulas and exercises.",
    interfaceLanguageDesc:
      "Languages marked · apply to the tutor only — the interface keeps its current language.",
    exportFailed: "The export could not be created.",
    deleteFailed: "The account could not be deleted.",
    deleteConfirmLabel: "Type LÖSCHEN to confirm",
    footnote: "Every setting is saved immediately.",
  },
  es: {
    subtitle: "Gestiona tus preferencias, tu suscripción y tu cuenta.",
    themeLabel: "Tema",
    themeLight: "Claro",
    themeDark: "Oscuro",
    themeSystem: "Sistema",
    fontSizeLabel: "Tamaño del texto",
    fontSizeDesc: "Se aplica a explicaciones, fórmulas y ejercicios.",
    interfaceLanguageDesc:
      "Los idiomas marcados con · valen solo para el tutor — la interfaz mantiene su idioma actual.",
    exportFailed: "No se pudo crear la exportación.",
    deleteFailed: "No se pudo eliminar la cuenta.",
    deleteConfirmLabel: "Escribe LÖSCHEN para confirmar",
    footnote: "Cada ajuste se guarda de inmediato.",
  },
};

if (!fs.existsSync(DIR)) {
  console.log(`\n⚠️  Dossier introuvable : ${path.relative(ROOT, DIR)}`);
  console.log("   Tu n'es pas à la racine du projet.\n");
  process.exit(1);
}

let ok = 0;
let skipped = 0;
const failed = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith(".ts"))) {
  const locale = path.basename(file, ".ts");
  const full = path.join(DIR, file);
  const before = fs.readFileSync(full, "utf8");

  if (/^\s*themeLight:/m.test(before)) {
    console.log(`⏭️  ${file} — déjà fait`);
    skipped++;
    continue;
  }

  // On s'accroche à l'ouverture du bloc `settings:`, qui existe dans les
  // quatre fichiers. Les clés s'ajoutent à côté des existantes.
  const anchor = before.match(/^(\s*settings:\s*\{)$/m);
  if (!anchor) {
    failed.push(`${file} — bloc settings introuvable`);
    continue;
  }

  const texts = TEXTS[locale] ?? TEXTS.en;
  const lines = Object.entries(texts)
    .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
    .join("\n");

  fs.writeFileSync(full + ".bak", before, "utf8");
  fs.writeFileSync(full, before.replace(anchor[0], `${anchor[0]}\n${lines}`), "utf8");
  console.log(`✅ ${file}`);
  ok++;
}

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);
for (const f of failed) console.log("   • " + f);

console.log("\n👉 Ensuite :  bun run verify");
