import type { Specialization } from "./types";

/** Stahlbetonbau — Bemessung nach Eurocode 2, Bewehrung, Durchstanzen. */
export const reinforced_concrete: Specialization = {
  id: "reinforced_concrete",
  subdomain: "civil",
  label: "Stahlbetonbau",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\b(stahlbeton\p{L}*|spannbeton\p{L}*|reinforced concrete|prestressed concrete|béton armé)\b/u, 3],
    [/\b(biegebemessung|bewehrung\p{L}*|durchstanz\p{L}*|querkraftbewehrung|mindestbewehrung|rissbreite\p{L}*)\b/u, 3],
    [/\b(eurocode\s*2|ec\s*2|din en 1992)\b/u, 3],
    [/\b(bemessung|grenzzustand der tragfähigkeit|teilsicherheitsbeiwert\p{L}*)\b/u, 1],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
