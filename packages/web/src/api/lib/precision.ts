/**
 * Rigueur en sciences — ce que le serveur impose au tuteur en maths, physique
 * et mécanique, et ce qu'il vérifie après coup.
 *
 * Brief fondateur du 17 nov. 2026 : sur un test réel, le tuteur a confondu
 * r(t) et r(φ) en « devinant » au lieu de lire le document. Quatre leviers :
 *
 *   1. `samplingTemperature` — température 0 sur les questions scientifiques.
 *      Limite de l'API Anthropic : avec le raisonnement étendu (« adaptive »,
 *      lib/chat-routing.ts), aucune autre température n'est acceptée ; l'AI
 *      SDK la retirerait de lui-même. On ne l'envoie donc que sans
 *      raisonnement. Les calculs, formules et photos gardent le raisonnement :
 *      c'est lui qui porte la vérification cachée (prompt, NIVEAU 1).
 *   2. Le droit à l'incertitude et la description d'un schéma avant calcul :
 *      des règles du prompt (agent/index.ts, NIVEAU 1 et « BILDER »).
 *   3. `solverDutyNote` — pour CETTE question, une consigne système nomme le
 *      solveur à appeler. `detectSolverSkip` lit la réponse produite et la
 *      signale si un résultat chiffré est sorti sans aucun solveur.
 *   4. La vérification cachée avant la réponse : prompt, NIVEAU 1.
 *
 * Le garde ne corrige rien : le texte est déjà à l'écran (même logique que
 * lib/denial-guard.ts). Il fait remonter la panne dans « Gemeldete Antworten ».
 *
 * Module pur, testé dans tests/precision.test.ts.
 */
import { complexityReason } from "./chat-routing";
import { METHOD_DOMAINS, type Domain } from "./solvers/domain";

/** Les outils dont la sortie est un calcul vérifié (agent/index.ts). */
export const SOLVER_TOOLS: ReadonlySet<string> = new Set([
  "rechnen",
  "mathe_berechnen",
  "statik_berechnen",
  "balkenstatik",
  "physik_berechnen",
  "schaltung_berechnen",
  "elektro_berechnen",
  "thermo_berechnen",
  "werkstoff_berechnen",
  "chemie_berechnen",
  "wirtschaft_berechnen",
  "schule_berechnen",
  "solve_cyber",
  "solve_ai",
  "solve_open_math",
]);

/** Matières où un chiffre faux est une faute : tout sauf les méthodes (droit, langues…). */
export function isScienceDomain(domain: Domain | undefined): boolean {
  if (!domain || domain === "unbekannt") return false;
  return !METHOD_DOMAINS.has(domain);
}

// Bornes de mot Unicode : « \b » de JavaScript ignore ä, é, φ…
const word = (body: string) => new RegExp(`(?<!\\p{L})(?:${body})(?!\\p{L})`, "iu");

type Keyword = { label: string; re: RegExp; tools: string[] };

const MATHE = ["mathe_berechnen"];
const STATIK = ["statik_berechnen", "balkenstatik"];
const PHYSIK = ["physik_berechnen"];

/**
 * Les mots qui annoncent un calcul (de, fr, en, es). Volontairement des
 * NOMS de grandeurs et d'opérations : les verbes (« berechne », « calcule »)
 * et les formules sont déjà reconnus par lib/chat-routing.ts.
 */
const KEYWORDS: Keyword[] = [
  { label: "Ableitung", re: word("ableitung(?:en)?|ableiten|abgeleitet|differenzier\\p{L}*|dérivée?s?|dériver|derivatives?|differentiate|derivadas?|derivar"), tools: MATHE },
  { label: "Integral", re: word("integral(?:e|s|en)?|intégrales?|intégrer|integrieren|integrate|stammfunktion(?:en)?|primitives?|antiderivatives?"), tools: MATHE },
  { label: "Matrix", re: word("matrix|matrizen|matrices?|matriz|matrices"), tools: MATHE },
  { label: "Determinante", re: word("determinanten?|déterminants?|determinants?|eigenwert\\p{L}*|valeurs? propres?|eigenvalues?|autovalor(?:es)?"), tools: MATHE },
  { label: "Gleichung", re: word("\\p{L}*gleichung(?:en)?|dgl|équations?|equations?|ecuaci(?:ón|ones)"), tools: MATHE },
  { label: "Kraft", re: word("\\p{L}*kr[aä]ft(?:e|en)?|forces?|fuerzas?"), tools: STATIK },
  {
    label: "Moment",
    // « im Moment », « en ce moment », « at the moment » : des expressions, pas des grandeurs.
    re: new RegExp(
      "(?<!\\p{L})(?:\\p{L}+moment(?:e|s|en)?|torques?|momentos?|(?<!\\b(?:im|in diesem|ce|le|au|pour le|at the|for the|in the|al|este|el)\\s)moments?(?:e|en)?(?!\\s+mal))(?!\\p{L})",
      "iu",
    ),
    tools: STATIK,
  },
  { label: "Schwerpunkt", re: word("schwerpunkt\\p{L}*|centre de gravité|centroïde|centroids?|center of (?:mass|gravity)|centro de (?:masa|gravedad)"), tools: STATIK },
  { label: "Spannung", re: word("\\p{L}*spannung(?:en)?|contraintes?"), tools: [] },
  { label: "Geschwindigkeit", re: word("\\p{L}*geschwindigkeit(?:en)?|vitesses?|velocit(?:y|ies)|velocidad(?:es)?"), tools: PHYSIK },
  { label: "Beschleunigung", re: word("\\p{L}*beschleunigung(?:en)?|accélérations?|accelerations?|aceleraci(?:ón|ones)"), tools: PHYSIK },
  { label: "Energie", re: word("\\p{L}*energie[n]?|énergies?|energ(?:y|ies)|energías?"), tools: PHYSIK },
  // Grenzwerte : aucun solveur ne les couvre (solveMath, LIMITS) — voir `isLimitQuestion`.
  { label: "Grenzwert", re: /grenzwert\p{L}*|(?<!\p{L})(?:limes|lim)(?!\p{L})|(?<!\p{L})[a-z]\s*(?:→|->|\\to)\s*[-+−]?\s*(?:\d|∞|\\infty|unendlich|inf)|limit (?:of|as)|limite (?:de|quand|en|pour)|límite/iu, tools: [] },
];

