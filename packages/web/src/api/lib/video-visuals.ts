/**
 * « Als Video erklären » — les directives visuelles d'une scène.
 *
 * Le modèle ne dessine jamais. Il CHOISIT, dans une liste fermée, ce que la
 * scène montre ; c'est du code qui dessine (la composition, avec les vrais
 * composants du Hörsaal et le vrai solveur). Partagé par le serveur (schéma
 * du script, contrôle) et par le navigateur (composition).
 *
 * Module pur, testé dans tests/video-visuals.test.ts.
 */

export const VISUALS = ["text", "highlight", "flowchart", "formula", "beam", "loads", "solver_plot", "chart", "real_image"] as const;
/**
 * La bibliothèque de visuels, pour toutes les filières :
 *
 *   text         une feuille au tableau avec les points de la scène
 *   highlight    la phrase du cours, avec ses mots-clés surlignés en jaune   (droit, philosophie)
 *   flowchart    un enchaînement d'étapes qui se construit                    (droit, médecine, logique)
 *   formula      la formule en grand, qui s'écrit ligne par ligne             (maths, physique, économie)
 *   beam         la poutre se dessine (appuis, portée)                        (mécanique)
 *   loads        les charges arrivent flèche après flèche, la poutre fléchit  (mécanique)
 *   solver_plot  le vrai schéma du solveur : système, Q(x), M(x)              (mécanique)
 *   chart        une courbe de principe, sans valeurs (offre et demande)      (économie)
 *   real_image   une image d'illustration (pont, tribunal, cœur…), en fondu   (toutes)
 */
export type Visual = (typeof VISUALS)[number];

/** Les visuels qui montrent la même poutre : elle reste à l'écran de l'un à l'autre. */
export const BEAM_VISUALS: readonly Visual[] = ["beam", "loads"];

/**
 * Les images du monde réel, par mot-clé. Ce sont les fonds de l'app
 * (packages/web/public/backgrounds) : aucune image n'est chargée depuis un
 * service extérieur.
 */
export const REAL_IMAGES = {
  // Ingénierie
  bridge: "/backgrounds/civil/civil-u01.webp",
  truss_bridge: "/backgrounds/civil/civil-u05.webp",
  construction_site: "/backgrounds/civil/civil-u02.webp",
  highway: "/backgrounds/civil/civil-u07.webp",
  building: "/backgrounds/architecture/architecture-u01.webp",
  aircraft: "/backgrounds/aerospace/aerospace-u04.webp",
  machine: "/backgrounds/mechanical/mechanical-u01.webp",
  electronics: "/backgrounds/electrical/electrical-u03.webp",
  computer: "/backgrounds/informatics/informatics-u02.webp",
  // Droit
  justice: "/backgrounds/law/law-u02.webp",
  courthouse: "/backgrounds/law/law-u03.webp",
  gavel: "/backgrounds/law/law-u04.webp",
  law_library: "/backgrounds/law/law-u01.webp",
  // Médecine et biologie
  heart: "/backgrounds/medicine/medicine-u06.webp",
  operating_room: "/backgrounds/medicine/medicine-u02.webp",
  brain_scan: "/backgrounds/medicine/medicine-u03.webp",
  skeleton: "/backgrounds/medicine/medicine-u07.webp",
  neuron: "/backgrounds/medicine/medicine-u09.webp",
  dna: "/backgrounds/medicine/medicine-u01.webp",
  microscope: "/backgrounds/medicine/medicine-u05.webp",
  pharmacy: "/backgrounds/medicine/medicine-u08.webp",
  cell: "/backgrounds/biology/biology-u02.webp",
  // Économie
  stock_market: "/backgrounds/economics/economics-u01.webp",
  stock_exchange: "/backgrounds/economics/economics-u03.webp",
  coins: "/backgrounds/economics/economics-u05.webp",
  city: "/backgrounds/economics/economics-u02.webp",
} as const;
export type RealImageKey = keyof typeof REAL_IMAGES;
export const REAL_IMAGE_KEYS = Object.keys(REAL_IMAGES) as RealImageKey[];

/** Les courbes de principe : des figures de manuel, tracées sans aucune valeur. */
export const CHARTS = ["supply_demand"] as const;
export type ChartKey = (typeof CHARTS)[number];
export const isChartKey = (v: unknown): v is ChartKey => typeof v === "string" && (CHARTS as readonly string[]).includes(v);

export const MAX_FLOW_STEPS = 6;
export const MAX_KEYWORDS = 5;

export const isVisual = (v: unknown): v is Visual => typeof v === "string" && (VISUALS as readonly string[]).includes(v);
export const isRealImageKey = (v: unknown): v is RealImageKey => typeof v === "string" && v in REAL_IMAGES;

/**
 * Ce que la scène montrera vraiment, une fois les garde-fous appliqués :
 *  - le schéma du solveur exige un calcul de poutre : sans lui, pas de courbe inventée ;
 *  - une image exige un mot-clé connu ;
 *  - une formule exige… une formule.
 * Dans le doute, la scène retombe sur la feuille de texte.
 */
export interface VisualInput {
  visual?: unknown;
  image?: unknown;
  chart?: unknown;
  formula?: string;
  quote?: string;
  steps?: string[];
  keywords?: string[];
}

export interface ResolvedVisual {
  visual: Visual;
  image: RealImageKey | null;
  chart: ChartKey | null;
  steps: string[];
  keywords: string[];
}

export function resolveVisual(scene: VisualInput, has: { beam: boolean }): ResolvedVisual {
  const wanted: Visual = isVisual(scene.visual) ? scene.visual : "text";
  const plain: ResolvedVisual = { visual: "text", image: null, chart: null, steps: [], keywords: [] };
  switch (wanted) {
    case "real_image":
      return isRealImageKey(scene.image) ? { ...plain, visual: "real_image", image: scene.image } : plain;
    case "solver_plot":
      return has.beam ? { ...plain, visual: "solver_plot" } : plain;
    case "formula":
      return scene.formula?.trim() ? { ...plain, visual: "formula" } : plain;
    case "chart":
      return isChartKey(scene.chart) ? { ...plain, visual: "chart", chart: scene.chart } : plain;
    case "flowchart": {
      const steps = (scene.steps ?? []).map((x) => x.trim()).filter(Boolean).slice(0, MAX_FLOW_STEPS);
      return steps.length >= 2 ? { ...plain, visual: "flowchart", steps } : plain;
    }
    case "highlight": {
      // On surligne la phrase du cours : il faut qu'il y en ait une, et que les mots-clés en fassent partie.
      const quote = scene.quote?.trim() ?? "";
      if (!quote) return plain;
      const lower = quote.toLowerCase();
      const keywords = (scene.keywords ?? []).map((k) => k.trim()).filter((k) => k.length > 1 && lower.includes(k.toLowerCase())).slice(0, MAX_KEYWORDS);
      return { ...plain, visual: "highlight", keywords };
    }
    default:
      return { ...plain, visual: wanted };
  }
}
