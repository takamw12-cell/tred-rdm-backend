/**
 * Reasoning Layer — la chaîne ReAct du professeur, écrite au tableau.
 *
 *   Beobachtung → Gedanke → Aktion → Ergebnis → Reflexion
 *                    ↑                              │
 *                    └──────── Korrektur ◄──────────┘  (si la Reflexion échoue)
 *
 * Décision fondateur (2026-11-09) : le tuteur ne donne plus de réponse
 * « toute faite » ; il montre son cheminement comme un humain — ce qu'il
 * voit, la loi qu'il choisit, le calcul (ou l'outil) qu'il lance, ce qui en
 * sort, et la vérification (unité, ordre de grandeur, cas limite). Si la
 * vérification échoue, il le DIT et recommence.
 *
 * Pas de dépendance externe : Claude raisonne déjà en interne (thinking) ;
 * ce module impose la FORME visible de ce raisonnement et la vérifie.
 * Une seule source pour :
 *   • le prompt (`reactPromptRule`, NIVEAU 2) ;
 *   • le tableau (`reasoningKind` : quelle icône, quel post-it) ;
 *   • le contrôle (`auditTrace` : la chaîne est-elle complète ?).
 *
 * Le SOLVEUR reste la source de vérité : l'« Aktion » d'un calcul est un
 * appel d'outil (balkenstatik, rechnen, schaltung_berechnen…), et
 * l'« Ergebnis » reprend ses chiffres mot pour mot.
 *
 * Module pur, partagé avec le navigateur, testé dans
 * tests/reasoning-engine.test.ts.
 */

export type ReasoningKind = "beobachtung" | "gedanke" | "aktion" | "ergebnis" | "reflexion" | "korrektur";

export interface ReasoningStepSpec {
  kind: ReasoningKind;
  /** Titre écrit au tableau (allemand, la langue du Hörsaal). */
  label: string;
  /** Ce que l'étape doit contenir — repris tel quel dans le prompt. */
  rule: string;
  /** Autres façons dont le modèle peut l'intituler (insensible à la casse). */
  aliases: string[];
}

/** Les cinq étapes, dans l'ordre, puis la correction. */
export const REACT_STEPS: readonly ReasoningStepSpec[] = [
  {
    kind: "beobachtung",
    label: "Beobachtung",
    rule: "Was ich in der Aufgabe sehe: gegebene Größen MIT Einheiten, gesuchte Größe, Lager/Randbedingungen. Nichts dazuerfinden.",
    aliases: ["observation", "gegeben", "gegeben und gesucht", "analyse"],
  },
  {
    kind: "gedanke",
    label: "Gedanke",
    rule: "Welches Gesetz, welches Prinzip, welcher Ansatz — und WARUM genau dieser (z. B. „statisch unbestimmt → Verträglichkeit nötig“). Annahmen offen nennen.",
    aliases: ["thought", "überlegung", "ansatz", "physik", "idee", "pensée"],
  },
  {
    kind: "aktion",
    label: "Aktion",
    rule: "Der Rechenschritt bzw. das Werkzeug, das ich aufrufe (balkenstatik, rechnen, schaltung_berechnen …), mit den Eingaben. Zahlen rechnet der Löser, nie du.",
    aliases: ["action", "rechnung", "berechnung", "werkzeug", "calcul"],
  },
  {
    kind: "ergebnis",
    label: "Ergebnis",
    rule: "Was herauskommt — die Zahlen des Lösers WÖRTLICH, mit Einheit, als $$…$$.",
    aliases: ["result", "resultat", "résultat", "lösung", "endgleichung", "endergebnis"],
  },
  {
    kind: "reflexion",
    label: "Reflexion",
    rule: "Selbstkontrolle: Stimmt die Einheit? Ist die Größenordnung plausibel? Stimmt ein Grenzfall oder eine Probe (z. B. Summe der Auflagerkräfte = Gesamtlast)? Was bedeutet das Ergebnis praktisch?",
    aliases: ["reflection", "selbstkontrolle", "kontrolle", "probe", "plausibilität", "interpretation", "ingenieurmäßige interpretation", "vérification"],
  },
  {
    kind: "korrektur",
    label: "Korrektur",
    rule: "NUR wenn die Reflexion einen echten Fehler zeigt: sag klar, welcher Schritt falsch war und warum — dann beginnt die Kette ab „Gedanke“ neu.",
    aliases: ["correction", "fehler", "neuer versuch", "self-correction", "selbstkorrektur"],
  },
] as const;

const BY_KIND = new Map(REACT_STEPS.map((s) => [s.kind, s]));

export function reasoningSpec(kind: ReasoningKind): ReasoningStepSpec {
  return BY_KIND.get(kind)!;
}

/**
 * Le type d'une étape d'après son titre : « Beobachtung », « Gedanke 2 »,
 * « Aktion (Action) », « 3. Ergebnis », « Reflexion — Plausibilität »…
 * null = ce n'est pas une étape ReAct (feuille ordinaire).
 */