/** La question porte-t-elle sur une limite (lim, x → a) ? Aucun solveur ne la calcule. */
export function isLimitQuestion(text: string): boolean {
  return calcKeywords(text).includes("Grenzwert");
}

/** L'outil de sortie : « aucun solveur ne couvre cette tâche » (agent/index.ts). */
export const NO_SOLVER_TOOL = "kein_loeser_vorhanden";

/** Les mots-clés de calcul présents dans la question (étiquettes allemandes). */
export function calcKeywords(text: string): string[] {
  const t = text ?? "";
  return KEYWORDS.filter((k) => k.re.test(t)).map((k) => k.label);
}

/** Les raisons de lib/chat-routing.ts qui signifient « il y a un calcul ». */
const CALC_REASONS = new Set(["formule", "grandeur avec unité", "plusieurs nombres", "verbe de calcul", "adresse IP"]);

/** La question demande-t-elle (peut-être) un résultat calculé ? */
export function needsSolver(text: string): boolean {
  if (calcKeywords(text).length > 0) return true;
  const why = complexityReason({ text: text ?? "" });
  return why !== null && CALC_REASONS.has(why);
}

/** Signaux forts de calcul : une formule, une grandeur avec unité, un verbe de calcul. */
const STRONG_REASONS = new Set(["formule", "grandeur avec unité", "verbe de calcul"]);

/**
 * Le PREMIER appel du modèle doit-il être un appel d'outil imposé
 * (`toolChoice: "required"`, lib/solver-gate.ts) ?
 *
 * Oui pour une question technique qui porte un signal fort (formule, grandeur
 * avec unité, verbe de calcul), un mot de calcul accompagné d'un nombre, ou
 * une limite. Non dans les matières de méthode (droit, langues…), et non
 * avec une image ou un PDF joint : lire un schéma demande le raisonnement
 * étendu, que l'API refuse avec un outil imposé — là, le verrou du flux
 * (texte retenu, essai coupé) reste la protection.
 */
export function mustCallToolFirst(input: { text: string; domain?: Domain; hasAttachments?: boolean }): boolean {
  if (input.hasAttachments) return false;
  if (input.domain && METHOD_DOMAINS.has(input.domain)) return false;
  const text = input.text ?? "";
  if (isLimitQuestion(text)) return true;
  const why = complexityReason({ text });
  if (why !== null && STRONG_REASONS.has(why)) return true;
  return calcKeywords(text).length > 0 && /\d/.test(text);
}

/**
 * Température de l'appel. `undefined` = valeur par défaut du modèle.
 * 0 en sciences, mais seulement sans raisonnement étendu (voir l'en-tête).
 */
export function samplingTemperature(input: { domain?: Domain; thinking: "adaptive" | "off"; text: string }): number | undefined {
  if (input.thinking === "adaptive") return undefined;
  return isScienceDomain(input.domain) || needsSolver(input.text) ? 0 : undefined;
}

/** Le solveur de chaque matière (agent/index.ts, SOLVER-PFLICHT). */
const DOMAIN_TOOLS: Partial<Record<Domain, string[]>> = {
  mathematik: MATHE,
  mechanik: STATIK,
  physik: PHYSIK,
  elektrotechnik: ["schaltung_berechnen", "elektro_berechnen"],
  thermodynamik: ["thermo_berechnen"],
  werkstoffkunde: ["werkstoff_berechnen"],
  chemie: ["chemie_berechnen"],
  ki: ["solve_ai"],
  informatik: ["solve_cyber"],
  wirtschaft: ["wirtschaft_berechnen"],
};

