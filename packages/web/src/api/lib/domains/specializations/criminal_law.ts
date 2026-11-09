import type { Specialization } from "./types";

/** Strafrecht — Deliktsaufbau, Beteiligung, Versuch und Rücktritt. */
export const criminal_law: Specialization = {
  id: "criminal_law",
  subdomain: "criminal",
  label: "Strafrecht",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(strafrecht\p{L}*|criminal law|droit pénal)\b/u, 3],
    [/\bstgb\b/u, 3],
    [/\b(tatbestandsmäßigkeit|objektive[rn]? tatbestand|subjektive[rn]? tatbestand|rechtswidrigkeit|schuldfähigkeit|vorsatz|fahrlässigkeit|notwehr|mittäterschaft|anstiftung|rücktritt vom versuch)\b/u, 2],
    [/\b(betrug|diebstahl|totschlag|mord|körperverletzung|raub|unterschlagung|urkundenfälschung)\b/u, 2],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
