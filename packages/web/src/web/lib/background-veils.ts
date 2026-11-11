/**
 * Voiles du fond photographique (components/dynamic-background.tsx).
 * Module pur : le test de contraste AA (tests/background-sets.test.ts) le lit
 * sans charger React ni l'API.
 */
/**
 * `vivid` : dashboard et Hörsaal — voile sombre, la photo porte l'ambiance.
 * `calm`  : pages de lecture (chat, exercices…) — voile plus couvrant ; les
 *           cartes en verre assurent le contraste du texte.
 */
export const VEILS = {
  // Dense en HAUT (80 %), où le titre est posé sur la photo — blanc et blanc
  // à 70 % restent ≥ 4,5:1 même sur un pixel blanc ; léger au milieu (45 %),
  // où les cartes en verre portent leur propre fond. Calcul du pire cas
  // (pixel blanc) dans tests/background-sets.test.ts : il vaut pour toute
  // image, les fonds universels sombres et dorés compris.
  vivid: "from-[#070B14]/80 via-[#0B1222]/45 to-[#070B14]/60",
  // Pages de lecture : 85 → 60 %. Plancher : sous 60 %, le texte gris des
  // cartes en verre passerait sous 4,5:1 sur la photo la plus défavorable.
  calm: "from-background/85 via-background/65 to-background/60",
} as const;
