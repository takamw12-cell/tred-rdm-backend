/**
 * Dix secondes sans un mot au tableau : le tableau dit ce que le tuteur lit.
 *
 * La pastille du haut nomme l'étape en cours (lib/chat-phase.ts). Cette phrase
 * s'écrit, elle, À LA PLACE de la réponse (components/tafel-board.tsx), quand
 * la première ligne tarde : pièce jointe, calcul avec raisonnement, recherche
 * dans un long Skript.
 */

/** Délai avant la phrase : au-delà, on a vu des étudiants fermer l'onglet. */
export const PATIENCE_MS = 10_000;

export type PatienceKey = "chat.patienceAttachment" | "chat.patienceReading" | "chat.patienceGeneric";

/**
 * La phrase dit vrai : « je lis ta pièce jointe » s'il y en a une, « je lis
 * ton cours » si la question porte sur des documents, sinon une phrase neutre.
 */
export function patienceKey(ctx: { attachment: boolean; documents: boolean }): PatienceKey {
  if (ctx.attachment) return "chat.patienceAttachment";
  return ctx.documents ? "chat.patienceReading" : "chat.patienceGeneric";
}
