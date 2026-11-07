/**
 * Routeur de domaines universel.
 *
 *   question ──► solvers/domain.ts (matière fine : mechanik, recht, medizin…)
 *            ──► resolveFamily()   (famille : stem, law, medicine, economics, highschool)
 *            ──► familyHint()      (méthode + outils + où chercher, message système)
 *
 * Pour STEM, rien ne change : le prompt principal et les indices de solveur
 * existants restent la méthode (familyHint renvoie null). Pour le droit, la
 * médecine, l'économie, la biologie, la psychologie, la philosophie, les
 * langues et l'histoire, l'indice de famille REMPLACE « il n'y a pas de
 * solveur » par la méthode de la discipline et l'outil evaluate_structure.
 */
import type { DomainGuess } from "../solvers/domain";
import { biology } from "./biology";
import { economics } from "./economics";
import { highschool } from "./highschool";
import { history } from "./history";
import { languages } from "./languages";
import { law } from "./law";
import { medicine } from "./medicine";
import { philosophy } from "./philosophy";
import { psychology } from "./psychology";
import { stem } from "./stem";
import type { DomainFamily, FamilyId } from "./types";

export type { DomainFamily, FamilyId } from "./types";
export { evaluateStructure, SCHEMAS, type StructureDomain, type StructureResult } from "./structure";

export const FAMILIES: Record<FamilyId, DomainFamily> = {
  stem,
  law,
  medicine,
  economics,
  biology,
  psychology,
  philosophy,
  languages,
  history,
  highschool,
};

/** Familles dont la MÉTHODE est propre à la discipline (pas de solveur comme méthode). */
const METHOD_FAMILIES: DomainFamily[] = [law, medicine, economics, biology, psychology, philosophy, languages, history];

// Le niveau scolaire se lit au profil ou à ces mots ; jamais au seul sujet
// (une parabole est aussi un sujet d'université).
const SCHOOL =
  /(?<![\p{L}\p{N}])(abitur|abi|gymnasium|oberstufe|mittelstufe|realschule|gesamtschule|hauptschule|klasse\s*(?:[5-9]|1[0-3])|(?:[5-9]|1[0-3])\.\s*klasse|lycée|collège|terminale|brevet|baccalauréat|high school|middle school|gcse|a-levels?)(?![\p{L}\p{N}])/iu;

export function isSchoolContext(text: string, level?: unknown): boolean {
  return level === "school" || SCHOOL.test(text ?? "");
}

/**
 * La famille de la question, ou null si la matière n'est pas reconnue.
 * La méthode d'une discipline (droit, histoire, langues…) prime : au lycée,
 * une analyse de source reste une analyse de source — familyHint ajoute alors
 * le niveau scolaire. Pour les maths et les sciences, l'école a sa famille.
 */
export function resolveFamily(guess: DomainGuess, ctx: { text?: string; level?: unknown } = {}): DomainFamily | null {
  const method = METHOD_FAMILIES.find((f) => f.subjects.includes(guess.domain));
  if (method) return method;
  if (isSchoolContext(ctx.text ?? "", ctx.level)) return highschool;
  if (stem.subjects.includes(guess.domain)) return stem;
  return null;
}

/**
 * Le message système de la famille. Null pour STEM (déjà couvert par le prompt
 * principal et domainHint) et quand rien n'est reconnu.
 */
export function familyHint(family: DomainFamily | null, opts: { school?: boolean } = {}): string | null {
  if (!family || family.id === "stem" || !family.prompt) return null;
  return [
    `ERKANNTE FACHFAMILIE (automatisch): ${family.label}.`,
    family.prompt,
    opts.school && family.id !== "highschool"
      ? "SCHULNIVEAU: Die Person ist in der Schule (Mittel- oder Oberstufe) — dieselbe Methode, aber Schulsprache, kurze Schritte und Beispiele aus dem Alltag."
      : "",
    `UNTERLAGEN: ${family.rag} Benutze suche_in_unterlagen, bevor du allgemeines Wissen nimmst.`,
    `WERKZEUGE dieser Methode: ${family.allowedTools.join(", ")}.`,
    "Mische NIE die Methoden zweier Fächer (kein Gutachtenstil in Mathematik, keine Formelrechnung als Ersatz für eine juristische Subsumtion oder eine klinische Begründung).",
  ]
    .filter(Boolean)
    .join("\n");
}
