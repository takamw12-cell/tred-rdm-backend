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
import { detectDomain, isCoveredDomain, type Domain, type DomainGuess } from "../solvers/domain";
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
import { detectSpecialization, specializationHint, SPECIALIZATION_THRESHOLD } from "./specialization-router";
import type { SpecializationMatch } from "./specializations/types";
import type { DomainFamily, FamilyId } from "./types";

export type { DomainFamily, FamilyId } from "./types";
export { detectSpecialization, specializationHint, SPECIALIZATION_THRESHOLD } from "./specialization-router";
export { SUBDOMAINS, FAMILY_LABEL } from "./taxonomy";
export { SPECIALIZATIONS } from "./specializations";
export type * from "./specializations/types";
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

export interface DomainContext {
  /** Matière fine (solvers/domain.ts). */
  guess: DomainGuess;
  family: DomainFamily | null;
  school: boolean;
  /** Spécialisation avancée (Master/Doctorat), ou null pour une question de base. */
  specialization: SpecializationMatch | null;
  /** Messages système, du plus général au plus précis : famille, puis spécialisation. */
  hints: string[];
}

/**
 * Tout le routage de domaine d'une question, en un appel : matière → famille →
 * spécialisation → messages système. C'est CE chemin que suit le tuteur
 * (api/index.ts) et que vérifient les tests d'intégration.
 */
export function domainContext(
  text: string | null | undefined,
  opts: { contextLabel?: string | null; level?: unknown } = {},
): DomainContext {
  const question = typeof text === "string" ? text : "";
  const firstGuess = detectDomain(question, opts.contextLabel ?? null);
  const detected = resolveFamily(firstGuess, { text: question, level: opts.level });
  const school = isSchoolContext(question, opts.level);
  const specText = [question, opts.contextLabel ?? ""].join("\n");

  // La spécialisation dans la famille reconnue, et la meilleure toutes familles.
  const scoped = detectSpecialization(specText, { family: detected?.id ?? null, school });
  const free = detectSpecialization(specText, { school });
  // La matière peut être AMBIGUË (« Haftung » = adhérence en mécanique ET
  // responsabilité en droit : mechanik 3, recht 3). Une spécialisation nette
  // l'emporte alors : si sa famille a aussi marqué des points, ou si son score
  // est très élevé, c'est elle qui décide de la famille et de la matière.
  const overrides =
    free !== null &&
    detected !== null &&
    free.family !== detected.id &&
    (free.score >= 2 * SPECIALIZATION_THRESHOLD || familySubjectScore(firstGuess, free.family) >= 2);
  const specialization = overrides ? free : scoped;

  // Une spécialisation reconnue désigne aussi sa famille quand la matière ne
  // l'a pas été (« NSTEMI », « Schlaganfall ») : la méthode de la famille et
  // ses garde-fous (pas de diagnostic pour une personne réelle) s'appliquent.
  const family = overrides && free ? FAMILIES[free.family] : (detected ?? (specialization ? FAMILIES[specialization.family] : null));
  // Matière recalée sur la famille retenue : pas d'indice de solveur de
  // mécanique dans une question de droit des sociétés.
  const guess = overrides && free ? retarget(firstGuess, free.family) : firstGuess;
  const hints = [familyHint(family, { school }), specializationHint(specialization)].filter((h): h is string => Boolean(h));
  return { guess, family, school, specialization, hints };
}

/** Meilleur score, dans la détection de matière, d'une matière de la famille. */
function familySubjectScore(guess: DomainGuess, family: FamilyId): number {
  return Math.max(0, ...FAMILIES[family].subjects.map((s) => guess.scores[s] ?? 0));
}

/** La matière de la famille la mieux notée (ou la première de la famille). */
function retarget(guess: DomainGuess, family: FamilyId): DomainGuess {
  const subjects = FAMILIES[family].subjects;
  const domain: Domain =
    [...subjects].sort((a, b) => (guess.scores[b] ?? 0) - (guess.scores[a] ?? 0))[0] ?? guess.domain;
  return { ...guess, domain, covered: isCoveredDomain(domain), also: guess.also.filter((d) => d !== domain) };
}
