// Trouve les clés de traduction MANQUANTES — celles qui s'affichent en brut.
//
//   node i18n-keys.mjs           → rapport, ne modifie rien
//   node i18n-keys.mjs --write   → comble les trous
//
// Sur ta capture, le chat affiche « chat.why », « chat.explainDifferently »,
// « chat.engineerMode » à la place des libellés. Ce n'est pas une mauvaise
// traduction : la clé n'existe nulle part. `resolve()` ne la trouve pas et
// renvoie le chemin lui-même.
//
// Deux corrections :
//   1. les clés absentes des fichiers autres que l'allemand reçoivent la
//      valeur allemande — au pire l'utilisateur lit de l'allemand, jamais
//      « chat.why » ;
//   2. les clés absentes de l'allemand LUI-MÊME sont listées : elles seules
//      demandent que tu écrives un texte.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const WEB = path.join(ROOT, "packages", "web", "src", "web");
const MSG = path.join(WEB, "i18n", "messages");
const WRITE = process.argv.includes("--write");

if (!fs.existsSync(MSG)) {
  console.error(`❌ Introuvable : ${path.relative(ROOT, MSG)}`);
  process.exit(1);
}

/** Libellés que je connais et qui manquent visiblement. Complète si besoin. */
const KNOWN = {
  "chat.why": {
    de: "Warum?", en: "Why?", fr: "Pourquoi ?", es: "¿Por qué?",
  },
  "chat.explainDifferently": {
    de: "Anders erklären", en: "Explain differently",
    fr: "Explique autrement", es: "Explícalo de otro modo",
  },
  "chat.engineerMode": {
    de: "Ingenieur-Denkweise", en: "Engineer's mindset",
    fr: "Raisonnement d'ingénieur", es: "Mentalidad de ingeniero",
  },
};

