import type { Specialization } from "./types";

/** Kardiologie — Koronarsyndrom, Herzinsuffizienz, Rhythmusstörungen, Klappen. */
export const cardiology: Specialization = {
  id: "cardiology",
  subdomain: "cardiology",
  label: "Kardiologie",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(kardiologi\p{L}*|cardiology|cardiologie)\b/u, 3],
    [/\b(myokardinfarkt|herzinfarkt|stemi|nstemi|akute[sn]? koronarsyndrom|khk|koronare[rn]? herzkrankheit|herzinsuffizienz|vorhofflimmern|aortenstenose|mitralinsuffizienz|kardiomyopathie|infarctus|heart failure|myocardial infarction|atrial fibrillation)\b/u, 3],
    [/\b(ekg|ecg|troponin\p{L}*|echokardiographie|koronarangiographie|herzkatheter\p{L}*|st[- ]hebung\p{L}*)\b/u, 2],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
