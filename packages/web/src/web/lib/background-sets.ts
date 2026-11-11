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
import MANIFEST from "../data/background-manifest.json";
import UNIVERSAL from "../data/universal-backgrounds.json";

/**
 * Images réellement présentes (paysage + variante portrait), écrites par
 * scripts/generate-backgrounds.mjs. Une image PRÉVUE mais pas encore générée
 * est simplement ignorée : jamais de fond vide.
 */
const PRESENT = new Set<string>(MANIFEST as string[]);
const present = (list: string[]) => list.filter((src) => PRESENT.has(src));

export type BackgroundCategory =
  | "general"
  | "aerospace"
  | "mechatronics"
  | "robotics"
  | "mechanical"
  | "electrical"
  | "civil"
  | "architecture"
  | "industrial"
  | "chemical"
  | "environmental"
  | "biomedical"
  | "informatics"
  | "datascience"
  | "mathematics"
  | "physics"
  // Hors ingénierie (2026-11-09) : TRED couvre toutes les filières.
  | "medicine"
  | "law"
  | "economics"
  // Refonte du 2026-11-11 : toutes les filières de l'université.
  | "biology"
  | "psychology"
  | "philosophy"
  | "languages"
  | "history";

const G = (n: number) => `/backgrounds/general/bg-0${n}.webp`;
const F = (folder: string, ns: number[]) =>
  ns.map((n) => `/backgrounds/${folder}/${folder}-0${n}.webp`);
export const GENERAL = [G(1), G(2), G(3), G(4), G(5), G(6), G(7), G(8)];

/**
 * Images propres à chaque catégorie (prévues). Photos Unsplash (CREDITS.md)
 * et, depuis nov. 2026, images générées (Replicate, Flux 1.1 Pro) pour les
 * filières qui en manquaient. Seules celles du manifeste sont servies.
 */
const PLANNED: Record<BackgroundCategory, string[]> = {
  general: [],
  // La fusée d'abord : c'est la première image que voit un étudiant LRT.
  aerospace: F("aerospace", [2, 1, 3, 4]),
  mechatronics: F("mechatronics", [1, 2, 3]),
  robotics: F("robotics", [1, 2, 3, 4]),
  electrical: F("electrical", [1, 2, 3, 4]), // pylônes, éclair, circuit imprimé
  mechanical: [...F("mechanical", [1, 2, 3, 4]), G(4)],
  // Les ponts du fond général sont, eux aussi, du génie civil.
  civil: [...F("civil", [1, 2, 3, 4]), G(3), G(6), G(7), G(8)],
  architecture: F("architecture", [1, 2, 3, 4]),
  industrial: F("industrial", [1, 2, 3, 4]),
  chemical: F("chemical", [1, 2, 3, 4]),
  environmental: F("environmental", [1, 2, 3, 4]),
  biomedical: F("biomedical", [1, 2, 3, 4]),
  informatics: F("informatics", [1, 2, 3, 4]), // code à l'écran, data center
  datascience: F("datascience", [1, 2, 3, 4]),
  mathematics: F("mathematics", [1, 2, 3, 4]),
  physics: F("physics", [1, 2, 3, 4]), // nébuleuse, Voie lactée, tableau, accélérateur
  medicine: F("medicine", [1, 2, 3, 4, 5]), // ADN, bloc opératoire, blouse, IRM, microscope
  law: F("law", [1, 2, 3, 4, 5]), // bibliothèque, Justitia, palais de justice, marteau, salle de lecture
  economics: F("economics", [1, 2, 3, 4, 5]), // graphiques, quartier d'affaires, salle des marchés
  // Pas de photo d'avant la refonte : uniquement les fonds universels.
  biology: [],
  psychology: [],
  philosophy: [],
  languages: [],
  history: [],
};

/**
 * Fonds « universels » (refonte du 2026-11-11) : 10 images par filière,
 * FLUX 1.1 Pro Ultra, style commun sombre aux reflets dorés, écrits par
 * packages/web/scripts/generate-universal-backgrounds.mjs. Dès qu'une filière en a au
 * moins 3, elle tourne UNIQUEMENT sur eux : on ne mélange pas leur
 * étalonnage doré avec les anciennes photos bleu nuit.
 */
const UNIVERSAL_SETS = UNIVERSAL as Partial<Record<BackgroundCategory, string[]>>;
export const UNIVERSAL_MIN = 3;

/**
 * Images VOISINES empruntées tant qu'une filière n'a pas encore ses trois
 * images : un roboticien voit des robots, pas des ponts.
 */
const BORROWED: Partial<Record<BackgroundCategory, string[]>> = {
  robotics: F("mechatronics", [1, 2, 3]),
  datascience: F("informatics", [1, 2, 3]),
  mathematics: [...F("physics", [3, 1, 2])],
  architecture: [...F("civil", [1]), G(5), G(1), G(4)],
  environmental: F("electrical", [1, 2]),
  biomedical: F("mechatronics", [1, 3]),
  mechanical: F("mechatronics", [2]),
};

/**
 * Filières dont les images sont commandées mais pas encore là (génération
 * Replicate bloquée faute de crédit le 2026-11-09 : relancer
 * `bun --env-file=.env scripts/generate-backgrounds.mjs medicine law economics`).
 * En attendant : le fond général, jamais un fond vide. Les tests vérifient que
 * cette liste se vide dès que les images arrivent.
 */
export const AWAITING_IMAGES: readonly BackgroundCategory[] = [
  "medicine",
  "law",
  "economics",
  // Refonte du 2026-11-11 : aucune photo d'avant, en attente de
  // `bun --env-file=.env packages/web/scripts/generate-universal-backgrounds.mjs --all`.
  "biology",
  "psychology",
  "philosophy",
  "languages",
  "history",
];

