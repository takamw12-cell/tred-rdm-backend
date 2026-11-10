import { cleanForVoice, professorSpeech } from "@/lib/speech";
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
 * Ce que le professeur DIT : ses paroles ([[PROFESSEUR]]). À défaut (ancien
 * format), le texte hors des feuilles. JAMAIS les feuilles du tableau : depuis
 * le 2026-11-11 (décision fondateur), un prof ne récite pas ce qu'il vient
 * d'écrire. Sans paroles, il se retourne en silence.
 */
export function spokenAnswer(
  split: Pick<TafelSplit, "steps" | "commentary"> & Partial<Pick<TafelSplit, "spoken">> | undefined,
  fullText: string,
): string {
  if (!split) return professorSpeech(fullText);
  return cleanForVoice(split.spoken?.trim() ? split.spoken : split.commentary);
}
