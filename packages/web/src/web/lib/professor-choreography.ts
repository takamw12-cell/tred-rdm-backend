import { answerToSpeech } from "@/lib/speech";
import type { TafelSplit } from "@/lib/tafel";

/**
 * La chorégraphie du professeur hologramme, comme un vrai cours :
 *
 *   schreiben  pendant que la réponse s'écrit, il est tourné vers le tableau,
 *              silencieux et immobile ;
 *   drehen     le flux se termine : il se retourne (rotation Y, ~0,8 s) ;
 *   erklaeren  face à toi, il lit sa réponse à voix haute, le halo pulse ;
 *   idle       face à toi, en silence (au repos, ou lecture coupée).
 *
 * Module pur, testé dans tests/hoersaal-choreography.test.ts ; le composant
 * et le minutage sont dans components/hologram-professor.tsx.
 */
export type ProfessorPose = "idle" | "schreiben" | "drehen" | "erklaeren";

/** Durée du retournement, en secondes (framer-motion) et en millisecondes (minuterie). */
export const TURN_SECONDS = 0.8;
export const TURN_MS = TURN_SECONDS * 1000;

export type ChoreographyEvent =
  | { type: "streamStart" }
  | { type: "streamEnd"; hasAnswer: boolean }
  | { type: "turned"; willSpeak: boolean }
  | { type: "spoken" }
  | { type: "stop" };

export function nextPose(pose: ProfessorPose, event: ChoreographyEvent): ProfessorPose {
  switch (event.type) {
    case "streamStart":
      return "schreiben";
    case "streamEnd":
      // Rien à dire (erreur, réponse vide) : il se retourne quand même, en silence.
      return pose === "schreiben" ? (event.hasAnswer ? "drehen" : "idle") : pose;
    case "turned":
      return pose === "drehen" ? (event.willSpeak ? "erklaeren" : "idle") : pose;
    case "spoken":
      return pose === "erklaeren" ? "idle" : pose;
    case "stop":
      return pose === "schreiben" ? pose : "idle";
  }
}

/**
 * Ce que le professeur DIT : sa parole (le commentaire hors Tafel). S'il n'a
 * rien écrit hors du tableau, il lit les étapes du tableau, dans l'ordre.
 */
/** Titres de feuille qui n'apportent rien à l'oral. */
const GENERIC_LABEL = /^(?:rückmeldung|kommentar|feedback|erklärung|antwort|schritt \d+|commentaire|explication|réponse|comment|explanation|answer)$/i;

export function spokenAnswer(split: Pick<TafelSplit, "steps" | "commentary"> | undefined, fullText: string): string {
  if (!split) return answerToSpeech(fullText);
  const voice = answerToSpeech(split.commentary);
  if (voice) return voice;
  // Les titres génériques (« Rückmeldung », « Erklärung ») ne se lisent pas.
  return answerToSpeech(
    split.steps.map((s) => (GENERIC_LABEL.test(s.label) ? s.body : `${s.label}. ${s.body}`)).join("\n\n"),
  );
}
