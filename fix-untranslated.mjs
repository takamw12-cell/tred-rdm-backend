// Trouve — et corrige — les libellés restés en allemand dans les autres langues.
//
//   node fix-untranslated.mjs           → rapport seul, ne modifie rien
//   node fix-untranslated.mjs --write   → applique les corrections connues
//
// Ce que ça règle : « Vorlesung », « Klausur », « Exercices & Klausuren »,
// « 1 docs » restent en allemand même quand l'interface est en français. La
// chaîne de traduction fonctionne — c'est la VALEUR traduite qui est restée
// identique à l'allemand.
//
// Distinction qui guide ce fichier :
//   • le vocabulaire de la MATIÈRE reste en allemand (Biegemoment, Querkraft,
//     Flächenträgheitsmoment) — c'est celui de l'examen que l'étudiant passera ;
//   • le vocabulaire de l'INTERFACE se traduit (cours, examen, documents) —
//     un étudiant français qui lit « Klausur » dans un menu est juste perdu.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MSG = path.join(ROOT, "packages", "web", "src", "web", "i18n", "messages");
const WRITE = process.argv.includes("--write");

if (!fs.existsSync(MSG)) {
  console.error(`❌ Introuvable : ${path.relative(ROOT, MSG)}`);
  process.exit(1);
}

/** Corrections du vocabulaire académique. Clé → { langue: valeur }. */
const FIXES = {
  kindVorlesung: {
    en: "Lecture", fr: "Cours", es: "Clase", it: "Lezione", pt: "Aula",
    nl: "College", pl: "Wykład", ru: "Лекция", tr: "Ders", ro: "Curs",
    ar: "محاضرة", zh: "课程讲义", ja: "講義", hi: "व्याख्यान", bn: "লেকচার",
  },
  kindKlausur: {
    en: "Exam", fr: "Examen", es: "Examen", it: "Esame", pt: "Exame",
    nl: "Tentamen", pl: "Egzamin", ru: "Экзамен", tr: "Sınav", ro: "Examen",
    ar: "امتحان", zh: "考试", ja: "試験", hi: "परीक्षा", bn: "পরীক্ষা",
  },
};

/** Libellés composites mi-traduits, corrigés par remplacement exact. */
const REPLACE = {
  "{count} docs": {
    en: "{count} documents", fr: "{count} documents", es: "{count} documentos",
    it: "{count} documenti", pt: "{count} documentos", nl: "{count} documenten",
    pl: "{count} dokumentów", ru: "{count} документов", tr: "{count} belge",
    ro: "{count} documente", ar: "{count} مستند", zh: "{count} 份文档",
    ja: "{count} 件の資料", hi: "{count} दस्तावेज़", bn: "{count} নথি",
  },
  "Exercices & Klausuren": { fr: "Exercices & examens" },
  "Exercises & Klausuren": { en: "Exercises & exams" },
  "Ejercicios & Klausuren": { es: "Ejercicios y exámenes" },
};

/** Termes techniques qui DOIVENT rester en allemand — jamais signalés. */
const KEEP_GERMAN = [
  "Flächenträgheitsmoment", "Querkraft", "Biegemoment", "Spannung",
  "Auftrieb", "Wirkungsgrad", "Spannungsteiler", "Übertragungsfunktion",
  "Widerstand", "Klausur", "Vorlesung", "TRED", "Semester",
];

const files = fs.readdirSync(MSG).filter((f) => f.endsWith(".ts"));
const deFile = path.join(MSG, "de.ts");
if (!fs.existsSync(deFile)) {
  console.error("❌ messages/de.ts introuvable.");
  process.exit(1);
}

/** Extrait les paires `clé: "valeur"` d'un fichier de messages. */
function pairs(src) {
  const out = new Map();
  for (const m of src.matchAll(/^\s{4}(\w+):\s*"((?:[^"\\]|\\.)*)",?\s*$/gm)) {
    out.set(m[1], m[2]);
  }
  return out;
}

const deSrc = fs.readFileSync(deFile, "utf8");
const dePairs = pairs(deSrc);

console.log(`Référence : de.ts (${dePairs.size} libellés)\n`);

let totalFixed = 0;
const report = [];

for (const file of files) {
  const code = file.replace(/\.ts$/, "");
  if (code === "de") continue;

  const p = path.join(MSG, file);
  let src = fs.readFileSync(p, "utf8");
  const before = src;
  const mine = pairs(src);

  let fixed = 0;

  // 1. Corrections ciblées du vocabulaire académique.
  for (const [key, table] of Object.entries(FIXES)) {
    const want = table[code];
    if (!want) continue;
    const current = mine.get(key);
    if (current === undefined || current === want) continue;
    // On ne corrige que si la valeur est encore l'allemande.
    if (current !== dePairs.get(key)) continue;
    const re = new RegExp(`^(\\s{4}${key}:\\s*)"(?:[^"\\\\]|\\\\.)*"`, "m");
    if (re.test(src)) {
      src = src.replace(re, `$1${JSON.stringify(want)}`);
      fixed++;
    }
  }

  // 2. Libellés composites.
  for (const [from, table] of Object.entries(REPLACE)) {
    const want = table[code];
    if (!want || !src.includes(from)) continue;
    src = src.split(from).join(want);
    fixed++;
  }

  // 3. Détection : quels libellés sont encore mot pour mot l'allemand ?
  const identical = [];
  for (const [key, value] of mine) {
    if (dePairs.get(key) !== value) continue;
    if (!value.trim() || value.length < 3) continue;
    if (KEEP_GERMAN.some((w) => value.includes(w))) continue;
    if (/^[\d\s{}.,:%€$-]+$/.test(value)) continue; // formats, pas du texte
    identical.push(key);
  }

  report.push({ code, fixed, identical: identical.length, sample: identical.slice(0, 6) });

  if (WRITE && src !== before) {
    fs.writeFileSync(p + ".bak", before, "utf8");
    fs.writeFileSync(p, src, "utf8");
    totalFixed += fixed;
  }
}

console.log("langue │ corrigés │ encore identiques à l'allemand");
console.log("───────┼──────────┼──────────────────────────────");
for (const r of report.sort((a, b) => b.identical - a.identical)) {
  const s = r.sample.length ? `  ex. ${r.sample.join(", ")}` : "";
  console.log(
    `  ${r.code.padEnd(4)} │ ${String(r.fixed).padStart(8)} │ ${String(r.identical).padStart(4)}${s}`,
  );
}

console.log("");
if (!WRITE) {
  console.log("Rapport seul — rien n'a été modifié.");
  console.log("Pour appliquer :  node fix-untranslated.mjs --write");
} else {
  console.log(`✅ ${totalFixed} libellé(s) corrigé(s). Sauvegardes en .bak à côté.`);
}

console.log("");
console.log("La colonne de droite compte les libellés encore mot pour mot en");
console.log("allemand. Un chiffre élevé sur une langue = fichier jamais traduit");
console.log("(copie de l'anglais ou de l'allemand). Les termes techniques");
console.log("volontairement conservés — Querkraft, Biegemoment — ne sont pas comptés.");
console.log("");
console.log("👉 bunx tsc --noEmit -p packages\\web");