/* ── 1. Toutes les clés utilisées dans le code ──────────────────────────── */

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === "i18n") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const used = new Map(); // clé → fichier où elle apparaît en premier
for (const file of walk(WEB)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bt\(\s*["']([a-zA-Z][\w.]*\.[\w.]+)["']/g)) {
    if (!used.has(m[1])) used.set(m[1], path.relative(ROOT, file));
  }
}

console.log(`${used.size} clés utilisées dans le code.\n`);

/* ── 2. Les clés présentes dans chaque fichier de messages ──────────────── */

/** Chemins pointés d'un fichier de messages, avec leur valeur. */
function flatten(input) {
  // Une valeur longue est souvent écrite sur la ligne SUIVANTE :
  //     whyPrompt:
  //       "Warum gilt das …",
  // On la ramène sur une seule ligne, sinon la clé passe pour absente.
  const src = input.replace(/^([ \t]*\w+:)[ \t]*\n[ \t]*("(?:[^"\\]|\\.)*")/gm, "$1 $2");

  const out = new Map();
  const stack = [];
  for (const line of src.split("\n")) {
    const open = line.match(/^(\s*)(\w+):\s*\{\s*$/);
    if (open) {
      const depth = Math.floor(open[1].length / 2);
      stack.length = Math.max(0, depth - 1);
      stack.push(open[2]);
      continue;
    }
    if (/^\s*\},?\s*$/.test(line)) {
      stack.pop();
      continue;
    }
    const kv = line.match(/^\s*(\w+):\s*("(?:[^"\\]|\\.)*")/);
    if (kv) out.set([...stack, kv[1]].join("."), kv[2]);
  }
  return out;
}

const files = fs.readdirSync(MSG).filter((f) => f.endsWith(".ts"));
const packs = new Map();
for (const f of files) {
  packs.set(f.replace(/\.ts$/, ""), {
    file: path.join(MSG, f),
    keys: flatten(fs.readFileSync(path.join(MSG, f), "utf8")),
  });
}

if (!packs.has("de")) {
  console.error("❌ messages/de.ts introuvable.");
  process.exit(1);
}
const de = packs.get("de");

/* ── 3. Ce qui manque ───────────────────────────────────────────────────── */

const missingInDe = [];
for (const [key, file] of used) {
  if (!de.keys.has(key)) missingInDe.push({ key, file });
}

console.log("── absentes de de.ts (la référence) ──────────");
if (missingInDe.length === 0) {
  console.log("  ✅ aucune");
} else {
  for (const { key, file } of missingInDe) {
    const known = KNOWN[key]?.de;
    console.log(`  ${known ? "✅" : "❌"} ${key.padEnd(34)} ${file}`);
    if (!known) console.log(`     ↑ à écrire toi-même, je n'ai pas de libellé pour celle-ci`);
  }
}

console.log("\n── absentes des autres langues ───────────────");
const gaps = new Map();
for (const [code, pack] of packs) {
  if (code === "de") continue;
  const miss = [...de.keys.keys()].filter((k) => !pack.keys.has(k));
  gaps.set(code, miss);
  console.log(`  ${code.padEnd(4)} ${String(miss.length).padStart(4)} manquante(s)`);
}

/* ── 4. Réparation ──────────────────────────────────────────────────────── */

if (!WRITE) {
  console.log("\nRapport seul — rien n'a été modifié.");
  console.log("Pour combler :  node i18n-keys.mjs --write");
  process.exit(0);
}

let added = 0;

/** Insère `clé: "valeur"` dans la bonne section, ou en crée une. */
function insert(src, dotted, value) {
  const parts = dotted.split(".");
  const leaf = parts.pop();
  const section = parts.join(".");
  const indent = "  ".repeat(parts.length + 1);

  // Section existante : on insère juste après sa ligne d'ouverture.
  const openRe = new RegExp(`^(\\s*${parts[parts.length - 1]}:\\s*\\{\\s*)$`, "m");
  if (openRe.test(src)) {
    return src.replace(openRe, `$1\n${indent}${leaf}: ${value},`);
  }
  // Section absente : on l'ajoute avant la dernière accolade de l'objet.
  const last = src.lastIndexOf("\n};");
  if (last === -1 || parts.length !== 1) return null;
  return (
    src.slice(0, last) +
    `\n\n  ${section}: {\n${indent}${leaf}: ${value},\n  },` +
    src.slice(last)
  );
}

// 4a. Les clés manquantes dans de.ts, quand je connais le libellé.
{
  let src = fs.readFileSync(de.file, "utf8");
  const before = src;
  for (const { key } of missingInDe) {
    const label = KNOWN[key]?.de;
    if (!label) continue;
    const next = insert(src, key, JSON.stringify(label));
    if (next) {
      src = next;
      added++;
    }
  }
  if (src !== before) {
    fs.writeFileSync(de.file + ".bak", before, "utf8");
    fs.writeFileSync(de.file, src, "utf8");
    de.keys = flatten(src);
  }
}

// 4b. Les clés manquantes ailleurs : traduction connue, sinon valeur allemande.
for (const [code, pack] of packs) {
  if (code === "de") continue;
  let src = fs.readFileSync(pack.file, "utf8");
  const before = src;

  for (const key of de.keys.keys()) {
    if (pack.keys.has(key)) continue;
    const known = KNOWN[key]?.[code];
    const value = known ? JSON.stringify(known) : de.keys.get(key);
    const next = insert(src, key, value);
    if (next) {
      src = next;
      added++;
    }
  }

  if (src !== before) {
    fs.writeFileSync(pack.file + ".bak", before, "utf8");
    fs.writeFileSync(pack.file, src, "utf8");
  }
}

/* ── 5. Filet de sécurité : repli sur l'allemand ────────────────────────── */
/*
 * Même avec les fichiers complets, une clé ajoutée demain dans le code et
 * oubliée dans les traductions réafficherait « chat.why » à un utilisateur.
 * On remplace donc la valeur de repli : si la langue courante n'a pas la clé,
 * on prend l'allemand. Au pire l'utilisateur lit un mot d'allemand — jamais
 * un chemin technique.
 */
{
  const IDX = path.join(WEB, "i18n", "index.ts");
  if (fs.existsSync(IDX)) {
    const before = fs.readFileSync(IDX, "utf8");
    if (before.includes("__fallbackDe")) {
      console.log("\n⏭️  Repli sur l'allemand déjà en place.");
    } else {
      // Deux formes possibles selon la version d'index.ts.
      const RE =
        /\(key,\s*vars\)\s*=>\s*interpolate\(resolve\((pack|messages\[locale\]),\s*key\),\s*vars\)/;
      const m = before.match(RE);
      if (!m) {
        console.log("\n⚠️  Repli sur l'allemand : motif non reconnu dans i18n/index.ts.");
      } else {
        const source = m[1];
        const replacement =
          `(key, vars) => {\n` +
          `      // __fallbackDe : une clé absente de la langue courante retombe\n` +
          `      // sur l'allemand plutôt que d'afficher son chemin technique.\n` +
          `      let text = resolve(${source}, key);\n` +
          `      if (text === key && ${source} !== de) text = resolve(de, key);\n` +
          `      return interpolate(text, vars);\n` +
          `    }`;
        let out = before.replace(RE, replacement);
        // La version chargée paresseusement importe déjà `de` ; la version
        // statique aussi. Rien à ajouter.
        fs.writeFileSync(IDX + ".bak", before, "utf8");
        fs.writeFileSync(IDX, out, "utf8");
        console.log("\n✅ Repli sur l'allemand posé dans i18n/index.ts.");
      }
    }
  }
}

console.log(`\n✅ ${added} clé(s) ajoutée(s). Sauvegardes en .bak.`);
if (missingInDe.some((m) => !KNOWN[m.key])) {
  console.log("\n⚠️  Certaines clés restent à écrire à la main dans de.ts — voir ❌ plus haut.");
}
console.log("\n👉 bunx tsc --noEmit -p packages\\web");
