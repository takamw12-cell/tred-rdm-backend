import type { Specialization } from "./types";

/** Aerodynamik — Profile, Auftrieb, Widerstand, Tragflügeltheorie. */
export const aerodynamics: Specialization = {
  id: "aerodynamics",
  subdomain: "aerospace",
  label: "Aerodynamik",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\baerodynami\p{L}*/u, 3],
    [/\b(auftriebsbeiwert|widerstandsbeiwert|auftriebsverteilung|profiltheorie|tragflügeltheorie|traglinientheorie)\b/u, 3],
    [/\bkutta[- ]?joukowski\b/u, 3],
    [/\b(induzierte[rn]? widerstand|induced drag|lift coefficient|drag coefficient|airfoil|aerofoil)\b/u, 3],
    [/\bnaca[- ]?\d{4}\b/u, 3],
    [/\b(anstellwinkel|angle of attack|tragflügel|tragfläche|zirkulation|abwind|strömungsabriss|stall)\b/u, 2],
    [/\b(auftrieb|portance|traînée|lift|drag)\b/u, 1],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
