/**
 * Fond de l'application selon la filière.
 *
 * Structure : public/backgrounds/<catégorie>/…  — une catégorie = un dossier.
 * Ajouter une image : la déposer dans le dossier, l'ajouter à CATEGORY_IMAGES,
 * la créditer dans public/backgrounds/CREDITS.md.
 *
 * Tant qu'une catégorie a peu d'images, ses images sont INTERCALÉES avec le
 * fond général : avec une seule image, la rotation de 10 min resterait figée.
 *
 * Module pur (aucun React, aucun DOM) : testé dans tests/background-sets.test.ts.
 */

export type BackgroundCategory =
  | "general"
  | "aerospace"
  | "mechatronics"
  | "mechanical"
  | "electrical"
  | "civil"
  | "informatics"
  | "physics";

const G = (n: number) => `/backgrounds/general/bg-0${n}.webp`;
const F = (folder: string, ns: number[]) =>
  ns.map((n) => `/backgrounds/${folder}/${folder}-0${n}.webp`);
export const GENERAL = [G(1), G(2), G(3), G(4), G(5), G(6), G(7), G(8)];

/** Images propres à chaque catégorie. Vide = fond général uniquement. */
export const CATEGORY_IMAGES: Record<BackgroundCategory, string[]> = {
  general: [],
  // La fusée d'abord : c'est la première image que voit un étudiant LRT.
  aerospace: F("aerospace", [2, 1, 3]),
  mechatronics: F("mechatronics", [1, 2, 3]),
  electrical: F("electrical", [1, 2, 3]), // pylônes, éclair
  // Moteurs + l'ossature acier du fond général.
  mechanical: [...F("mechanical", [1, 2]), G(4)],
  // Façade + les ponts du fond général : le génie civil, c'est eux.
  civil: [...F("civil", [1]), G(3), G(6), G(7), G(8)],
  informatics: F("informatics", [1, 2, 3]), // code à l'écran
  physics: F("physics", [1, 2, 3]), // nébuleuse, Voie lactée, tableau
};

/**
 * Reconnaît la filière à partir du texte libre saisi par l'étudiant
 * (profil ou semestre). Ordre important : « Mechatronik » contient
 * « Mechan… », il doit passer AVANT le génie mécanique.
 */
const RULES: [BackgroundCategory, RegExp][] = [
  ["aerospace", /luft|raumfahrt|aero|aviation|avion|flug|space|spatial/i],
  ["mechatronics", /mechatron|robot/i],
  ["electrical", /elektro|electr|informationstechnik|nachrichtentechnik/i],
  ["civil", /bauingenieur|bauwesen|\bbau\b|civil|architekt|génie civil/i],
  ["mechanical", /maschinenbau|mechanical|mécanique|mechanik|produktion/i],
  // Après l'électrotechnique : « Informationstechnik » y reste.
  ["informatics", /informatik|informatique|computer|software|data science/i],
  ["physics", /physik|physics|physique|mathe|math/i],
];

export function categoryForProgram(program: string | null | undefined): BackgroundCategory {
  const p = (program ?? "").trim();
  if (!p) return "general";
  return RULES.find(([, re]) => re.test(p))?.[0] ?? "general";
}

/** Liste de rotation : images de la catégorie intercalées avec le fond général. */
export function backgroundsFor(category: BackgroundCategory): string[] {
  const own = CATEGORY_IMAGES[category];
  if (own.length === 0) return GENERAL;
  const rest = GENERAL.filter((g) => !own.includes(g));
  const out: string[] = [];
  for (let i = 0; i < Math.max(own.length, rest.length); i++) {
    if (i < own.length) out.push(own[i]);
    if (i < rest.length) out.push(rest[i]);
  }
  return out;
}
