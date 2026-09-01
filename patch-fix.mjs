// Trois corrections :
//   A. le pied de page légal dans layout.tsx (le motif avait changé)
//   B. suppression du réglage « Code de calcul » (MATLAB / Python)
//   C. la langue enfin respectée par le chat
//
//   node patch-fix.mjs
//
// Idempotent, .bak avant chaque écriture.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB = path.join(ROOT, "packages", "web", "src", "web");
const API = path.join(ROOT, "packages", "web", "src", "api");

const F = {
  layout: path.join(WEB, "components", "layout.tsx"),
  settings: path.join(WEB, "pages", "settings.tsx"),
  agent: path.join(API, "agent", "index.ts"),
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

/* ══ A. Pied de page légal ═════════════════════════════════════════════ */

patch("layout.tsx — liens légaux", F.layout, (s) => {
  if (s.includes("LegalFooter")) return null;

  let out = s;

  const btnImp = out.match(/^import \{ Button \} from "@\/components\/ui\/button";$/m);
  const anyImp = btnImp ?? out.match(/^import .*$/m);
  if (!anyImp) return undefined;
  out = out.replace(
    anyImp[0],
    `${anyImp[0]}\nimport { LegalFooter } from "@/components/legal-footer";`,
  );

  // Cette fois on cherche la balise <main> par sa FORME, pas par ses classes :
  // la version précédente échouait parce que tes classes avaient changé.
  const main = out.match(/^([ \t]*)<main\b[^>]*>\{children\}<\/main>[ \t]*$/m);
  if (!main) return undefined;

  const indent = main[1];
  return out.replace(
    main[0],
    `${main[0]}

${indent}{/* « Ständig verfügbar » : joignable depuis chaque page. */}
${indent}<footer className="border-border border-t px-4 py-5 pb-20 lg:pb-5">
${indent}  <LegalFooter />
${indent}</footer>`,
  );
});

/* ══ B. Le réglage « Code de calcul » disparaît ════════════════════════ */

// On retire l'ENCART, pas la plomberie. `codeLang` reste dans le store avec sa
// valeur par défaut « python », et le serveur continue de l'accepter. Arracher
// la chaîne entière toucherait cinq fichiers pour supprimer un encart : le
// rapport bénéfice/risque n'y est pas. Plus rien ne s'affiche, plus rien ne se
// règle — le résultat visible est le même.
patch("settings.tsx — suppression de « Code de calcul »", F.settings, (s) => {
  if (!s.includes("settings.codeSection")) return null;

  let out = s;

  // La section entière, du commentaire jusqu'à la balise fermante.
  const block = out.match(
    /\n[ \t]*\{\/\* Calculation \/ code language \*\/\}\n[\s\S]*?<\/SettingSection>\n/,
  );
  if (!block) return undefined;
  out = out.replace(block[0], "\n");

  // Les lignes devenues inutiles. Laissées en place, `tsc` les signalerait
  // comme variables non utilisées et bloquerait la compilation.
  out = out
    .replace(/^\s*const codeLang = usePreferencesStore\(\(s\) => s\.codeLang\);\n/m, "")
    .replace(/^\s*const setCodeLang = usePreferencesStore\(\(s\) => s\.setCodeLang\);\n/m, "");

  // L'import du type n'a plus d'objet ; le store peut encore servir ailleurs.
  out = out.replace(
    /^import \{ usePreferencesStore, type CodeLang \} from "@\/stores\/preferences";$/m,
    `import { usePreferencesStore } from "@/stores/preferences";`,
  );

  // Si plus rien n'utilise le store dans ce fichier, l'import part aussi.
  const stillUsed = /usePreferencesStore\(/.test(
    out.replace(/^import .*usePreferencesStore.*$/m, ""),
  );
  if (!stillUsed) {
    out = out.replace(/^import \{ usePreferencesStore \} from "@\/stores\/preferences";\n/m, "");
  }

  // L'icône Calculator ne sert plus que là ; on ne la retire que si c'est vrai.
  const calcUsed = (out.match(/\bCalculator\b/g) ?? []).length;
  if (calcUsed === 1) {
    out = out
      .replace(/(\n\s*)Calculator,(?=\n)/, "")
      .replace(/\bCalculator,\s*/, "")
      .replace(/,\s*Calculator\b/, "");
  }

  return out;
});

/* ══ C. La langue, enfin respectée ═════════════════════════════════════ */

patch("agent/index.ts — la langue passe avant tout", F.agent, (s) => {
  if (s.includes("LANG_RULE")) return null;

  let out = s;

  /* ── Pourquoi ça ne marchait pas ────────────────────────────────────────
   *
   * Une seule ligne demandait la langue — « Antworte in dieser Sprache » — au
   * milieu de cinq cents lignes rédigées EN ALLEMAND, suivies de documents de
   * cours EN ALLEMAND. Un modèle suit la langue dominante de ce qu'il lit. Une
   * ligne contre un mur d'allemand ne pèse rien.
   *
   * Trois changements, tous fondés sur la même idée : la consigne doit être
   * écrite DANS la langue demandée, placée EN PREMIER, et répétée EN DERNIER.
   * Le début et la fin d'un prompt sont ce qu'un modèle suit le mieux.
   */
  const langTable = `
/**
 * Consigne de langue — dans la langue elle-même.
 *
 * Écrire « réponds en français » EN FRANÇAIS pèse infiniment plus lourd que la
 * même phrase en allemand : le modèle bascule dès la lecture de la consigne.
 * C'est la correction principale du défaut « le chat ne suit pas la langue ».
 */
const LANG_RULE: Record<string, { label: string; top: string; bottom: string }> = {
  de: {
    label: "Deutsch",
    top: dedent\`
      SPRACHREGEL — GILT VOR ALLEM ANDEREN
      Du antwortest auf DEUTSCH.\`,
    bottom: "ERINNERUNG: Deine Antwort ist auf DEUTSCH.",
  },
  fr: {
    label: "Français",
    top: dedent\`
      RÈGLE DE LANGUE — PRIORITAIRE SUR TOUT LE RESTE
      Tu réponds en FRANÇAIS, entièrement.

      Le reste de ces instructions est rédigé en allemand, et les documents de
      cours sont en allemand : cela ne change rien. Ta réponse est en français.
      Seuls les termes techniques allemands sont conservés (voir NIVEAU 3).\`,
    bottom: "RAPPEL FINAL : ta réponse est rédigée en FRANÇAIS.",
  },
  en: {
    label: "English",
    top: dedent\`
      LANGUAGE RULE — TAKES PRECEDENCE OVER EVERYTHING ELSE
      You answer in ENGLISH, entirely.

      The rest of these instructions is written in German, and the course
      documents are in German: this changes nothing. Your answer is in English.
      Only German technical terms are kept (see NIVEAU 3).\`,
    bottom: "FINAL REMINDER: your answer is written in ENGLISH.",
  },
};

/** Repli : on nomme le code de langue plutôt que de retomber en allemand. */
function langRule(locale?: string) {
  const known = locale ? LANG_RULE[locale] : undefined;
  if (known) return known;
  const code = locale ?? "de";
  return {
    label: code,
    top: dedent\`
      LANGUAGE RULE — TAKES PRECEDENCE OVER EVERYTHING ELSE
      You answer entirely in the language with the code "\${code}".\`,
    bottom: \`FINAL REMINDER: answer in the language with the code "\${code}".\`,
  };
}
`;

  // La table se pose juste après l'ancienne, qui ne sert plus qu'aux libellés.
  const oldTable = out.match(/^const LANG_LABEL: Record<string, string> = \{[\s\S]*?\n\};\n/m);
  if (!oldTable) return undefined;
  out = out.replace(oldTable[0], oldTable[0] + langTable);

  // `lang` vient désormais de la table complète.
  const langLine = out.match(/^\s*const lang = LANG_LABEL\[opts\.locale\][^\n]*\n/m);
  if (!langLine) return undefined;
  out = out.replace(
    langLine[0],
    "  const rule = langRule(opts.locale);\n  const lang = rule.label;\n",
  );

  // 1. La consigne EN PREMIER, avant même l'identité.
  const niveau1 = out.match(
    /^([ \t]*)═{10,}\n[ \t]*NIVEAU 1 — IDENTITÄT & GRUNDREGELN\n/m,
  );
  if (!niveau1) return undefined;
  const ind = niveau1[1];
  out = out.replace(
    niveau1[0],
    `${ind}\${rule.top}\n\n${niveau1[0]}`,
  );

  // 2. La consigne EN DERNIER. La fin d'un prompt est ce qu'un modèle suit le
  //    mieux — mieux encore que le début.
  const student = out.match(
    /^\s*\$\{student \? `\\nDer\/die Studierende heißt[^\n]*\n/m,
  );
  if (!student) return undefined;
  out = out.replace(student[0], student[0] + `${ind}\n${ind}\${rule.bottom}\n`);

  // 3. Le mode examen imposait l'allemand quel que soit le choix.
  out = out.replace(
    "Antworte NUR auf Deutsch. Gib KEINE Hinweise oder Lösungen vorab.",
    "Antworte NUR in ${lang}. Gib KEINE Hinweise oder Lösungen vorab.",
  );

  return out;
});

/* ══ Bilan ═════════════════════════════════════════════════════════════ */

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);

if (failed.length) {
  console.log("\n⚠️  À faire à la main :");
  for (const f of failed) console.log("   • " + f);
  console.log("\n   Envoie-moi le fichier concerné, je réajuste.");
}

console.log("\n👉 Ensuite :  bun run verify");