export const CATEGORY_IMAGES: Record<BackgroundCategory, string[]> = Object.fromEntries(
  (Object.keys(PLANNED) as BackgroundCategory[]).map((c) => {
    const universal = UNIVERSAL_SETS[c] ?? [];
    if (universal.length >= UNIVERSAL_MIN) return [c, universal];
    const own = present(PLANNED[c]);
    const list = own.length >= 3 ? own : [...new Set([...own, ...present(BORROWED[c] ?? [])])];
    return [c, list];
  }),
) as Record<BackgroundCategory, string[]>;

/**
 * Reconnaît la filière à partir du texte libre saisi par l'étudiant
 * (profil ou semestre). L'ORDRE compte : la règle la plus spécifique d'abord
 * (« Robotik » avant « Mechatronik », « Data Science » avant « Informatik »,
 * « Architektur » avant le génie civil, « Mathematik/Physik » avant
 * « Physik »).
 */
const RULES: [BackgroundCategory, RegExp][] = [
  ["aerospace", /luft|raumfahrt|aero|aviation|avion|flug|space|spatial/i],
  ["biomedical", /biomedizin|biomedic|biomédical|medizintechnik|medical engineering/i],
  ["robotics", /robot|autonome systeme|autonomous/i],
  ["mechatronics", /mechatron/i],
  ["datascience", /data science|datenwissenschaft|\bki\b|künstliche intelligenz|machine learning|\bai\b|\bia\b|intelligence artificielle/i],
  ["industrial", /wirtschaftsingenieur|industrial engineering|génie industriel|ingeniería industrial/i],
  ["chemical", /chemie|chemical|chimi|verfahrenstechnik|process engineering|procédés/i],
  ["environmental", /umwelt|environment|environnement|ambiental|erneuerbare|renewable/i],
  ["electrical", /elektro|electr|informationstechnik|nachrichtentechnik/i],
  ["architecture", /architekt|architect|arquitect|architettura/i],
  ["civil", /bauingenieur|bauwesen|\bbau\b|civil|génie civil/i],
  ["mechanical", /maschinenbau|mechanical|mécanique|mechanik|produktion/i],
  // Après l'électrotechnique : « Informationstechnik » y reste.
  ["informatics", /informatik|informatique|computer|software/i],
  // Après la biomédicale (« Biomedizin », « Medizintechnik » y restent).
  ["medicine", /medizin|medicine|médecine|medicina|pharma/i],
  ["law", /rechtswiss|\bjura\b|jurisprudenz|\blaw\b|\bdroit\b|derecho|giurisprudenza|direito/i],
  // Après le génie industriel (« Wirtschaftsingenieurwesen ») et l'informatique
  // (« Wirtschaftsinformatik ») : seules les sciences économiques arrivent ici.
  ["economics", /wirtschaftswiss|betriebswirt|volkswirt|\bbwl\b|\bvwl\b|economics|économie|economía|economia|business|finanz|finance/i],
  // Après la biomédicale et la chimie (« Biochemie » y reste).
  ["biology", /biolog|bioscience|biowissenschaft|life science|sciences de la vie/i],
  ["psychology", /psycholog|psychologie|psicolog/i],
  ["philosophy", /philosoph|filosof/i],
  ["history", /geschicht|histor|histoire|storia/i],
  [
    "languages",
    /sprach|linguist|germanist|anglist|romanist|slavist|übersetz|dolmetsch|translat|traduc|philolog|lettres|langues|languages|literatur|literature/i,
  ],
  ["mathematics", /mathe|math/i],
  ["physics", /physik|physics|physique|física|fisica/i],
];

export function categoryForProgram(program: string | null | undefined): BackgroundCategory {
  const p = (program ?? "").trim();
  if (!p) return "general";
  return RULES.find(([, re]) => re.test(p))?.[0] ?? "general";
}

/**
 * Liste de rotation.
 * - Trois images propres ou plus : la filière tourne SUR ELLE-MÊME — un
 *   étudiant en génie biomédical ne voit pas défiler des ponts.
 * - Moins de trois : ses images intercalées avec le fond général, sinon la
 *   rotation resterait figée sur une ou deux photos.
 */
export function backgroundsFor(category: BackgroundCategory): string[] {
  const own = CATEGORY_IMAGES[category];
  if (own.length === 0) return GENERAL;
  if (own.length >= 3) return own;
  const rest = GENERAL.filter((g) => !own.includes(g));
  const out: string[] = [];
  for (let i = 0; i < Math.max(own.length, rest.length); i++) {
    if (i < own.length) out.push(own[i]);
    if (i < rest.length) out.push(rest[i]);
  }
  return out;
}

/**
 * Variante PORTRAIT (mobile) d'une image : même nom suivi de « -p ».
 * Chaque image en a une (recadrage centré 1080×1920, plus légère) : un
 * téléphone en portrait ne télécharge pas 1920 px de large pour en afficher
 * le tiers.
 */
export function portraitOf(src: string): string {
  return src.replace(/\.webp$/, "-p.webp");
}

/**
 * Ordre de rotation ALÉATOIRE (Fisher-Yates) : l'étudiant ne revoit jamais
 * la même séquence. `avoidFirst` (la photo affichée) ne revient pas en tête
 * d'un nouveau tour : jamais deux fois la même image de suite.
 * `random` injectable pour les tests.
 */
export function shuffled<T>(list: readonly T[], avoidFirst?: T, random: () => number = Math.random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out[0] === avoidFirst) [out[0], out[out.length - 1]] = [out[out.length - 1], out[0]];
  return out;
}
