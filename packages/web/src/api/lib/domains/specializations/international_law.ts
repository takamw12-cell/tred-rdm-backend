import type { Specialization } from "./types";

/** Völkerrecht — Rechtsquellen, Gewaltverbot, Staatenverantwortlichkeit, IGH. */
export const international_law: Specialization = {
  id: "international_law",
  subdomain: "international",
  label: "Völkerrecht",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(völkerrecht\p{L}*|public international law|international law|droit international public)\b/u, 3],
    [/\b(un[- ]charta|charta der vereinten nationen|un charter|gewaltverbot|interventionsverbot|selbstverteidigungsrecht)\b/u, 3],
    [/\b(wiener vertragsrechtskonvention|wvk|igh[- ]statut|internationale[rn]? gerichtshof|icj|staatenverantwortlichkeit|völkergewohnheitsrecht|ius cogens|jus cogens)\b/u, 3],
    [/\b(staatenimmunität|diplomatische[rn]? schutz|souveränität)\b/u, 2],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
