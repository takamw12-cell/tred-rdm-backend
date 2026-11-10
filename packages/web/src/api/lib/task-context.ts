/**
 * Teilaufgaben et changements de contexte dans un énoncé d'exercice.
 *
 * Le bug d'origine (10 nov. 2026, « Uebungsaufgaben Elektrotechnik », Aufgabe 5) :
 * a)–d) portent sur un circuit à deux lampes ; e) commence par « Gegeben ist
 * folgende Schaltung » (R₁, R₂ = 20 Ω, I₁ = 0,1 A) et f) par « Gegeben ist die
 * folgende Schaltung » (R₁ = 100 Ω, R₂ = 400 Ω, I₂ = 25 mA). Le tuteur a résolu
 * e) et f) avec le circuit de a)–d).
 *
 * Une règle de prompt seule ne suffit pas : le modèle lit un long extrait et
 * « oublie » la phrase. Ce module découpe le texte en contextes et insère,
 * avant chaque Teilaufgabe qui ouvre un NOUVEAU problème, une ligne
 * ⟪NEUER KONTEXT …⟫ avec les valeurs propres à ce contexte. Le prompt (NIVEAU 4)
 * la déclare verbindlich.
 *
 * Module pur, testé dans tests/task-context.test.ts.
 */

/** Phrases qui ouvrent un nouveau problème (DE, EN, FR). */
const TRIGGER =
  /\b(?:gegeben\s+(?:ist|sei|sind|seien)\s+(?:nun\s+|jetzt\s+)?(?:die\s+|eine\s+|der\s+|das\s+)?(?:folgende|nachstehende|neue|andere|unten)|gegeben\s+sei|nun\s+gilt|jetzt\s+gilt|im\s+folgenden|für\s+die\s+folgende|betrachten\s+sie\s+nun|es\s+wird\s+nun|(?:die|eine)\s+(?:neue|andere|geänderte)\s+schaltung|(?:is\s+)?given\s+(?:is\s+)?the\s+following|now\s+consider|consider\s+(?:now\s+)?the\s+following|on\s+(?:donne|considère)\s+(?:maintenant\s+)?(?:le|la|les)\s+\w+\s+suivante?s?|soit\s+(?:le|la)\s+\w+\s+suivante?)/i;

/** « a) Welcher … », « (b) … », « c. … » en début de ligne. */
const SUB_RE = /^\s*(?:\(([a-h])\)|([a-h])[).])\s+\S/;
/** « Aufgabe 5 », « Aufgabe 5.2 », « Exercise 3 », « Exercice 3 ». */
const TASK_RE = /^\s*(?:Aufgabe|Übung|Uebung|Exercise|Problem|Exercice)\s+(\d+(?:\.\d+)*)\b/i;

/** « R1 = 100Ω », « I₂ = 25 mA », « U0 = 6V ». */
const VALUE_RE =
  /(?<![\p{L}\d])([A-Za-zÄÖÜäöü][A-Za-z₀-₉0-9_]{0,4})\s*=\s*(-?\d+(?:[.,]\d+)?)\s*((?:[kMmµun]?(?:Ω|Ohm|V|A|W|F|H|Hz|s|J|N|Pa))|°C|%)(?![\p{L}])/gu;

/** « [Abbildung … zu Aufgabe 5 e) …] » : à quelle Teilaufgabe la description d'une figure appartient. */
const FIGURE_RE = /\[Abbildung[^\]]*?\bAufgabe\s+(\d+(?:\.\d+)*)\s*([a-h])\)[^\]]*\]/gi;
/** « [Abbildung — zu Aufgabe 5 (Grundschaltung) …] » : la figure d'avant les Teilaufgaben. */
const BASE_FIGURE_RE = /\[Abbildung[^\]]*?\bAufgabe\s+(\d+(?:\.\d+)*)\s*\(Grundschaltung\)[^\]]*\]/gi;
/** Toute description de figure : ses valeurs vont à SA Teilaufgabe, pas à celle qui la précède dans le texte. */
const ANY_FIGURE_RE = /\[Abbildung[^\]]*\]/gi;

export interface TaskContext {
  /** Numéro de l'Aufgabe (« 5 »), null avant le premier en-tête. */
  aufgabe: string | null;
  /** Teilaufgaben de ce contexte, dans l'ordre (« a », « b »…). */
  teile: string[];
  /** true : ouvert par « Gegeben ist folgende Schaltung » & co. */
  neu: boolean;
  /** Valeurs données dans ce contexte (nom → « 100 Ω »), première occurrence. */
  werte: Record<string, string>;
  /** Index (0-based) de la ligne où commence le contexte. */
  line: number;
}