/**
 * Consigne système pour CETTE question : quel solveur appeler. `null` si la
 * question ne parle d'aucun calcul. Placée après le bloc mis en cache : elle
 * change à chaque question sans faire manquer le cache.
 */
export function solverDutyNote(input: { text: string; domain?: Domain }): string | null {
  if (!needsSolver(input.text)) return null;
  const hits = calcKeywords(input.text);
  const tools = [
    ...KEYWORDS.filter((k) => hits.includes(k.label)).flatMap((k) => k.tools),
    ...(input.domain ? (DOMAIN_TOOLS[input.domain] ?? []) : []),
    "rechnen",
  ];
  const unique = [...new Set(tools)].map((t) => `"${t}"`).join(", ");
  const why = hits.length > 0 ? ` (erkannt: ${hits.join(", ")})` : "";
  return [
    `RECHENPFLICHT FÜR DIESE FRAGE${why}:`,
    `Jede Zahl, jedes Ergebnis einer Ableitung, eines Integrals, einer Matrix, jede Kraft und jedes Moment in deiner Antwort kommt aus einem Werkzeugaufruf — passend hier: ${unique}.`,
    "Du rechnest NICHT im Text, auch keine Zwischenschritte und keine \"einfachen\" Zahlen. Das Werkzeug ist die einzige Quelle für Zahlen; du übernimmst seine Ergebnisse wörtlich.",
    `Ist die Frage rein begrifflich (keine Zahl, kein Ergebnis verlangt), fehlt eine Angabe oder bildet kein Werkzeug die Aufgabe ab: ruf "${NO_SOLVER_TOOL}" auf und folge seiner Anweisung — sag es offen, erkläre die Methode, nenne KEIN selbst gerechnetes Ergebnis.`,
    ...(isLimitQuestion(input.text)
      ? [
          `GRENZWERT: Kein Löser berechnet Grenzwerte. Ruf "${NO_SOLVER_TOOL}" (grund "nicht_abgedeckt") auf, sag der Person offen sinngemäß „Diesen Grenzwert kann ich mit dem Löser nicht berechnen — hier ist die theoretische Methode“, und erkläre die Methode (Einsetzen, Kürzen/Faktorisieren, L'Hospital) OHNE Zahlenergebnis. Rechne den Grenzwert NICHT von Hand aus, auch nicht Schritt für Schritt mit "rechnen".`,
        ]
      : []),
  ].join("\n");
}

/** Une grandeur écrite comme résultat : « = 12 », « ≈ −3,5 », « 12 m/s ». */
const RESULT = /[=≈]\s*[-−]?\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:k|M|m|µ|n|G|c)?(?:N|Nm|m|s|V|A|W|J|Pa|K|Hz|Ω|m\/s|m\/s²|rad\/s|kg)(?![\p{L}\d])/gu;

const numbersIn = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", ".")));

/**
 * Le texte sans ses blocs de code (```svg, ```chart, ```python…), sans code
 * en ligne et sans balises : ce qui reste est ce que le tuteur AFFIRME.
 */
export function proseOnly(text: string): string {
  return (text ?? "")
    .replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, "\n")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/<[^<>\n]{0,2000}>/g, " ");
}

export interface SolverSkip {
  label: string;
  /** Le passage fautif, court : pour l'écran « Gemeldete Antworten ». */
  excerpt: string;
}

/**
 * Le tuteur a-t-il sorti un résultat chiffré sans appeler aucun solveur ?
 *
 * Étroit à dessein : un nombre déjà présent dans la question (une donnée
 * recopiée) ne compte pas, et une réponse qui se termine par une question
 * (« Stimmen diese Angaben? », « Zeig mir die Stelle ») non plus.
 */
export function detectSolverSkip(input: { question: string; toolNames: string[]; answer: string }): SolverSkip | null {
  if (!needsSolver(input.question)) return null;
  if (input.toolNames.some((t) => SOLVER_TOOLS.has(t))) return null;
  // Le dessin et le code ne sont pas des résultats : « M 248,195 L 300,200 »
  // dans un <path> n'est pas « 195 litres ».
  const answer = proseOnly(input.answer ?? "");
  const lastLine = answer.trim().split("\n").filter((l) => l.trim()).pop() ?? "";
  if (/\?\s*\**\s*$/.test(lastLine)) return null;
  const given = numbersIn(input.question);
  for (const m of answer.matchAll(RESULT)) {
    const n = (m[1] ?? m[2] ?? "").replace(",", ".");
    if (!n || given.has(n)) continue;
    const at = m.index ?? 0;
    const start = Math.max(0, at - 120);
    return {
      label: "résultat chiffré sans solveur",
      excerpt: answer.slice(start, Math.min(answer.length, start + 240)),
    };
  }
  return null;
}
