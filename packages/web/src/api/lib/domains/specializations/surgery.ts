import type { Specialization } from "./types";

/** Chirurgie — Indikation, Verfahrenswahl, Komplikationen, perioperatives Management. */
export const surgery: Specialization = {
  id: "surgery",
  subdomain: "surgery",
  label: "Chirurgie",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(chirurgi\p{L}*|surgery|surgical|chirurgisch\p{L}*)\b/u, 3],
    [/\b(appendektomie|cholezystektomie|laparoskopi\p{L}*|laparotomie|anastomose\p{L}*|herniotomie|leistenhernie|akute[sn]? abdomen|perioperativ\p{L}*|wundheilung\p{L}*|op[- ]indikation)\b/u, 3],
    [/\b(operation|eingriff|drainage)\b/u, 1],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
