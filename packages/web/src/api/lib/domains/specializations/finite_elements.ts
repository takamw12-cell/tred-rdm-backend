import type { Specialization } from "./types";

/** Finite-Elemente-Methode — Diskretisierung, Steifigkeitsmatrix, Ansatzfunktionen, Konvergenz. */
export const finite_elements: Specialization = {
  id: "finite_elements",
  subdomain: "mechanical",
  label: "Finite-Elemente-Methode",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(finite[- ]?elemente?[- ]?methode|finite elemente|finite element\p{L}*|fem|fea|éléments finis)\b/u, 3],
    [/\b(steifigkeitsmatrix|stiffness matrix|ansatzfunktion\p{L}*|formfunktion\p{L}*|shape function\p{L}*|netzkonvergenz|mesh convergence|isoparametrisch\p{L}*)\b/u, 3],
    [/\b(gauß[- ]?integration|gauss quadrature|elementsteifigkeit\p{L}*|knotenverschiebung\p{L}*|vernetzung)\b/u, 2],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
