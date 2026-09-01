// Remplit les mentions légales en te posant les questions.
//
//   node remplir-legal.mjs
//
// Aucune connaissance de TypeScript requise : tu réponds, il écrit. Une
// sauvegarde .bak est faite avant, et tu peux relancer autant de fois que tu
// veux — le script relit les valeurs déjà en place et te les propose par
// défaut.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Lecteur de réponses.
 *
 * Dans un vrai terminal, readline fait le travail. Quand l'entrée est
 * redirigée (`type reponses.txt | node remplir-legal.mjs`), readline émet
 * toutes les lignes d'un coup et les questions suivantes n'en voient plus
 * aucune — d'où la lecture complète en amont dans ce cas. C'est aussi ce qui
 * rend ce script vérifiable automatiquement.
 */
async function makeAsker() {
  if (stdin.isTTY) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    return { question: (q) => rl.question(q), close: () => rl.close() };
  }

  const data = await new Promise((resolve) => {
    let buffer = "";
    stdin.setEncoding("utf8");
    stdin.on("data", (chunk) => (buffer += chunk));
    stdin.on("end", () => resolve(buffer));
  });

  const lines = data.split(/\r?\n/);
  let i = 0;
  return {
    async question(q) {
      stdout.write(q);
      const value = lines[i++] ?? "";
      stdout.write(value + "\n");
      return value;
    },
    close() {},
  };
}

const ROOT = process.cwd();
const FILE = path.join(ROOT, "packages", "web", "src", "web", "data", "legal.ts");

if (!fs.existsSync(FILE)) {
  console.log(`\n⚠️  Fichier introuvable : ${path.relative(ROOT, FILE)}`);
  console.log("   Tu n'es pas à la racine du projet, ou le zip légal n'a pas été appliqué.\n");
  process.exit(1);
}

/* ── Les questions ─────────────────────────────────────────────────────────
 *
 * L'ordre suit celui d'un formulaire administratif allemand, pas celui du
 * fichier : on ne saute pas d'une adresse à une date de version puis à un
 * fournisseur de stockage.
 */
const QUESTIONS = [
  {
    key: "name",
    ask: "Ton prénom et nom",
    hint: "tel qu'il figurerait sur un courrier officiel",
    check: (v) => (v.trim().split(/\s+/).length >= 2 ? null : "Prénom ET nom, s'il te plaît."),
  },
  {
    key: "strasse",
    ask: "Rue et numéro",
    hint: "p. ex. Musterstraße 12",
    check: (v) => (/\d/.test(v) ? null : "Il manque le numéro."),
  },
  {
    key: "plz",
    ask: "Code postal",
    hint: "5 chiffres",
    check: (v) => (/^\d{5}$/.test(v.trim()) ? null : "Un code postal allemand a 5 chiffres."),
  },
  {
    key: "ort",
    ask: "Ville",
    hint: "p. ex. Aachen",
  },
  {
    key: "email",
    ask: "Adresse e-mail de contact",
    hint: "celle qui figurera dans l'Impressum",
    check: (v) => (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim()) ? null : "Adresse invalide."),
  },
  {
    key: "telefon",
    ask: "Numéro de téléphone",
    hint: "portable accepté — obligatoire, § 5 DDG",
    check: (v) =>
      v.replace(/\D/g, "").length >= 7
        ? null
        : "Trop court. Un numéro est exigé : l'e-mail seul ne suffit pas.",
  },
  {
    key: "railway",
    ask: "Région d'hébergement Railway",
    hint: "visible sur railway.app → ton service → Settings. P. ex. « EU West (Amsterdam) »",
    fallback: "EU",
  },
  {
    key: "speicher",
    ask: "Nom de ton stockage de fichiers",
    hint: "p. ex. Cloudflare R2, Backblaze B2, Railway Bucket, AWS S3",
    fallback: "Objektspeicher",
  },
  {
    key: "speicherRegion",
    ask: "Région de ce stockage",
    hint: "p. ex. EU (Frankfurt)",
    fallback: "EU",
  },
];

/* ── Ce que chaque réponse remplace ────────────────────────────────────── */

