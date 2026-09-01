// La boucle de diagnostic : le tuteur repère une lacune, la retient, et y
// revient tout seul la fois suivante.
//
//   node patch-memoire.mjs
//
// À lancer APRÈS `bun --env-file=.env migration-memoire.mjs`.
// Idempotent, .bak avant chaque écriture.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API = path.join(ROOT, "packages", "web", "src", "api");
const WEB = path.join(ROOT, "packages", "web", "src", "web");

const F = {
  schema: path.join(API, "database", "schema.ts"),
  apiIndex: path.join(API, "index.ts"),
  agent: path.join(API, "agent", "index.ts"),
  dashboard: path.join(WEB, "pages", "dashboard.tsx"),
  messages: path.join(WEB, "i18n", "messages"),
  lib: path.join(API, "lib", "memory.ts"),
  libText: path.join(API, "lib", "memory-text.ts"),
  route: path.join(API, "routes", "memory.ts"),
  card: path.join(WEB, "components", "memory-card.tsx"),
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

for (const [label, file] of [
  ["lib/memory.ts", F.lib],
  ["lib/memory-text.ts", F.libText],
  ["routes/memory.ts", F.route],
  ["components/memory-card.tsx", F.card],
]) {
  if (!fs.existsSync(file)) {
    failed.push(`${label} absent — le zip n'a pas été décompressé à la racine.`);
  }
}

/* ══ A. La table ═══════════════════════════════════════════════════════ */

patch("schema.ts — table misconception", F.schema, (s) => {
  if (/export const misconception\b/.test(s)) return null;

  const anchor = `export * from "./auth-schema";`;
  if (!s.includes(anchor)) return undefined;

  let out = s;

  // `index` n'est peut-être pas encore importé selon l'état du fichier.
  const imp = out.match(/^import \{([^}]*)\} from "drizzle-orm\/sqlite-core";$/m);
  if (!imp) return undefined;
  if (!/\bindex\b/.test(imp[1])) {
    out = out.replace(
      imp[0],
      `import {${imp[1].replace(/\s*$/, "")}, index } from "drizzle-orm/sqlite-core";`,
    );
  }

  // Construit ligne à ligne : ce texte contient des accents graves et des
  // accolades qui n'ont rien à faire dans un littéral de gabarit.
  const table = [
    "// ── Was der Tutor sich gemerkt hat ────────────────────────────────────────",
    "// Eine *Denklücke*, kein Rechenfehler: eine falsche Vorstellung, die",
    "// wiederkommt, solange sie nicht ausgeräumt ist. `timesSeen` ist das",
    "// eigentliche Signal — einmal ist Unachtsamkeit, dreimal ist ein Muster.",
    "//",
    '// Gelöste Einträge werden NICHT gelöscht, sondern auf "resolved" gesetzt:',
    "// der Verlauf ist der Beleg dafür, dass jemand vorankommt.",
    "export const misconception = sqliteTable(",
    '  "misconception",',
    "  {",
    '    id: text("id").primaryKey(),',
    '    userId: text("user_id").notNull(),',
    '    semesterId: text("semester_id"),',
    '    topic: text("topic").notNull().default("Allgemein"),',
    '    label: text("label").notNull(),',
    '    detail: text("detail").notNull().default(""),',
    '    status: text("status").notNull().default("open"), // open | resolved',
    '    timesSeen: integer("times_seen").notNull().default(1),',
    '    firstSeen: integer("first_seen", { mode: "timestamp" })',
    "      .notNull()",
    "      .$defaultFn(() => new Date()),",
    '    lastSeen: integer("last_seen", { mode: "timestamp" })',
    "      .notNull()",
    "      .$defaultFn(() => new Date()),",
    "  },",
    '  (t) => [index("misconception_user_status_idx").on(t.userId, t.status)],',
    ");",
    "",
    "export type Misconception = typeof misconception.$inferSelect;",
    "",
    anchor,
  ].join("\n");

  return out.replace(anchor, table);
});

/* ══ B. L'agent : mémoire, outils, consigne ════════════════════════════ */

