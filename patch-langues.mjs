// Une seule table de langues, utilisée partout.
//
//   node patch-langues.mjs
//
// Idempotent, .bak avant chaque écriture.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API = path.join(ROOT, "packages", "web", "src", "api");
const WEB = path.join(ROOT, "packages", "web", "src", "web");

const F = {
  agent: path.join(API, "agent", "index.ts"),
  apiIndex: path.join(API, "index.ts"),
  languages: path.join(API, "lib", "languages.ts"),
  messages: path.join(WEB, "i18n", "messages"),
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

if (!fs.existsSync(F.languages)) {
  failed.push("lib/languages.ts absent — décompresse le zip à la racine du projet.");
}

/* ══ A. Le chat ════════════════════════════════════════════════════════ */

patch("agent/index.ts — table unique", F.agent, (s) => {
  if (s.includes('from "../lib/languages"')) return null;

  let out = s;

  // On retire les deux anciennes tables locales, si elles sont là.
  const startLabel = out.indexOf("const LANG_LABEL");
  if (startLabel !== -1) {
    const endLabel = out.indexOf("\n};\n", startLabel);
    if (endLabel === -1) throw new Error("fin de LANG_LABEL introuvable");
    out = out.slice(0, startLabel) + out.slice(endLabel + 4);
  }

  const startRule = out.indexOf("const LANG_RULE");
  if (startRule === -1) {
    throw new Error("applique d'abord patch-fix.mjs (la correction de langue)");
  }
  // De `const LANG_RULE` jusqu'à la fin de `function langRule`.
  const fnStart = out.indexOf("function langRule", startRule);
  if (fnStart === -1) throw new Error("langRule introuvable");
  const fnEnd = out.indexOf("\n}\n", fnStart);
  if (fnEnd === -1) throw new Error("fin de langRule introuvable");

  // On garde les commentaires qui précédaient : ils expliquaient le pourquoi.
  out = out.slice(0, startRule) + "const langRule = langOf;\n" + out.slice(fnEnd + 3);

  // L'import. Une seule source de vérité pour dix langues.
  const firstImport = out.match(/^import .*$/m);
  if (!firstImport) return undefined;
  out = out.replace(
    firstImport[0],
    `${firstImport[0]}\nimport { langOf } from "../lib/languages";`,
  );

  return out;
});

/* ══ B. Exercices, Klausuren, formulaires ══════════════════════════════ */

patch("api/index.ts — table unique", F.apiIndex, (s) => {
  if (s.includes('from "./lib/languages"')) return null;

  let out = s;

  // L'ancienne table locale.
  const start = out.indexOf("const EX_LANG");
  if (start === -1) return undefined;
  const end = out.indexOf("\n};\n", start);
  if (end === -1) throw new Error("fin de EX_LANG introuvable");
  out = out.slice(0, start) + out.slice(end + 4);

  // Les trois sites d'appel sont identiques au caractère près.
  const oldPair = `  const locale = EX_LANG[body.locale ?? ""] ? (body.locale as string) : "de";
  const langLabel = EX_LANG[locale];`;
  const newPair = `  // Repli qui NOMME la langue au lieu de basculer en allemand sans le dire.
  const { code: locale, label: langLabel } = langOf(body.locale);`;

  const count = out.split(oldPair).length - 1;
  if (count === 0) return undefined;
  out = out.split(oldPair).join(newPair);
  console.log(`   ${count} site(s) d'appel réécrit(s)`);

  const chatsImp = `import { chats } from "./routes/chats";`;
  if (!out.includes(chatsImp)) return undefined;
  out = out.replace(
    chatsImp,
    `${chatsImp}\nimport { langOf } from "./lib/languages";`,
  );

  return out;
});

/* ══ C. Contrôle : quelles langues l'interface propose-t-elle ? ════════ */

const covered = new Set([
  "de", "en", "fr", "es", "it", "pt", "nl", "pl",
  "tr", "ru", "uk", "ar", "zh", "ro", "cs",
]);

if (fs.existsSync(F.messages)) {
  const locales = fs
    .readdirSync(F.messages)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => path.basename(f, ".ts"))
    .sort();

  const missing = locales.filter((l) => !covered.has(l));

  console.log(`\n  Langues de l'interface (${locales.length}) : ${locales.join(", ")}`);

  if (missing.length === 0) {
    console.log("  ✅ Toutes couvertes côté serveur.");
  } else {
    console.log(`  ⚠️  Pas encore dans la table : ${missing.join(", ")}`);
    console.log("     Elles fonctionneront, avec une consigne rédigée en anglais");
    console.log("     qui nomme le code. Envoie-moi la liste, j'écris les phrases");
    console.log("     dans ces langues — c'est ce qui fait vraiment basculer le modèle.");
  }
}

/* ══ Bilan ═════════════════════════════════════════════════════════════ */

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);

if (failed.length) {
  console.log("\n⚠️  À faire à la main :");
  for (const f of failed) console.log("   • " + f);
  console.log("\n   Envoie-moi le fichier concerné, je réajuste.");
}

console.log("\n👉 Ensuite :  bun run verify");