function buildMap(a) {
  const anschrift = `${a.strasse}, ${a.plz} ${a.ort}`;
  const heute = new Date().toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  return [
    ["[Vor- und Nachname]", a.name],
    ["[Straße und Hausnummer]", a.strasse],
    ["[PLZ]", a.plz],
    ["[Ort]", a.ort],
    ["[kontakt@deine-domain.de]", a.email],
    ["[+49 …]", a.telefon],
    ["[Anschrift wie oben]", anschrift],
    ["[Anschrift]", anschrift],
    ["[E-Mail]", a.email],
    ["[Name]", a.name],
    ["[Objektspeicher]", a.speicher],
    ["[Datum]", heute],
  ];
}

/* ── Déroulé ───────────────────────────────────────────────────────────── */

const rl = await makeAsker();

console.log(`
  ────────────────────────────────────────────────────────────────
   Mentions légales — remplissage

   Neuf questions. Entrée pour garder la valeur proposée quand il
   y en a une. Rien n'est écrit avant la confirmation finale.
  ────────────────────────────────────────────────────────────────
`);

const answers = {};

for (const q of QUESTIONS) {
  for (;;) {
    const suffix = q.fallback ? ` [${q.fallback}]` : "";
    console.log(`\n  ${q.hint ? `(${q.hint})` : ""}`);
    const raw = (await rl.question(`  ${q.ask}${suffix} : `)).trim();
    const value = raw || q.fallback || "";

    if (!value) {
      console.log("  ⚠️  Une réponse est nécessaire.");
      continue;
    }
    const problem = q.check ? q.check(value) : null;
    if (problem) {
      console.log(`  ⚠️  ${problem}`);
      continue;
    }
    answers[q.key] = value;
    break;
  }
}

/* ── Récapitulatif avant écriture ──────────────────────────────────────── */

const map = buildMap(answers);

console.log(`
  ────────────────────────────────────────────────────────────────
   Récapitulatif

   Nom          ${answers.name}
   Adresse      ${answers.strasse}, ${answers.plz} ${answers.ort}
   E-mail       ${answers.email}
   Téléphone    ${answers.telefon}
   Hébergement  Railway — ${answers.railway}
   Stockage     ${answers.speicher} — ${answers.speicherRegion}
   Date         ${map.find(([k]) => k === "[Datum]")[1]}
  ────────────────────────────────────────────────────────────────
`);

const go = (await rl.question("  Écrire dans legal.ts ? (o/N) : ")).trim().toLowerCase();
rl.close();

if (go !== "o" && go !== "oui" && go !== "y") {
  console.log("\n  Rien n'a été modifié.\n");
  process.exit(0);
}

/* ── Écriture ──────────────────────────────────────────────────────────── */

const before = fs.readFileSync(FILE, "utf8");
let source = before;
let count = 0;

// Les deux `[Region]` désignent deux choses différentes — l'hébergement puis le
// stockage — et portent le même nom. On les remplace donc dans l'ordre, une par
// une, plutôt que globalement.
const regions = [answers.railway, answers.speicherRegion];
for (const region of regions) {
  const at = source.indexOf("[Region]");
  if (at === -1) break;
  source = source.slice(0, at) + region + source.slice(at + "[Region]".length);
  count++;
}

for (const [placeholder, value] of map) {
  const parts = source.split(placeholder);
  if (parts.length > 1) {
    count += parts.length - 1;
    source = parts.join(value);
  }
}

if (source === before) {
  console.log("\n  Rien à remplacer — le fichier était déjà rempli.\n");
  process.exit(0);
}

fs.writeFileSync(FILE + ".bak", before, "utf8");
fs.writeFileSync(FILE, source, "utf8");

console.log(`
  ✅ ${count} remplacement(s) écrit(s) dans data/legal.ts
     Sauvegarde : data/legal.ts.bak

  Il reste peut-être des emplacements que je n'ai pas su remplir.
  Vérifie :

     bun run legal

  Puis :

     bun run verify
     git add -A && git commit -m "mentions legales" && git push
`);
