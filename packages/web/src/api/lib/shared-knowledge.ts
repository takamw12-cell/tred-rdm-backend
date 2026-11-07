/**
 * Intelligence collective (V2 — Pilier 4, FONDATIONS).
 *
 * Avant qu'une explication quitte le compte d'un étudiant, elle passe par
 * `anonymize` : adresses e-mail, téléphones, numéros de matricule, URLs
 * personnelles et prénoms annoncés (« ich heiße Lena ») sont remplacés.
 * C'est un FILET, pas une garantie — d'où le statut « pending » et la
 * modération avant publication (docs/V2_ARCHITECTURE.md).
 */

export type KnowledgeStatus = "pending" | "published" | "removed";

export interface SharedKnowledgeEntry {
  id: string;
  courseId: string;
  topic: string;
  question: string;
  answer: string;
  upvotes: number;
  /** Le lecteur a-t-il déjà voté ? */
  votedByMe: boolean;
  createdAt: Date;
}

export interface ContributionDraft {
  courseId: string;
  topic: string;
  question: string;
  answer: string;
}

export const MAX_QUESTION = 1000;
export const MAX_ANSWER = 12_000;

const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[E-Mail]"],
  [/(?:\+|00)\d{1,3}[\s/-]?\(?\d{2,5}\)?[\s/-]?\d{3,}(?:[\s/-]?\d{2,})*/g, "[Telefon]"],
  [/\b0\d{2,5}[\s/-]?\d{4,}\b/g, "[Telefon]"],
  [/\b(?:Matrikel(?:nummer|nr\.?)?|Matr\.?-?Nr\.?|student id)\s*[:#]?\s*\d{5,9}\b/gi, "[Matrikelnummer]"],
  [/https?:\/\/\S+/g, "[Link]"],
  [
    /\b(ich heiße|ich heisse|mein name ist|my name is|je m'appelle|me llamo)\s+[\p{Lu}][\p{L}'-]+(?:\s+[\p{Lu}][\p{L}'-]+)?/giu,
    "$1 [Name]",
  ],
];

export function anonymize(text: string): string {
  return RULES.reduce((t, [re, rep]) => t.replace(re, rep), text).replace(/\s{3,}/g, "  ").trim();
}

export function contributionFrom(draft: ContributionDraft): ContributionDraft {
  return {
    courseId: draft.courseId,
    topic: anonymize(draft.topic).slice(0, 80),
    question: anonymize(draft.question).slice(0, MAX_QUESTION),
    answer: anonymize(draft.answer).slice(0, MAX_ANSWER),
  };
}
