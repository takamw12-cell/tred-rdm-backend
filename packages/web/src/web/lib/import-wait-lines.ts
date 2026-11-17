/**
 * Ce que Prof. Kenta dit pendant l'import : une phrase toutes les 5 secondes,
 * puis, passé 30 secondes, le mot pour les gros documents. Pur, testé.
 *
 * Les phrases décrivent ce que le serveur fait VRAIMENT pendant l'import
 * (lecture, extraction du texte et des formules, numéros de page pour les
 * citations) : pas de « plan d'étude », il ne se prépare pas à ce moment-là.
 */
export const WAIT_STEP_SECONDS = 5;
export const WAIT_LONG_SECONDS = 30;
export const WAIT_STEP_KEYS = ["library.wait.step1", "library.wait.step2", "library.wait.step3"] as const;
export const WAIT_LONG_KEY = "library.wait.long";

export function waitLineKey(elapsedSeconds: number): string {
  if (elapsedSeconds >= WAIT_LONG_SECONDS) return WAIT_LONG_KEY;
  const i = Math.floor(Math.max(0, elapsedSeconds) / WAIT_STEP_SECONDS) % WAIT_STEP_KEYS.length;
  return WAIT_STEP_KEYS[i];
}
