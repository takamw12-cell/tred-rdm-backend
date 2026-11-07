/**
 * Routeur de domaines universel.
 *
 *   question ──► solvers/domain.ts (matière fine : mechanik, recht, medizin…)
 *            ──► resolveFamily()   (famille : stem, law, medicine, economics, highschool)
 *            ──► familyHint()      (méthode + outils + où chercher, message système)
 *
 * Pour STEM, rien ne change : le prompt principal et les indices de solveur
 * existants restent la méthode (familyHint renvoie null). Pour le droit, la
 * médecine et l'économie, l'indice de famille REMPLACE « il n'y a pas de
 * solveur » par la méthode de la discipline et l'outil evaluate_structure.
 */
import type { DomainGuess } from "../solvers/domain";
import { economics } from "./economics";
import { highschool } from "./highschool";
import { law } from "./law";
import { medicine } from "./medicine";
import { stem } from "./stem";
import type { DomainFamily, FamilyId } from "./types";

export type { DomainFamily, FamilyId } from "./types";
export { evaluateStructure, SCHEMAS, type StructureDomain, type StructureResult } from "./structure";

export const FAMILIES: Record<FamilyId, DomainFamily> = { stem, law, medicine, economics, highschool };

// Le niveau scolaire se lit au profil ou à ces mots ; jamais au seul sujet
// (une parabole est aussi un sujet d'université).
const SCHOOL =
  /(?<![\p{L}\p{N}])(abitur|abi|gymnasium|oberstufe|mittelstufe|realschule|gesamtschule|hauptschule|klasse\s*(?:[5-9]|1[0-3])|(?:[5-9]|1[0-3])\.\s*klasse|lycée|collège|terminale|brevet|baccalauréat|high school|middle school|gcse|a-levels?)(?![\p{L}\p{N}])/iu;

export function isSchoolContext(text: string, level?: unknown): boolean {
  return level === "school" || SCHOOL.test(text ?? "");
}

/** La famille de la question, ou null si la matière n'est pas reconnue. */
export function resolveFamily(guess: DomainGuess, ctx: { text?: string; level?: unknown } = {}): DomainFamily | null {
  if (isSchoolContext(ctx.text ?? "", ctx.level)) return highschool;
  for (const f of [law, medicine, economics]) if (f.subjects.includes(guess.domain)) return f;
  if (stem.subjects.includes(guess.domain)) return stem;
  return null;
}

/**
 * Le message système de la famille. Null pour STEM (déjà couvert par le prompt
 * principal et domainHint) et quand rien n'est reconnu.
 */
export function familyHint(family: DomainFamily | null): string | null {
  if (!family || family.id === "stem" || !family.prompt) return null;
  return [
    `ERKANNTE FACHFAMILIE (automatisch): ${family.label}.`,
    family.prompt,
    `UNTERLAGEN: ${family.rag} Benutze suche_in_unterlagen, bevor du allgemeines Wissen nimmst.`,
    `WERKZEUGE dieser Methode: ${family.allowedTools.join(", ")}.`,
    "Mische NIE die Methoden zweier Fächer (kein Gutachtenstil in Mathematik, keine Formelrechnung als Ersatz für eine juristische Subsumtion oder eine klinische Begründung).",
  ].join("\n");
}
