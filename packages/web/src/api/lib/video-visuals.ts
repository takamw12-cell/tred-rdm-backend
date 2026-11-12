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

export const VISUALS = ["text", "highlight", "flowchart", "formula", "beam", "loads", "solver_plot", "chart", "real_image", "question", "recap"] as const;
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
 *   question     la question mystère qui ouvre la leçon, tapée en grand       (toutes)
 *   recap        la liste à retenir, cochée point par point                   (toutes)
 */
export type Visual = (typeof VISUALS)[number];

/**
 * Les `visual_cues` : ce que le script DEMANDE à l'écran, sous forme d'ordres
 * (« dessine le diagramme », « écris l'équation », « montre la poutre »).
 * C'est le vocabulaire que le modèle écrit dans le JSON ; chaque ordre
 * correspond à un visuel de la bibliothèque, dessiné et animé par du code.
 */
export const CUE_VISUAL = {
  ask_question: "question",
  write_points: "text",
  highlight_text: "highlight",
  draw_flowchart: "flowchart",
  write_equation: "formula",
  show_beam: "beam",
  apply_loads: "loads",
  plot_curves: "solver_plot",
  draw_chart: "chart",
  show_image: "real_image",
  check_recap: "recap",
} as const satisfies Record<string, Visual>;
export type VisualCue = keyof typeof CUE_VISUAL;
export const VISUAL_CUES = Object.keys(CUE_VISUAL) as [VisualCue, ...VisualCue[]];
export const isVisualCue = (v: unknown): v is VisualCue => typeof v === "string" && v in CUE_VISUAL;

/** L'ordre qui correspond à un visuel (pour le JSON de la vidéo). */
export function cueOf(visual: Visual): VisualCue {
  return (Object.keys(CUE_VISUAL) as VisualCue[]).find((cue) => CUE_VISUAL[cue] === visual)!;
}

/** Le visuel demandé par une liste d'ordres : le premier ordre connu. */
export function visualOfCues(cues: unknown): Visual | undefined {
  if (!Array.isArray(cues)) return undefined;
  const first = cues.find(isVisualCue);
  return first ? CUE_VISUAL[first] : undefined;
}

/**
 * La structure d'une mini-leçon, dans l'ordre :
 *   hook     la question mystère qui donne envie de savoir
 *   step     l'explication, pas à pas
 *   example  l'exemple concret
 *   recap    le récapitulatif : ce qu'il faut retenir
 */
export const STAGES = ["hook", "step", "example", "recap"] as const;
export type Stage = (typeof STAGES)[number];
export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);

/**
 * Remet les scènes VALIDÉES dans la structure de la leçon. Le modèle propose
 * une étape par scène, mais des scènes peuvent avoir été supprimées par le
 * contrôle : on ne se fie donc qu'à la position.
 *   - la première scène ouvre (hook), la dernière conclut (recap) ;
 *   - entre les deux : « example » si la scène l'annonce ou si c'est un
 *     exemple du quotidien, sinon « step ».
 */
export function lessonStages(scenes: { stage?: unknown; sourceKind?: string }[]): Stage[] {
  const n = scenes.length;
  return scenes.map((sc, i) => {
    if (i === 0) return "hook";
    if (i === n - 1) return "recap";
    return sc.stage === "example" || sc.sourceKind === "analogy" ? "example" : "step";
  });
}

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
  /** Les ordres du script ; lus si `visual` est absent. */
  visual_cues?: unknown;
  heading?: string;
  bullets?: string[];
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
  /** L'ordre réellement exécuté à l'écran, garde-fous appliqués. */
  visual_cues: VisualCue[];
}

export function resolveVisual(scene: VisualInput, has: { beam: boolean }): ResolvedVisual {
  const r = resolveVisualKind(scene, has);
  return { ...r, visual_cues: [cueOf(r.visual)] };
}

function resolveVisualKind(scene: VisualInput, has: { beam: boolean }): Omit<ResolvedVisual, "visual_cues"> {
  let wanted: Visual = isVisual(scene.visual) ? scene.visual : (visualOfCues(scene.visual_cues) ?? "text");
  // « Montre la poutre » + « applique les charges » dans la même scène : la
  // poutre se dessine, puis les charges arrivent (vu au premier essai réel).
  if (wanted === "beam" && Array.isArray(scene.visual_cues) && scene.visual_cues.includes("apply_loads")) wanted = "loads";
  const plain: Omit<ResolvedVisual, "visual_cues"> = { visual: "text", image: null, chart: null, steps: [], keywords: [] };
  switch (wanted) {
    // La question mystère est le titre de la scène : sans titre, pas de question.
    case "question":
      return scene.heading?.trim() ? { ...plain, visual: "question" } : plain;
    // Une liste à cocher a besoin d'au moins un point.
    case "recap":
      return (scene.bullets ?? []).some((b) => b.trim()) ? { ...plain, visual: "recap" } : plain;
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
