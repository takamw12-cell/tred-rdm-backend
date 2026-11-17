import { track } from "./analytics";

/**
 * Le tunnel d'activation — cinq événements, dans l'ordre où un étudiant les
 * traverse. Dans PostHog : Product analytics → New insight → Funnel, avec ces
 * cinq noms (voir GUIDE_FOUNDER.md, « Tunnel d'activation »).
 *
 * Comme tout PostHog chez TRED (lib/analytics.ts), ces événements ne partent
 * QUE si la personne a accepté l'analyse : le tunnel compte donc les
 * visiteurs consentants, pas tous les comptes. Le nombre exact d'inscriptions
 * reste dans /admin/analytics.
 *
 * Aucun contenu ne part : ni la question, ni le nom du fichier.
 */
export const FUNNEL = {
  signedUp: "user_signed_up",
  uploadStarted: "pdf_upload_started",
  uploadCompleted: "pdf_upload_completed",
  firstQuestion: "first_question_asked",
  videoGenerated: "video_generated",
} as const;

export const FUNNEL_STEPS = [FUNNEL.signedUp, FUNNEL.uploadStarted, FUNNEL.uploadCompleted, FUNNEL.firstQuestion, FUNNEL.videoGenerated] as const;

type Props = Record<string, string | number | boolean>;

export const funnel = {
  signedUp: (method: "email" | "google") => track(FUNNEL.signedUp, { method }),
  uploadStarted: (props: Props) => track(FUNNEL.uploadStarted, props),
  uploadCompleted: (props: Props) => track(FUNNEL.uploadCompleted, props),
  videoGenerated: (props: Props = {}) => track(FUNNEL.videoGenerated, props),
};

/**
 * La PREMIÈRE question d'un compte : pas de drapeau déjà posé sur cet
 * appareil, aucune conversation enregistrée, aucun message dans la
 * conversation en cours. Pure, testée.
 */
export function isFirstQuestion(input: { flagged: boolean; savedChats: number; messagesInChat: number }): boolean {
  return !input.flagged && input.savedChats === 0 && input.messagesInChat === 0;
}

const flagKey = (userId: string) => `tred.funnel.firstQuestion.${userId}`;

/** À appeler à chaque question envoyée : n'émet l'événement qu'une fois par compte. */
export function noteQuestionAsked(input: { userId: string | null | undefined; savedChats: number; messagesInChat: number; withAttachment: boolean }): void {
  if (!input.userId) return;
  let flagged = false;
  try {
    flagged = localStorage.getItem(flagKey(input.userId)) === "1";
  } catch {
    /* stockage indisponible : on se fie aux conversations */
  }
  if (isFirstQuestion({ flagged, savedChats: input.savedChats, messagesInChat: input.messagesInChat })) {
    track(FUNNEL.firstQuestion, { with_attachment: input.withAttachment });
  }
  try {
    localStorage.setItem(flagKey(input.userId), "1");
  } catch {
    /* navigation privée */
  }
}
