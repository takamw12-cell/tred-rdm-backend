import type { Specialization } from "./types";

/** Gesellschaftsrecht — GmbH, AG, Personengesellschaften, Organhaftung, Kapitalschutz. */
export const corporate_law: Specialization = {
  id: "corporate_law",
  subdomain: "corporate",
  label: "Gesellschaftsrecht",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(gesellschaftsrecht\p{L}*|corporate law|company law|droit des sociétés)\b/u, 3],
    [/\b(gmbhg|aktg|umwg)\b/u, 3],
    [/\b(kapitalaufbringung|kapitalerhaltung|durchgriffshaftung|stammeinlage|stammkapital|einlagepflicht|geschäftsführerhaftung|organhaftung)\b/u, 3],
    [/\b(geschäftsführer\p{L}*|vorstand\p{L}*|aufsichtsrat\p{L}*|hauptversammlung|gesellschafterversammlung|gesellschafter\p{L}*)\b/u, 2],
    [/\b(gmbh|aktiengesellschaft|kommanditgesellschaft|ohg|gbr|kgaa|sarl|société anonyme)\b/u, 2],
    [/\bhgb\b/u, 1],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
