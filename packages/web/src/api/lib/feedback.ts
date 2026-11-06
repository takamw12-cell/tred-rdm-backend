import { z } from "zod";

/**
 * Retours des bêta-testeurs — règles pures (testées dans tests/feedback.test.ts).
 * La route est dans routes/feedback.ts, la table dans database/schema.ts.
 */

/** Fehler / Idee / Allgemein. */
export const FEEDBACK_TYPES = ["bug", "idea", "general"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = ["open", "resolved"] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const MIN_MESSAGE = 3;
export const MAX_MESSAGE = 4000;
/** Assez pour un étudiant enthousiaste, trop peu pour remplir la base. */
export const MAX_PER_HOUR = 10;

export const feedbackInput = z.object({
  type: z.enum(FEEDBACK_TYPES),
  rating: z.number().int().min(1).max(5).nullish(),
  message: z.string().trim().min(MIN_MESSAGE).max(MAX_MESSAGE),
  pageUrl: z.string().max(2000).optional(),
  locale: z.string().max(8).optional(),
});
export type FeedbackInput = z.infer<typeof feedbackInput>;

/** Paramètres d'URL qu'on ne garde jamais : jetons, codes, secrets. */
const SECRET_PARAM = /token|code|secret|key|password|session|auth|sig/i;

/**
 * La page où le retour a été écrit, réduite à « /chemin?params-sûrs ».
 *
 * Le client envoie `location.pathname + location.search` ; on n'en garde que
 * le chemin et les paramètres sans risque — un lien de réinitialisation ou un
 * retour de paiement porte un jeton, qui n'a rien à faire dans une table que
 * l'on relit à l'écran. Jamais d'hôte : seul le site lui-même est concerné.
 */
export function cleanPageUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw, "https://tred.invalid");
  } catch {
    return "";
  }
  // Copie : on supprime pendant le parcours.
  for (const key of Array.from(url.searchParams.keys())) {
    if (SECRET_PARAM.test(key)) url.searchParams.delete(key);
  }
  const query = url.searchParams.toString();
  return (url.pathname + (query ? `?${query}` : "")).slice(0, 500);
}

/** Le navigateur, borné : utile pour reproduire un bug, inutile au-delà. */
export function cleanUserAgent(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\r\n]+/g, " ").slice(0, 300);
}

export function newFeedbackId(): string {
  return `fb_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
