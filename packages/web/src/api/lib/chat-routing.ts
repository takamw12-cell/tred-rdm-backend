/**
 * Routage du chat : quel modèle, avec ou sans raisonnement étendu ?
 *
 * Le raisonnement « adaptive » coûtait jusqu'à plusieurs dizaines de
 * secondes AVANT le premier mot, même pour « Hallo ». On garde ce temps de
 * réflexion là où il protège la justesse — calculs, dérivations, photos
 * d'exercices — et on le retire là où il ne fait qu'attendre.
 *
 *   smalltalk  salutation, merci, « qui es-tu ? »  → Haiku 4.5, sans raisonnement
 *   concept    question courte, sans formule ni chiffre (« Explique la loi
 *              d'Ohm »)                               → Sonnet 4.6, sans raisonnement
 *   complex    tout le reste : calcul, formule, grandeurs avec unité, verbe de
 *              calcul, pièce jointe, examen, mode code, ≥ 50 mots
 *                                                     → Sonnet 4.6, raisonnement adaptive
 *
 * Les solveurs ne dépendent PAS du routage : les outils et la règle « tu ne
 * calcules jamais toi-même » sont les mêmes dans les trois cas. Dans le doute,
 * c'est « complex » qui gagne : une réponse lente vaut mieux qu'une fausse.
 */
import type { Domain } from "./solvers/domain";

export type Tier = "smalltalk" | "concept" | "complex";

export interface RouteInput {
  /** Texte de la DERNIÈRE question de l'étudiant. */
  text: string;
  /** Image ou PDF joint à cette question. */
  hasAttachments?: boolean;
  /** Matière détectée (solvers/domain.ts). */
  domain?: Domain;
  examMode?: boolean;
  calcMode?: boolean;
}

export interface Route {
  tier: Tier;
  modelId: string;
  thinking: "adaptive" | "off";
  /** Pourquoi — pour le log [perf], jamais montré à l'étudiant. */
  reason: string;
}

export const SONNET = "anthropic/claude-sonnet-4.6";
export const HAIKU = "anthropic/claude-haiku-4.5";

/** Au-delà, la question est assez longue pour mériter un brouillon. */
export const MAX_WORDS_WITHOUT_THINKING = 50;

const FORMULA = /[=^∫∑∏√∂∆∇≤≥≈≠±×÷→⇒]|\\[a-zA-Z]+|\$|\b[A-Za-zα-ωΑ-Ω]_[\w{]|\d\s*[+\-*/·]\s*\d|\b[a-z]\s*\(\s*[a-z]\s*\)/;
const QUANTITY =
  /\d+(?:[.,]\d+)?\s*(?:k|M|m|µ|u|n|G|c|d)?(?:N|Nm|m|m²|m³|s|h|min|g|t|V|A|W|Wh|Ω|ohm|Hz|Pa|bar|K|°C|°|J|cal|%|m\/s|km\/h|l|L|mol|F|H|rpm|U\/min)(?![\p{L}])/u;
const IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const CALC_VERB = new RegExp(
  [
    // de
    // (des verbes, pas les noms : « Was ist eine Ableitung ? » reste une question de cours)
    "berechne\\w*", "rechne\\b", "rechnet\\b", "rechnen\\b", "ausrechnen", "nachrechnen", "löse\\w*", "bestimme\\w*",
    "ermittle\\w*", "dimensionier\\w*", "herleit\\w*", "leite\\b", "beweise\\w*", "vereinfache\\w*", "minimiere\\w*",
    "verschlüssel\\w*", "entschlüssel\\w*", "integriere\\w*", "umrechn\\w*",
    // fr
    "calcule\\b", "calculez\\b", "calculer\\b", "calcules\\b", "résou\\w*", "résoudre", "détermine\\w*", "dimensionne\\w*",
    "démontre\\w*", "simplifie\\w*", "chiffrer", "chiffrez", "déchiffre\\w*", "intègre[rz]?",
    // en
    "calculate", "compute", "solve", "derive", "determine", "prove", "simplify", "encrypt", "decrypt", "integrate",
    "differentiate",
    // es
    "calcula\\w*", "resuelve", "resolver", "determina\\w*",
  ]
    .map((w) => `\\b${w}`)
    .join("|"),
  "iu",
);
const HARD_TOPIC =
  /\b(hyperstatisch\w*|statisch unbestimmt\w*|hyperstatique\w*|statically indeterminate|klausur\w*|prüfungsaufgabe\w*|übungsblatt|aufgabe\s*\d|exercice\s*\d|musterlösung|schritt für schritt|step by step|étape par étape|paso a paso)\b/iu;

const SMALLTALK =
  /^(?:hallo|hi|hey|servus|moin|grüß dich|guten (?:morgen|tag|abend)|bonjour|bonsoir|salut|coucou|hello|hola|ciao|danke\w*|vielen dank|merci\w*|thanks?|thank you|gracias|ok(?:ay)?|super|cool|top|perfekt|parfait|genial|tschüss|bye|au revoir|bis (?:bald|später|morgen)|wer bist du|was kannst du|qui es-tu|tu es qui|que sais-tu faire|who are you|what can you do|wie geht'?s|wie geht es dir|ça va|comment ça va|how are you)\b/iu;

export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Pourquoi la question doit réfléchir — null si elle n'en a pas besoin. */
export function complexityReason(input: RouteInput): string | null {
  const t = input.text ?? "";
  if (input.hasAttachments) return "pièce jointe";
  if (input.examMode) return "mode examen";
  if (input.calcMode) return "mode code";
  if (wordCount(t) >= MAX_WORDS_WITHOUT_THINKING) return `≥ ${MAX_WORDS_WITHOUT_THINKING} mots`;
  if (FORMULA.test(t)) return "formule";
  if (QUANTITY.test(t)) return "grandeur avec unité";
  if (IP.test(t)) return "adresse IP";
  if ((t.match(/\d+(?:[.,]\d+)?/g) ?? []).length >= 2) return "plusieurs nombres";
  if (CALC_VERB.test(t)) return "verbe de calcul";
  if (HARD_TOPIC.test(t)) return "sujet d'exercice";
  return null;
}

export function routeChat(input: RouteInput): Route {
  const why = complexityReason(input);
  if (why) return { tier: "complex", modelId: SONNET, thinking: "adaptive", reason: why };
  const t = (input.text ?? "").trim();
  if ((input.domain ?? "unbekannt") === "unbekannt" && wordCount(t) <= 8 && SMALLTALK.test(t)) {
    return { tier: "smalltalk", modelId: HAIKU, thinking: "off", reason: "salutation / méta" };
  }
  return { tier: "concept", modelId: SONNET, thinking: "off", reason: "question courte sans calcul" };
}
