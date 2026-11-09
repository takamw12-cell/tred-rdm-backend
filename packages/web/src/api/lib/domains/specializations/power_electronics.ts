import type { Specialization } from "./types";

/** Leistungselektronik — Gleichspannungswandler, Wechselrichter, Modulation, Schaltverluste. */
export const power_electronics: Specialization = {
  id: "power_electronics",
  subdomain: "electrical",
  label: "Leistungselektronik",
  level: "master",
  // [motif, poids] — seuil de détection : 3 (specialization-router.ts).
  keywords: [
    [/\bleistungselektronik\b/u, 3],
    [/\b(tiefsetzsteller|hochsetzsteller|hoch[- ]?tiefsetzsteller|buck[- ]converter|boost[- ]converter|gleichspannungswandler|dc[- ]dc[- ]wandler)\b/u, 3],
    [/\b(wechselrichter|inverter|onduleur|b6[- ]?brücke|thyristor\p{L}*|igbt|raumzeiger\p{L}*|space vector)\b/u, 2],
    [/\b(pwm|pulsweitenmodulation|tastgrad|duty cycle|schaltverluste|lückbetrieb|lückende[rn]? betrieb)\b/u, 2],
  ],
  // Règles métier propres à la spécialisation : à compléter au besoin.
  rules: [],
};
