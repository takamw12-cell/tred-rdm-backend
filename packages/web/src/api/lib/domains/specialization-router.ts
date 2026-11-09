import type { FamilyId } from "./types";
import { FAMILY_LABEL, SUBDOMAINS } from "./taxonomy";
import { SPECIALIZATIONS } from "./specializations";
import type { Specialization, SpecializationFamily, SpecializationMatch } from "./specializations/types";

/**
 * Routeur des spécialisations avancées (niveau Master/Doctorat).
 *
 *   question ──► detectSpecialization()  spécialisation + sous-domaine (ou null)
 *            ──► specializationHint()    méthode du sous-domaine, règle
 *                                        « Skripte d'abord », mode Vorlesung
 *
 * Pur et déterministe (aucun appel réseau, aucun modèle) : mots-clés pondérés,
 * comme solvers/domain.ts. Une question de BASE (« Was ist Mord? ») reste sous
 * le seuil : seule une vraie question de spécialisation charge ces règles.
 */

/** Score minimal : un terme spécifique (poids 3), ou deux termes moyens. */
export const SPECIALIZATION_THRESHOLD = 3;

/** Longueur lue au plus : au-delà, le texte n'apporte rien et coûte du temps. */
const MAX_TEXT = 4000;

const SPEC_FAMILIES: ReadonlySet<FamilyId> = new Set<SpecializationFamily>(["stem", "law", "medicine"]);
const isSpecFamily = (f: FamilyId): f is SpecializationFamily => SPEC_FAMILIES.has(f);

/** `\b` de JavaScript ignore les umlauts (« ß », « ä ») : frontière Unicode à la place. */
const BOUNDARY = "(?:(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_])|(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_]))";
const compiled = new Map<RegExp, RegExp>();
function unicodeWords(re: RegExp): RegExp {
  let r = compiled.get(re);
  if (!r) {
    r = new RegExp(re.source.split("\\b").join(BOUNDARY), "gu");
    compiled.set(re, r);
  }
  r.lastIndex = 0;
  return r;
}

function score(spec: Specialization, text: string): { score: number; matched: string[] } {
  let total = 0;
  const matched = new Set<string>();
  for (const [pattern, weight] of spec.keywords) {
    const hits = text.match(unicodeWords(pattern));
    if (!hits) continue;
    total += weight; // une fois par règle : répéter un mot ne gonfle pas le score
    for (const h of hits) matched.add(h.trim());
  }
  return { score: total, matched: [...matched] };
}

export interface SpecializationContext {
  /** Famille déjà reconnue (domains/resolveFamily). Restreint les candidats. */
  family?: FamilyId | null;
  /** Niveau scolaire : pas de mode Master au lycée. */
  school?: boolean;
}

/**
 * La spécialisation de la question, ou null.
 * - Au lycée : jamais (le mode « Vorlesung » est un niveau Master).
 * - Si la famille est connue (ingénierie, droit, médecine), seules ses
 *   spécialisations concourent : une question de droit pénal sur une
 *   « Operation » reste du droit.
 * - Égalité de score : la première du registre, toujours la même (stable).
 */
export function detectSpecialization(text: string | null | undefined, ctx: SpecializationContext = {}): SpecializationMatch | null {
  if (ctx.school) return null;
  const t = (typeof text === "string" ? text : "").toLowerCase().slice(0, MAX_TEXT);
  if (!t.trim()) return null;
  const restrict = ctx.family && isSpecFamily(ctx.family) ? ctx.family : null;

  let best: SpecializationMatch | null = null;
  for (const spec of Object.values(SPECIALIZATIONS)) {
    const subdomain = SUBDOMAINS[spec.subdomain];
    if (restrict && subdomain.family !== restrict) continue;
    const s = score(spec, t);
    if (s.score < SPECIALIZATION_THRESHOLD) continue;
    if (!best || s.score > best.score) {
      best = { specialization: spec, subdomain, family: subdomain.family, score: s.score, matched: s.matched };
    }
  }
  return best;
}

/**
 * Le message système d'une spécialisation : mode Vorlesung, sources d'abord,
 * méthode du sous-domaine, règles métier propres. Null si rien n'est reconnu.
 */
export function specializationHint(match: SpecializationMatch | null): string | null {
  if (!match) return null;
  const { specialization: spec, subdomain: sub } = match;
  const calcTools = sub.tools.filter((t) => t !== "suche_in_unterlagen" && t !== "recherche_connaissances_externes");
  return [
    `SPEZIALISIERUNG ERKANNT (automatisch): ${spec.label} — Teilgebiet ${sub.label} (${FAMILY_LABEL[match.family]}), Niveau ${spec.level === "doctorate" ? "Promotion" : "Master"}.`,
    "VORLESUNGS-MODUS: Antworte wie eine Universitätsprofessorin bzw. ein Universitätsprofessor in einer Master-Vorlesung — " +
      "präzise Fachsprache, Herleitung statt Merksätze, Annahmen und Gültigkeitsgrenzen ausdrücklich, jeden Fachbegriff beim ersten Auftreten definiert. " +
      "Bleib zugewandt: kein Monolog, am Ende eine Verständnisfrage.",
    "QUELLEN ZUERST (Pflicht bei Spezialfragen):",
    "1. KEINE Allgemeinplätze. Rufe ZUERST suche_in_unterlagen mit den Fachbegriffen der Frage auf und stütze die Antwort auf die Skripte der Person, mit Fundstelle.",
    calcTools.length > 0
      ? `2. Braucht die Antwort Gleichungen oder Zahlen: rechne mit den Lösern (${calcTools.join(", ")}) oder zeichne ein Schema — nie aus dem Kopf.`
      : "2. Normen, Leitlinien und Zahlen nur mit Quelle — aus den Unterlagen oder belegter Recherche (recherche_connaissances_externes).",
    "3. Steht dazu nichts in den Unterlagen, sag es klar („In deinen Unterlagen finde ich dazu nichts“) und kennzeichne alles Weitere als allgemeines Fachwissen.",
    `METHODE ${sub.label.toUpperCase()}: ${sub.method}`,
    `UNTERLAGEN: ${sub.rag}`,
    ...spec.rules.map((r) => `REGEL ${spec.label}: ${r}`),
  ].join("\n");
}