function addValues(into: Record<string, string>, text: string) {
  for (const m of text.matchAll(VALUE_RE)) {
    const name = m[1];
    if (!(name in into)) into[name] = `${m[2]} ${m[3]}`;
  }
}

interface Unit {
  kind: "task" | "sub" | "text";
  key: string | null;
  start: number;
  text: string;
}

/** Découpe en unités : en-tête d'Aufgabe, Teilaufgabe (avec ses lignes de suite), texte libre. */
function units(lines: string[]): Unit[] {
  const out: Unit[] = [];
  lines.forEach((line, i) => {
    const t = TASK_RE.exec(line);
    const s = t ? null : SUB_RE.exec(line);
    if (t) out.push({ kind: "task", key: t[1], start: i, text: line });
    else if (s) out.push({ kind: "sub", key: (s[1] ?? s[2]).toLowerCase(), start: i, text: line });
    else if (out.length) out[out.length - 1].text += `\n${line}`;
    else out.push({ kind: "text", key: null, start: i, text: line });
  });
  return out;
}

/** Les contextes d'un énoncé, dans l'ordre. */
export function aufgabenKontexte(text: string): TaskContext[] {
  const lines = text.split("\n");
  const contexts: TaskContext[] = [];
  let aufgabe: string | null = null;
  let current: TaskContext | null = null;
  const open = (ctx: TaskContext) => {
    contexts.push(ctx);
    current = ctx;
  };

  for (const u of units(lines)) {
    if (u.kind === "task") {
      aufgabe = u.key;
      open({ aufgabe, teile: [], neu: false, werte: {}, line: u.start });
    } else if (u.kind === "sub") {
      // Une Teilaufgabe « a) » sans en-tête : début d'un nouvel exercice.
      const restart = u.key === "a" && current !== null && (current as TaskContext).teile.length > 0;
      const fresh = current !== null && (current as TaskContext).teile.length === 0;
      if ((TRIGGER.test(u.text) && !fresh) || current === null || restart) {
        open({ aufgabe, teile: [], neu: current !== null && !restart, werte: {}, line: u.start });
      }
    } else if (current === null) {
      open({ aufgabe, teile: [], neu: false, werte: {}, line: u.start });
    }
    const ctx = current as TaskContext | null;
    if (!ctx) continue;
    if (u.kind === "sub" && u.key) ctx.teile.push(u.key);
    addValues(ctx.werte, u.text.replace(ANY_FIGURE_RE, " "));
  }

  // Les descriptions de figures (« [Abbildung — zu Aufgabe 5 f): …] ») vont à
  // leur Teilaufgabe, même si la vision les a posées en fin de page.
  for (const m of text.matchAll(FIGURE_RE)) {
    const target = contexts.find((c) => c.aufgabe === m[1] && c.teile.includes(m[2].toLowerCase()));
    if (target) addValues(target.werte, m[0]);
  }
  for (const m of text.matchAll(BASE_FIGURE_RE)) {
    const target = contexts.find((c) => c.aufgabe === m[1]);
    if (target) addValues(target.werte, m[0]);
  }
  return contexts;
}

function letters(teile: string[]): string {
  if (teile.length === 0) return "";
  if (teile.length === 1) return `${teile[0]})`;
  return `${teile[0]})–${teile[teile.length - 1]})`;
}

/**
 * Le texte, avec une ligne ⟪NEUER KONTEXT …⟫ avant chaque Teilaufgabe qui
 * ouvre un nouveau problème. Texte sans Teilaufgaben : inchangé.
 */
export function markTaskContexts(text: string): string {
  if (!text || !TRIGGER.test(text)) return text;
  const contexts = aufgabenKontexte(text);
  const marks = new Map<number, string>();
  contexts.forEach((ctx, i) => {
    if (!ctx.neu || ctx.teile.length === 0) return;
    // Les Teilaufgaben précédentes de la même Aufgabe.
    const before = contexts
      .slice(0, i)
      .filter((c) => c.aufgabe === ctx.aufgabe)
      .flatMap((c) => c.teile);
    const werte = Object.entries(ctx.werte)
      .map(([k, v]) => `${k} = ${v}`)
      .join(", ");
    const head = ctx.aufgabe ? `Aufgabe ${ctx.aufgabe} ${letters(ctx.teile)}` : `Teilaufgabe ${letters(ctx.teile)}`;
    marks.set(
      ctx.line,
      `⟪NEUER KONTEXT ab ${head}: eigene Schaltung bzw. eigene Angaben${werte ? ` (${werte})` : ""}.` +
        (before.length ? ` Werte und Schaltung aus ${letters(before)} gelten hier NICHT.` : "") +
        "⟫",
    );
  });
  if (marks.size === 0) return text;
  return text
    .split("\n")
    .map((line, i) => (marks.has(i) ? `${marks.get(i)}\n${line}` : line))
    .join("\n");
}