export function reasoningKind(label: string): ReasoningKind | null {
  const head = label
    .toLowerCase()
    .replace(/^\s*\d+[.)]\s*/, "") // « 3. Ergebnis »
    .replace(/\*\*/g, "")
    .split(/\s*[(—–:]\s*|\s+-\s+/)[0] // « Aktion (Action) », « Reflexion — Probe »
    .replace(/\s+\d+$/, "") // « Gedanke 2 »
    .trim();
  for (const s of REACT_STEPS) {
    if (head === s.label.toLowerCase() || s.aliases.includes(head)) return s.kind;
  }
  return null;
}

export interface TraceAudit {
  /** Les cinq étapes sont là, dans un ordre qui tient (Beobachtung en tête). */
  complete: boolean;
  missing: ReasoningKind[];
  /** Nombre de Korrektur : chacune doit être suivie d'un nouveau cycle. */
  corrections: number;
  /** Une Korrektur sans nouvel Ergebnis + Reflexion derrière = chaîne cassée. */
  correctionResolved: boolean;
  /** La chaîne se termine par une vérification (Reflexion), pas par un chiffre nu. */
  endsWithReflexion: boolean;
}

/** Contrôle d'une chaîne de raisonnement à partir des titres de ses étapes. */
export function auditTrace(labels: string[]): TraceAudit {
  const kinds = labels.map(reasoningKind).filter((k): k is ReasoningKind => k !== null);
  const core: ReasoningKind[] = ["beobachtung", "gedanke", "aktion", "ergebnis", "reflexion"];
  const missing = core.filter((k) => !kinds.includes(k));
  const lastCorrection = kinds.lastIndexOf("korrektur");
  const after = lastCorrection >= 0 ? kinds.slice(lastCorrection + 1) : [];
  return {
    complete: missing.length === 0 && kinds[0] === "beobachtung",
    missing,
    corrections: kinds.filter((k) => k === "korrektur").length,
    correctionResolved: lastCorrection < 0 || (after.includes("ergebnis") && after.includes("reflexion")),
    endsWithReflexion: kinds[kinds.length - 1] === "reflexion",
  };
}

/** La règle du prompt (NIVEAU 2), générée depuis REACT_STEPS : une seule source. */
export function reactPromptRule(): string {
  const core = REACT_STEPS.filter((s) => s.kind !== "korrektur");
  const korr = reasoningSpec("korrektur");
  return [
    "DIE DENKSPUR (ReAct) — DU ZEIGST, WIE DU DENKST, BEVOR DU LÖST:",
    "Bevor du ein Ergebnis oder einen Lösungsschritt nennst, zeigst du deinen",
    "Weg wie ein Mensch an der Tafel — als [[REASONING]]-Block, jeder Schritt",
    "ein eigenes @@STEP, GENAU mit diesen Titeln:",
    ...core.map((s, i) => `  ${i + 1}. @@STEP: ${s.label} — ${s.rule}`),
    `  ↺  @@STEP: ${korr.label} — ${korr.rule}`,
    "- REIHENFOLGE: Die Kette steht VOR jedem Ergebnis. Keine Zahl, keine",
    "  Ergebnistabelle, keine Zusammenfassung vor \"Beobachtung\" — auch nicht",
    "  in einem [[TAFEL]]-Block davor. Erst denken, dann das Ergebnis.",
    "- Mehrere Teilfragen (z. B. erst Auflagerkräfte, dann maximales",
    "  Feldmoment) = mehrere Zyklen in DERSELBEN Kette: \"@@STEP: Gedanke 2\",",
    "  \"Aktion 2\", \"Ergebnis 2\", \"Reflexion 2\". Nie eine eigene Rechnung",
    "  außerhalb der Kette. Eine Beobachtung reicht am Anfang.",
    "- Nach der letzten Reflexion: höchstens eine kurze Zusammenfassung und",
    "  deine Kontrollfrage.",
    "- Die Kette endet IMMER mit einer Reflexion, nie mit einer nackten Zahl.",
    "- Zweifel sind erlaubt und erwünscht, aber ECHT: sag, wo du unsicher bist",
    "  und wie du es prüfst (\"Ich bin nicht sicher, ob das Lager B Momente",
    "  aufnimmt — die Aufgabe sagt Loslager, also nein.\"). ERFINDE NIEMALS einen",
    "  Fehler, nur um zu zögern; eine Korrektur gibt es nur bei einem echten.",
    "- Die Goldene Regel bleibt: Bei einer Aufgabe ohne eigenen Versuch zeigst du",
    "  nur Beobachtung und Gedanke und fragst nach dem nächsten Schritt. Die",
    "  ganze Kette bis zum Ergebnis erst, wenn die Lösung dran ist.",
    "- Reine Begriffsfragen (\"Was ist ein Biegemoment?\") brauchen keine Kette.",
  ].join("\n");
}