patch("agent/index.ts — mémoire et outils de diagnostic", F.agent, (s) => {
  if (s.includes("TutorMemory")) return null;

  let out = s;

  /* 1. Le type. L'agent ne touche PAS à la base : il reçoit des fonctions.
   *    C'est ce qui le garde sans dépendance au schéma, et testable en lui
   *    fournissant deux fonctions factices. */
  // `ageLabel` rend la fraîcheur lisible dans le prompt : « hier » et « il y a
  // trois mois » n'appellent pas du tout la même réaction du tuteur.
  const diagImp = out.match(/^import \{[^}]*\} from "\.\.\/lib\/diagrams";$/m);
  if (!diagImp) return undefined;
  out = out.replace(
    diagImp[0],
    `${diagImp[0]}\nimport { ageLabel } from "../lib/memory-text";`,
  );

  const sourceIface = "export interface TutorSource {";
  if (!out.includes(sourceIface)) return undefined;

  const typeAndHelper = [
    "/**",
    " * Ce que le tuteur sait de l'étudiant, et comment il l'enrichit.",
    " *",
    " * Passé sous forme de fonctions plutôt que d'accès direct à la base :",
    " * l'agent reste un module sans dépendance au schéma.",
    " */",
    "export interface TutorMemory {",
    "  /** Lacunes ouvertes, les plus tenaces d'abord. */",
    "  open: { label: string; topic: string; timesSeen: number; lastSeen: Date }[];",
    "  /** Enregistre ou incrémente. `repeat` dit si c'est une récidive. */",
    "  note: (input: { topic: string; label: string; detail: string }) => Promise<{",
    "    repeat: boolean;",
    "    timesSeen: number;",
    "  }>;",
    "  /** Marque une lacune comme comblée. */",
    "  resolve: (label: string) => Promise<boolean>;",
    "}",
    "",
    "/**",
    " * Le bloc « ce que tu sais de cette personne », ou une chaîne vide.",
    " *",
    " * Construit à part plutôt qu'inséré comme expression au milieu du prompt :",
    " * un gabarit imbriqué dans un autre devient illisible, et c'est exactement",
    " * le genre d'endroit où une accolade oubliée casse tout le prompt.",
    " */",
    "function buildMemoryBlock(memory?: TutorMemory): string {",
    "  if (!memory || memory.open.length === 0) return \"\";",
    "",
    "  const lines = memory.open",
    "    .map(",
    "      (g) =>",
    "        \"  - \" +",
    "        g.label +",
    "        \" (\" + g.topic + \", \" + g.timesSeen + \"\\u00d7, zuletzt \" + ageLabel(g.lastSeen) + \")\",",
    "    )",
    "    .join(\"\\n\");",
    "",
    "  return [",
    "    \"\\u2550\".repeat(59),",
    "    \"NIVEAU 2b \\u2014 WAS DU \\u00dcBER DIESE PERSON WEISST\",",
    "    \"\\u2550\".repeat(59),",
    "    \"Offene Denkl\\u00fccken aus fr\\u00fcheren Gespr\\u00e4chen:\",",
    "    \"\",",
    "    lines,",
    "    \"\",",
    "    \"SO BENUTZT DU DIESES WISSEN:\",",
    "    \"- Ber\\u00fchrt die aktuelle Frage eine dieser L\\u00fccken, sprich sie AKTIV an,\",",
    "    \"  bevor du weitermachst. Genau daf\\u00fcr ist die Liste da.\",",
    "    '- Sag es freundlich und ohne Vorwurf: \"Das hatten wir schon einmal \\u2014',",
    "    '  schau, worauf es dabei ankommt \\u2026\"',",
    "    \"- Erkl\\u00e4rt der/die Studierende den Zusammenhang jetzt eigenst\\u00e4ndig\",",
    "    \"  und richtig, benutze luecke_geschlossen.\",",
    "    \"- Erw\\u00e4hne NIEMALS die Liste als solche. Du erinnerst dich \\u2014 du\",",
    "    \"  liest nicht aus einer Akte vor.\",",
    "    \"- Im Pr\\u00fcfungsmodus: nur beobachten und aufzeichnen, nichts sagen.\",",
    "    \"\",",
    "  ].join(\"\\n\");",
    "}",
    "",
    sourceIface,
  ].join("\n");

  out = out.replace(sourceIface, typeAndHelper);

  /* 2. L'option. */
  const codeLangOpt = "  codeLang?: string;\n}) {";
  if (!out.includes(codeLangOpt)) return undefined;
  out = out.replace(
    codeLangOpt,
    [
      "  codeLang?: string;",
      "  /** Mémoire du tuteur. Absente = comportement d'avant, sans diagnostic. */",
      "  memory?: TutorMemory;",
      "}) {",
    ].join("\n"),
  );

  /* 3. La variable, calculée avec les autres en tête de fonction. */
  const ruleLine = out.match(/^[ \t]*const rule = langRule\(opts\.locale\);$/m);
  if (!ruleLine) {
    throw new Error("applique d'abord patch-fix.mjs (la correction de langue)");
  }
  out = out.replace(
    ruleLine[0],
    `${ruleLine[0]}\n  const memoryBlock = buildMemoryBlock(opts.memory);`,
  );

  /* 4. L'insertion dans le prompt, juste avant la règle de langue : ce que le
   *    tuteur sait doit teinter TOUTE la réponse, pas seulement sa fin. */
  const niveau3 = out.match(/^([ \t]*)═{10,}\n[ \t]*NIVEAU 3 — SPRACHEN\n/m);
  if (!niveau3) return undefined;
  out = out.replace(niveau3[0], `${niveau3[1]}\${memoryBlock}\n${niveau3[0]}`);

  /* 5. Les outils, ajoutés seulement si la mémoire est fournie. */
  const rechnen = out.match(/^([ \t]*)rechnen: tool\(\{/m);
  if (!rechnen) return undefined;
  const ti = rechnen[1];

  const tools = [
    "// ── Diagnostic ────────────────────────────────────────────────────",
    "// La description est stricte à dessein : un profil rempli de fautes",
    "// d'inattention ne sert à rien et devient vite pénible à lire.",
    "...(opts.memory",
    "  ? {",
    "      merke_luecke: tool({",
    "        description:",
    '          "H\\u00e4lt eine DENKL\\u00dcCKE fest, die wiederkommen wird. NUR benutzen " +',
    '          "bei einer echten begrifflichen Fehlvorstellung \\u2014 etwa Spannung " +',
    '          "und Dehnung verwechseln, ein Vorzeichen systematisch falsch " +',
    '          "setzen, eine Formel auf einen Fall anwenden, f\\u00fcr den sie nicht " +',
    '          "gilt. NICHT benutzen bei Rechenfehlern, Tippfehlern, " +',
    '          "Fl\\u00fcchtigkeit oder einer blo\\u00dfen Wissensl\\u00fccke. Im Zweifel: " +',
    '          "nicht benutzen. Formuliere kurz und in der dritten Person, so " +',
    '          "dass es in vier Wochen noch verst\\u00e4ndlich ist.",',
    "        inputSchema: z.object({",
    '          thema: z.string().describe("Fach oder Kapitel"),',
    "          kurzform: z",
    "            .string()",
    '            .describe("Ein Satz, z. B. Verwechselt Spannung und Dehnung"),',
    "          detail: z",
    "            .string()",
    "            .optional()",
    '            .describe("Woran es sich gezeigt hat, in ein bis zwei S\\u00e4tzen"),',
    "        }),",
    "        execute: async ({ thema, kurzform, detail }) =>",
    "          opts.memory!.note({",
    "            topic: thema,",
    "            label: kurzform,",
    '            detail: detail ?? "",',
    "          }),",
    "      }),",
    "",
    "      luecke_geschlossen: tool({",
    "        description:",
    '          "Markiert eine fr\\u00fcher festgehaltene Denkl\\u00fccke als ausger\\u00e4umt. " +',
    '          "Benutzen, wenn der/die Studierende den Zusammenhang jetzt " +',
    '          "eigenst\\u00e4ndig und richtig erkl\\u00e4rt \\u2014 nicht schon dann, wenn " +',
    '          "er oder sie deiner Erkl\\u00e4rung nur zustimmt.",',
    "        inputSchema: z.object({",
    "          kurzform: z",
    "            .string()",
    '            .describe("Die Kurzform der L\\u00fccke, wie sie in der Liste steht"),',
    "        }),",
    "        execute: async ({ kurzform }) => ({",
    "          geschlossen: await opts.memory!.resolve(kurzform),",
    "        }),",
    "      }),",
    "    }",
    "  : {}),",
    "",
    rechnen[0].trimStart(),
  ]
    .map((line) => (line ? ti + line : ""))
    .join("\n");

  return out.replace(rechnen[0], tools);
});

/* ══ C. Le routeur et la route de chat ═════════════════════════════════ */

patch("api/index.ts — mémoire branchée sur le chat", F.apiIndex, (s) => {
  if (s.includes("openGaps")) return null;

  let out = s;

  const chatsImp = `import { chats } from "./routes/chats";`;
  if (!out.includes(chatsImp)) return undefined;
  out = out.replace(
    chatsImp,
    [
      chatsImp,
      `import { memory } from "./routes/memory";`,
      `import { openGaps, noteGap, resolveGap } from "./lib/memory";`,
    ].join("\n"),
  );

  const routerEntry = /(export const router = \{[\s\S]*?)\n(\s*)chats,\n/;
  if (!routerEntry.test(out)) return undefined;
  out = out.replace(routerEntry, `$1\n$2chats,\n$2memory,\n`);

  const build = "  const agent = buildTutorAgent({";
  if (!out.includes(build)) return undefined;
  out = out.replace(
    build,
    [
      "  // Ce que le tuteur a retenu de cette personne. Une requête, plafonnée à",
      "  // huit lignes : au-delà, le prompt s'allonge sans que la réponse gagne.",
      "  const uid = session.user.id;",
      "  const gaps = await openGaps(uid);",
      "",
      build,
    ].join("\n"),
  );

  const optsTail = `    codeLang: codeLang === "matlab" ? "matlab" : "python",\n  });`;
  if (!out.includes(optsTail)) return undefined;
  out = out.replace(
    optsTail,
    [
      `    codeLang: codeLang === "matlab" ? "matlab" : "python",`,
      "    memory: {",
      "      open: gaps,",
      "      note: (input) => noteGap(uid, { ...input, semesterId: semesterId ?? null }),",
      "      resolve: (label) => resolveGap(uid, label),",
      "    },",
      "  });",
    ].join("\n"),
  );

  return out;
});

/* ══ D. La carte sur le tableau de bord ════════════════════════════════ */

patch("dashboard.tsx — carte « Woran du arbeitest »", F.dashboard, (s) => {
  if (s.includes("MemoryCard")) return null;

  let out = s;

  const cardImp = out.match(/^import \{ Card[^}]*\} from "@\/components\/ui\/card";$/m);
  const anyImp = cardImp ?? out.match(/^import .*$/m);
  if (!anyImp) return undefined;
  out = out.replace(
    anyImp[0],
    `${anyImp[0]}\nimport { MemoryCard } from "@/components/memory-card";`,
  );

  // Après les compteurs, avant la grille principale : c'est la première chose
  // qu'on lit après « où j'en suis », et c'est ce que la carte raconte.
  const grid = out.match(/^([ \t]*)<div className="grid gap-6 lg:grid-cols-3">$/m);
  if (!grid) return undefined;
  const ind = grid[1];

  return out.replace(
    grid[0],
    [
      `${ind}<Reveal className="mb-6">`,
      `${ind}  <MemoryCard />`,
      `${ind}</Reveal>`,
      "",
      grid[0],
    ].join("\n"),
  );
});

/* ══ E. Libellés ═══════════════════════════════════════════════════════ */

const TEXTS = {
  de: {
    title: "Woran du gerade arbeitest",
    subtitle:
      "Was TRED sich aus euren Gesprächen gemerkt hat. Du entscheidest, was hier steht.",
    times: "{n}×",
    today: "heute",
    yesterday: "gestern",
    daysAgo: "vor {n} Tagen",
    weeksAgo: "vor {n} Wochen",
    understood: "Verstanden",
    wrong: "Stimmt nicht",
    more: "+{n} weitere",
  },
  fr: {
    title: "Ce sur quoi tu travailles",
    subtitle:
      "Ce que TRED a retenu de vos échanges. C'est toi qui décides de ce qui figure ici.",
    times: "{n}×",
    today: "aujourd'hui",
    yesterday: "hier",
    daysAgo: "il y a {n} jours",
    weeksAgo: "il y a {n} semaines",
    understood: "Compris",
    wrong: "C'est faux",
    more: "+{n} autres",
  },
  en: {
    title: "What you're working on",
    subtitle: "What TRED remembers from your conversations. You decide what stays here.",
    times: "{n}×",
    today: "today",
    yesterday: "yesterday",
    daysAgo: "{n} days ago",
    weeksAgo: "{n} weeks ago",
    understood: "Got it",
    wrong: "Not true",
    more: "+{n} more",
  },
};

function block(locale) {
  const texts = TEXTS[locale] ?? TEXTS.en;
  const lines = Object.entries(texts)
    .map(([k, v]) => `    ${k}: ${JSON.stringify(v)},`)
    .join("\n");
  return `  memory: {\n${lines}\n  },`;
}

if (!fs.existsSync(F.messages)) {
  failed.push(`libellés — dossier absent : ${path.relative(ROOT, F.messages)}`);
} else {
  for (const file of fs.readdirSync(F.messages).filter((f) => f.endsWith(".ts"))) {
    const locale = path.basename(file, ".ts");
    patch(`${file} — libellés mémoire`, path.join(F.messages, file), (s) => {
      if (/^\s*memory:\s*\{/m.test(s)) return null;
      const re = /^(export const \w+(?:\s*:\s*[\w.<>[\]]+)?\s*=\s*\{)$/m;
      if (!re.test(s)) return undefined;
      return s.replace(re, `$1\n${block(locale)}`);
    });
  }
}

/* ══ Bilan ═════════════════════════════════════════════════════════════ */

console.log(`\n${ok} appliqué(s) · ${skipped} déjà fait(s) · ${failed.length} échec(s)`);

if (failed.length) {
  console.log("\n⚠️  À faire à la main :");
  for (const f of failed) console.log("   • " + f);
  console.log("\n   Envoie-moi le fichier concerné, je réajuste.");
}

console.log(`
👉 Ensuite :

   bun run verify
   git add -A && git commit -m "boucle de diagnostic" && git push
`);
