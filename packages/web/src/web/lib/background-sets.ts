/**
 * Fonds du dashboard selon la filière (V2).
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
  | "civil";

const G = (n: number) => `/backgrounds/general/bg-0${n}.webp`;
export const GENERAL = [G(1), G(2), G(3), G(4), G(5), G(6), G(7), G(8)];

/** Images propres à chaque catégorie. Vide = fond général uniquement. */
export const CATEGORY_IMAGES: Record<BackgroundCategory, string[]> = {
  general: [],
  aerospace: [1, 2, 3].map((n) => `/backgrounds/aerospace/aerospace-0${n}.webp`),
  mechatronics: [1, 2, 3].map((n) => `/backgrounds/mechatronics/mechatronics-0${n}.webp`),
  // Pas encore d'images dédiées : on privilégie les fonds généraux qui leur
  // parlent (ossature acier ; ponts et béton), en attendant leurs dossiers.
  mechanical: [G(4), G(2)],
  electrical: [],
  civil: [G(3), G(6), G(7), G(8), G(1), G(5)],
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
