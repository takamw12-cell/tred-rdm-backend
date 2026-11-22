import { z } from "zod";
import iconLibrary from "../video-engine/icons.json";
import { extractNumbers, type VoiceWord } from "./video-script";

/**
 * « Als Video erklären », style dessiné — le storyboard.
 *
 * Module pur (aucune base, aucun réseau, aucun processus), testé dans
 * tests/video-storyboard.test.ts.
 *
 * Le script validé (lib/video-script.ts) dit QUOI expliquer, scène par scène.
 * Ce fichier en fait ce que le moteur de dessin (api/video-engine/render_video.py)
 * attend : une liste de tracés sur une toile de 1600 × 900, chacun avec
 * l'instant où il commence — l'instant où la voix prononce le mot qui le
 * concerne.
 *
 * ── Qui place les traits ──────────────────────────────────────────────────
 * Deux sources, dans cet ordre :
 *   1. le CODE, pour tout ce dont la forme est connue : un enchaînement
 *      d'étapes (cases et flèches), une formule, des points à retenir. Un
 *      schéma mis en page par du code n'est jamais de travers ;
 *   2. le MODÈLE, pour le croquis propre à la question (`sketch`) : des formes
 *      simples sur une grille, bornées et contrôlées ici avant tout dessin.
 *
 * ── Zéro invention, ici aussi ─────────────────────────────────────────────
 * Une étiquette ou un symbole du croquis ne peut porter que des nombres
 * autorisés (ceux du cours, de la question, des solveurs) : sinon le tracé est
 * retiré. La formule affichée est celle de la scène, déjà contrôlée — le
 * croquis ne peut pas en écrire une autre.
 */

export const DRAW_STYLES = ["whiteboard", "cinematic"] as const;
export type DrawStyle = (typeof DRAW_STYLES)[number];

export const CANVAS = { w: 1600, h: 900 } as const;
/** La zone du croquis : le titre de la scène s'écrit au-dessus. */
export const SKETCH_AREA = { x0: 80, y0: 200, x1: 1520, y1: 850 } as const;
export const MAX_SKETCH_ELEMENTS = 14;
const MAX_LABEL = 28;
const MAX_SYMBOL = 40;
/** Fin de scène : les tracés s'effacent juste avant que la suivante commence. */
const CLEAR_BEFORE_END = 0.5;
const MIN_DRAW = 0.15;

/**
 * La bibliothèque locale d'icônes animées (Lucide, licence ISC ; fabriquée par
 * api/video-engine/build_icons.mjs). Le modèle choisit un NOM dans cette liste ;
 * le mouvement (tourne, bat, oscille…) appartient à l'icône.
 */
export const ICON_NAMES: readonly string[] = Object.keys(iconLibrary.icons);
const ICON_SET: ReadonlySet<string> = new Set(ICON_NAMES);

const COLORS = ["ink", "accent", "red", "blue", "green", "gray"] as const;
export type DrawColor = (typeof COLORS)[number];

const TEX_ONLY = /^[A-Za-z0-9\s\\{}^_+\-*/=()[\]|.,!<>:;'&]+$/;

export const sketchElementSchema = z.object({
  kind: z
    .enum(["line", "arrow", "polyline", "curve", "circle", "ellipse", "rect", "label", "symbol", "icon"])
    .describe("icon : une icône animée de la bibliothèque, un point (le centre), son nom dans text, r = demi-taille (60 à 160). line / arrow : deux points. polyline / curve : 2 à 12 points (curve = courbe lisse). circle / ellipse : un point (le centre) + r (et ry). rect : deux points (coin haut-gauche, coin bas-droit). label : 1 à 3 mots, un point (le centre). symbol : un symbole court en LaTeX (F_1, \\alpha), un point (le centre)."),
  points: z.array(z.array(z.number())).describe("Les points [x, y] sur la toile 1600 × 900 (origine en haut à gauche, y vers le bas)."),
  r: z.number().default(0).describe("Rayon du cercle, ou demi-largeur de l'ellipse. 0 sinon."),
  ry: z.number().default(0).describe("Demi-hauteur de l'ellipse. 0 sinon."),
  text: z.string().default("").describe("label : le texte (28 caractères au plus). symbol : le LaTeX sans dollars. icon : le nom exact de l'icône. Chaîne vide sinon."),
  color: z.enum(COLORS).default("ink").describe("ink (trait normal), accent (ce qu'il faut regarder), red (forces, charges), blue, green, gray (repères)."),
  fill: z.boolean().default(false).describe("Vrai pour hachurer / teinter une forme fermée."),
  closed: z.boolean().default(false).describe("polyline / curve : vrai pour refermer la forme."),
  word: z.number().int().default(0).describe("Le numéro du mot de \"voiceover\" (0 = le premier) au moment où ce tracé commence : il arrive quand la voix en parle."),
});
export type SketchElement = z.infer<typeof sketchElementSchema>;

/** Le champ ajouté à chaque scène du script quand la vidéo est dessinée. */
export const sketchField = z.array(sketchElementSchema).default([]).describe(`Le croquis de la scène : 0 à ${MAX_SKETCH_ELEMENTS} tracés. Tableau vide si la scène a déjà draw_flowchart, write_equation ou check_recap.`);

/** Ce que le prompt du script reçoit en plus quand la vidéo est dessinée. */
export function sketchPromptBlock(style: DrawStyle, languageCode: string): string {
  const latin = ["de", "en", "fr", "es", "it", "pt"].includes(languageCode);
  return `LE CROQUIS ("sketch") — CETTE VIDÉO EST DESSINÉE
La vidéo est un ${style === "whiteboard" ? "tableau blanc où une main trace" : "tableau sombre où une pointe lumineuse trace"} le schéma PENDANT que la voix parle. Rien n'apparaît d'un coup : chaque trait se dessine.
Dans une vidéo dessinée, quatre ordres seulement existent : "ask_question" (la scène "hook"), "draw_flowchart", "write_equation" (une scène au plus) et "check_recap" (la scène "recap"). "show_image", "highlight_text", "draw_chart", "show_beam", "apply_loads", "plot_curves" et "write_code" n'existent PAS ici : à leur place, mets "write_points" dans "visual_cues" et DESSINE dans "sketch". Toute scène "step" ou "example" qui n'est ni un "draw_flowchart" ni le "write_equation" porte donc un "sketch" de 5 à ${MAX_SKETCH_ELEMENTS} tracés qui construisent UN schéma de principe, dans l'ordre où la voix les décrit. Une vidéo où l'on ne voit que du texte est ratée.
- La toile fait 1600 × 900, origine en haut à gauche, y vers le bas. Le titre s'écrit tout seul en haut : ton croquis tient dans x de ${SKETCH_AREA.x0} à ${SKETCH_AREA.x1} et y de ${SKETCH_AREA.y0} à ${SKETCH_AREA.y1}. Travaille sur une grille de 50 : des coordonnées rondes, des traits alignés, de grandes formes bien espacées.
- Des formes simples seulement : traits, flèches, cases, cercles, courbes d'allure, axes. Pas d'objet réaliste, pas d'anatomie, pas de perspective.
- "word" : le numéro du mot de "voiceover" (0 = le premier) où le tracé commence. Les valeurs croissent d'un tracé au suivant : la main suit la voix.
- "label" : 1 à 3 mots, jamais une phrase — c'est la voix qui explique. "symbol" : un symbole court en LaTeX (F_1, \\alpha, M_b).${latin ? "" : " Dans cette langue, n'écris AUCUN mot en \"label\" : seulement des symboles et des lettres latines (F, x, A)."}
- "icon" : une ICÔNE ANIMÉE qui apparaît quand la voix nomme la chose, puis bouge toute seule (l'engrenage tourne, le cerveau bat, la balance oscille). Mets-en une ou deux par croquis quand un objet ou une idée de la voix a son icône — jamais pour décorer ; une vidéo sur un objet concret (outil, machine, organe, argent, loi) en montre au moins une. "text" est le nom EXACT, pris dans cette liste et nulle part ailleurs : ${ICON_NAMES.join(", ")}. Une icône inconnue est retirée. Laisse-lui de la place : rien d'autre dans un rayon de 150 autour de son centre.
- Aucun nombre qui ne figure pas dans les sources ou la question : un tracé qui en porte un est retiré.
- Une scène "draw_flowchart", "write_equation" ou "check_recap" est tracée par TRED lui-même : laisse son "sketch" vide.
- De la place : un objet principal fait au moins 300 de large ; un cercle a un rayon d'au moins 50. Pas de cadre autour du croquis. Une étiquette se pose À CÔTÉ de ce qu'elle nomme (60 au-dessus ou au-dessous d'un trait, jamais dessus), et deux étiquettes ne se touchent jamais : au moins 220 d'écart en x ou 90 en y. Pour comparer deux cas (court / long, avant / après), dessine-les l'un sous l'autre ou côte à côte, jamais superposés.
- Pense le croquis comme un professeur au tableau : d'abord l'objet, puis ce qui agit sur lui, puis ce qu'il faut remarquer (en "accent").`;
}

/* ── Contrôle du croquis ───────────────────────────────────────────────── */

export interface DrawElement {
  kind: "line" | "arrow" | "polyline" | "curve" | "circle" | "ellipse" | "rect" | "text" | "formula" | "icon";
  /** Icône : son nom dans la bibliothèque. */
  name?: string;
  color: DrawColor;
  fill?: boolean;
  closed?: boolean;
  weight?: number;
  from?: [number, number];
  to?: [number, number];
  points?: [number, number][];
  center?: [number, number];
  corner?: [number, number];
  r?: number;
  rx?: number;
  ry?: number;
  w?: number;
  h?: number;
  text?: string;
  tex?: string;
  size?: number;
}

/** Un tracé et le moment où il commence, en part de la scène (0 = début, 1 = fin). */
export interface PlacedElement {
  el: DrawElement;
  /** Numéro du mot de la scène où le tracé commence ; `frac` s'il n'y a pas de mot précis. */
  word?: number;
  frac?: number;
}

const isStructural = (n: string) => /^\d$/.test(n);
const round = (v: number) => Math.round(v * 10) / 10;

function pt(p: unknown): [number, number] | null {
  if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const [x, y] = p as [number, number];
  // Un point légèrement hors de la zone est ramené dedans ; loin dehors, le tracé est faux.
  if (x < -40 || x > CANVAS.w + 40 || y < 60 || y > CANVAS.h + 40) return null;
  return [round(Math.min(CANVAS.w - 20, Math.max(20, x))), round(Math.min(CANVAS.h - 20, Math.max(150, y)))];
}

export type SketchDrop = "bad_points" | "bad_size" | "empty_text" | "bad_tex" | "number_not_in_sources" | "unknown_icon";

/**
 * Le croquis du modèle, tel qu'il a le droit d'être dessiné. Chaque tracé est
 * vérifié seul : un tracé refusé n'emporte pas les autres.
 */
export function cleanSketch(raw: SketchElement[] | undefined, allowed: ReadonlySet<string>): { placed: PlacedElement[]; dropped: SketchDrop[] } {
  const placed: PlacedElement[] = [];
  const dropped: SketchDrop[] = [];
  for (const el of (raw ?? []).slice(0, MAX_SKETCH_ELEMENTS)) {
    const pts = (el.points ?? []).map(pt);
    if (pts.length === 0 || pts.some((p) => p === null)) {
      dropped.push("bad_points");
      continue;
    }
    const points = pts as [number, number][];
    const base = { color: el.color ?? "ink" } as const;
    const word = Math.max(0, Math.floor(el.word ?? 0));
    let out: DrawElement | null = null;
    if (el.kind === "line" || el.kind === "arrow") {
      if (points.length !== 2 || Math.hypot(points[1]![0] - points[0]![0], points[1]![1] - points[0]![1]) < 12) dropped.push("bad_points");
      else out = { ...base, kind: el.kind, from: points[0]!, to: points[1]! };
    } else if (el.kind === "polyline" || el.kind === "curve") {
      const least = el.kind === "curve" ? 3 : 2;
      if (points.length < least || points.length > 12) dropped.push("bad_points");
      else out = { ...base, kind: el.kind, points, closed: Boolean(el.closed), fill: Boolean(el.fill) && Boolean(el.closed) };
    } else if (el.kind === "circle") {
      if (!(el.r >= 8 && el.r <= 400)) dropped.push("bad_size");
      else out = { ...base, kind: "circle", center: points[0]!, r: round(el.r), fill: Boolean(el.fill) };
    } else if (el.kind === "ellipse") {
      if (!(el.r >= 8 && el.r <= 700 && el.ry >= 8 && el.ry <= 400)) dropped.push("bad_size");
      else out = { ...base, kind: "ellipse", center: points[0]!, rx: round(el.r), ry: round(el.ry), fill: Boolean(el.fill) };
    } else if (el.kind === "rect") {
      const [a, b] = [points[0]!, points[1]];
      const w = b ? Math.abs(b[0] - a[0]) : 0;
      const h = b ? Math.abs(b[1] - a[1]) : 0;
      if (!b || w < 12 || h < 12) dropped.push("bad_points");
      else out = { ...base, kind: "rect", corner: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], w: round(w), h: round(h), fill: Boolean(el.fill) };
    } else if (el.kind === "icon") {
      const name = (el.text ?? "").trim().toLowerCase();
      if (!ICON_SET.has(name)) dropped.push("unknown_icon");
      else out = { ...base, kind: "icon", name, center: points[0]!, size: Math.round(Math.min(320, Math.max(120, (el.r || 100) * 2))) };
    } else {
      const text = (el.text ?? "").replace(/\s+/g, " ").trim();
      const invented = extractNumbers(text).find((n) => !isStructural(n) && !allowed.has(n));
      if (!text) dropped.push("empty_text");
      else if (invented !== undefined) dropped.push("number_not_in_sources");
      else if (el.kind === "symbol") {
        const tex = text.replace(/^\$+|\$+$/g, "").trim();
        if (!tex || tex.length > MAX_SYMBOL || !TEX_ONLY.test(tex)) dropped.push("bad_tex");
        else out = { ...base, kind: "formula", tex, center: points[0]!, size: 52 };
      } else {
        out = { ...base, kind: "text", text: text.slice(0, MAX_LABEL), center: points[0]!, size: fitSize(text.slice(0, MAX_LABEL), 520, 44) };
      }
    }
    if (out) placed.push({ el: out, word });
  }
  separateLabels(placed);
  return { placed, dropped };
}

/** La boîte qu'occupe une étiquette, une formule ou une icône (estimation prudente). */
function labelBox(el: DrawElement): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!el.center) return null;
  const [cx, cy] = el.center;
  if (el.kind === "icon") return { x0: cx - el.size! / 2, y0: cy - el.size! / 2, x1: cx + el.size! / 2, y1: cy + el.size! / 2 };
  if (el.kind !== "text" && el.kind !== "formula") return null;
  const chars = el.kind === "text" ? [...(el.text ?? "")].length : Math.max(2, (el.tex ?? "").replace(/\\[a-zA-Z]+|[{}_^]/g, "").length);
  const w = Math.max(40, chars * el.size! * 0.62);
  const h = el.size! * 1.3;
  return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
}

/**
 * Deux étiquettes posées l'une sur l'autre sont illisibles — et le modèle en
 * pose. La seconde descend (ou monte, en bas de la toile) jusqu'à être libre.
 * Les formes, elles, ne bougent pas : c'est le schéma.
 */
export function separateLabels(placed: PlacedElement[]): void {
  const taken: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const hits = (b: { x0: number; y0: number; x1: number; y1: number }) => taken.some((t) => b.x0 < t.x1 + 12 && b.x1 > t.x0 - 12 && b.y0 < t.y1 + 6 && b.y1 > t.y0 - 6);
  for (const p of placed) {
    let box = labelBox(p.el);
    if (!box) continue;
    const step = box.y1 - box.y0 + 10;
    const down = p.el.center![1] < CANVAS.h - 220;
    for (let tries = 0; tries < 5 && hits(box); tries++) {
      p.el.center = [p.el.center![0], round(p.el.center![1] + (down ? step : -step))];
      box = labelBox(p.el)!;
    }
    taken.push(box);
  }
}

/* ── Mise en page par le code ──────────────────────────────────────────── */

/** La taille qui fait tenir un texte dans une largeur (estimation prudente : 0,62 de large par signe). */
export function fitSize(text: string, maxWidth: number, wanted: number): number {
  const n = Math.max(1, [...text].length);
  return Math.max(20, Math.min(wanted, Math.floor(maxWidth / (n * 0.62))));
}

const short = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return [...t].length <= max ? t : `${[...t].slice(0, max - 1).join("").trimEnd()}…`;
};

/** Le titre de la scène, écrit en haut, souligné d'un trait d'accent. */
function headingElements(heading: string): PlacedElement[] {
  const text = short(heading, 58);
  if (!text) return [];
  const size = fitSize(text, 1320, 50);
  const half = Math.min(660, ([...text].length * size * 0.62) / 2);
  return [
    { el: { kind: "text", color: "ink", text, center: [800, 96], size }, frac: 0 },
    { el: { kind: "line", color: "accent", from: [800 - half, 148], to: [800 + half, 148], weight: 1.3 }, frac: 0.04 },
  ];
}

/** Un enchaînement d'étapes : une case par étape, une flèche entre deux, dans l'ordre de la voix. */
export function flowchartElements(steps: string[]): PlacedElement[] {
  const labels = steps.map((s) => short(s, 26)).filter(Boolean).slice(0, 6);
  const n = labels.length;
  if (n < 2) return [];
  const rows = n <= 3 ? 1 : 2;
  const perRow = Math.ceil(n / rows);
  const gap = 70;
  const boxW = Math.min(400, (SKETCH_AREA.x1 - SKETCH_AREA.x0 - gap * (perRow - 1)) / perRow);
  const boxH = 150;
  const rowY = rows === 1 ? [440] : [310, 590];
  const out: PlacedElement[] = [];
  let prev: { cx: number; cy: number } | null = null;
  labels.forEach((label, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const inRow = row === rows - 1 ? n - perRow * (rows - 1) : perRow;
    const rowWidth = inRow * boxW + (inRow - 1) * gap;
    const x0 = 800 - rowWidth / 2 + col * (boxW + gap);
    const cx = x0 + boxW / 2;
    const cy = rowY[row]!;
    const frac = (i + 0.15) / n;
    if (prev) {
      const sameRow = Math.abs(prev.cy - cy) < 1;
      out.push({
        el: sameRow
          ? { kind: "arrow", color: "gray", from: [round(prev.cx + boxW / 2 + 8), cy], to: [round(x0 - 8), cy] }
          : { kind: "arrow", color: "gray", from: [round(prev.cx), round(prev.cy + boxH / 2 + 8)], to: [round(cx), round(cy - boxH / 2 - 8)] },
        frac: frac - 0.5 / n,
      });
    }
    out.push({ el: { kind: "rect", color: i === n - 1 ? "accent" : "ink", corner: [round(x0), round(cy - boxH / 2)], w: round(boxW), h: boxH, fill: i === n - 1 }, frac });
    out.push({ el: { kind: "text", color: "ink", text: label, center: [round(cx), cy], size: fitSize(label, boxW - 50, 40) }, frac: frac + 0.25 / n });
    prev = { cx, cy };
  });
  return out;
}

/** Une formule LaTeX que le moteur sait écrire (mathtext) : une seule ligne, caractères d'une formule. */
export function drawableTex(formula: string): string | null {
  const first = formula.split(/\\\\/)[0]!.replace(/^\$+|\$+$/g, "").replace(/\\(?:left|right|,|;|!|quad|qquad|displaystyle)\b/g, " ").replace(/\\text\{([^{}]*)\}/g, "\\mathrm{$1}").replace(/\s+/g, " ").trim();
  if (!first || first.length > 150 || !TEX_ONLY.test(first)) return null;
  return first;
}

function formulaElements(formula: string, y: number, frac: number): PlacedElement[] {
  const tex = drawableTex(formula);
  if (!tex) return [];
  const size = Math.max(40, Math.min(86, Math.floor(2600 / Math.max(18, tex.length))));
  return [{ el: { kind: "formula", color: "ink", tex, center: [800, y], size }, frac }];
}

/** Les points à retenir : une coche tracée, puis le point, l'un après l'autre. */
function bulletElements(bullets: string[], top: number, from: number, to: number, check: boolean): PlacedElement[] {
  const lines = bullets.map((b) => short(b, 46)).filter(Boolean).slice(0, 3);
  const out: PlacedElement[] = [];
  lines.forEach((line, i) => {
    const y = top + i * 130;
    const frac = from + ((to - from) * i) / Math.max(1, lines.length);
    const size = fitSize(line, 1050, 40);
    const width = [...line].length * size * 0.62;
    out.push({
      el: check
        ? { kind: "polyline", color: "green", points: [[250, y - 6], [278, y + 26], [330, y - 38]], weight: 1.5 }
        : { kind: "arrow", color: "accent", from: [240, y], to: [320, y], weight: 1.2 },
      frac,
    });
    out.push({ el: { kind: "text", color: "ink", text: line, center: [round(380 + width / 2), y], size }, frac: frac + 0.04 });
  });
  return out;
}

export interface DrawableScene {
  heading: string;
  bullets: string[];
  steps?: string[];
  formula: string;
  visual: string;
  voiceover: string;
  sketch?: SketchElement[];
}

/**
 * Ce qui se dessine pendant UNE scène. Toujours quelque chose : au pire le
 * titre et les points, écrits à la main — jamais un écran fixe.
 */
export function layoutScene(scene: DrawableScene, allowed: ReadonlySet<string>): { placed: PlacedElement[]; sketchDropped: SketchDrop[] } {
  const head = headingElements(scene.heading);
  if (scene.visual === "question") {
    // La question mystère : elle s'écrit en grand, seule, puis un point d'interrogation s'entoure.
    const text = short(scene.heading, 58);
    return {
      placed: [
        { el: { kind: "text", color: "ink", text, center: [800, 400], size: fitSize(text, 1360, 62) }, frac: 0.02 },
        { el: { kind: "ellipse", color: "accent", center: [800, 640], rx: 70, ry: 70, weight: 1.4 }, frac: 0.55 },
        { el: { kind: "text", color: "accent", text: "?", center: [800, 640], size: 90 }, frac: 0.62 },
      ],
      sketchDropped: [],
    };
  }
  if (scene.visual === "flowchart") {
    const flow = flowchartElements(scene.steps ?? []);
    if (flow.length > 0) return { placed: [...head, ...flow.map((p) => ({ ...p, frac: 0.08 + (p.frac ?? 0) * 0.9 }))], sketchDropped: [] };
  }
  if (scene.visual === "recap") return { placed: [...head, ...bulletElements(scene.bullets, 320, 0.15, 0.95, true)], sketchDropped: [] };

  const { placed: sketch, dropped } = cleanSketch(scene.sketch, allowed);
  // Un croquis réduit à un ou deux traits après contrôle n'explique rien : on préfère la mise en page sûre.
  if (sketch.filter((p) => p.el.kind !== "text" && p.el.kind !== "formula").length >= 2) return { placed: [...head, ...sketch], sketchDropped: dropped };

  const formula = scene.formula.trim() ? formulaElements(scene.formula, scene.bullets.some((b) => b.trim()) ? 330 : 450, 0.15) : [];
  const bullets = bulletElements(scene.bullets, formula.length > 0 ? 520 : 340, formula.length > 0 ? 0.5 : 0.15, 0.95, false);
  return { placed: [...head, ...formula, ...bullets], sketchDropped: dropped };
}

/* ── Calage sur la voix ────────────────────────────────────────────────── */

/** Les mots d'une scène dans la liste des mots de la voix : [from, to[. */
export interface WordRange {
  from: number;
  to: number;
}

/** Le temps qu'il faut pour tracer un élément, en secondes. */
export function drawSeconds(el: DrawElement): number {
  const dist = (a: [number, number], b: [number, number]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  switch (el.kind) {
    case "line":
    case "arrow":
      return Math.min(1.1, Math.max(0.35, dist(el.from!, el.to!) / 900));
    case "polyline":
    case "curve": {
      const pts = el.points!;
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += dist(pts[i - 1]!, pts[i]!);
      return Math.min(1.6, Math.max(0.45, len / 800));
    }
    case "circle":
    case "ellipse":
      return Math.min(1.3, Math.max(0.6, ((el.rx ?? el.r ?? 60) + (el.ry ?? el.r ?? 60)) / 260));
    case "rect":
      return Math.min(1.2, Math.max(0.6, (el.w! + el.h!) / 700));
    case "text":
      return Math.min(1.8, 0.3 + [...(el.text ?? "")].length * 0.045);
    case "icon":
      return 0.9;
    default:
      return Math.min(2.2, 0.8 + (el.tex ?? "").length * 0.035);
  }
}

/** Les passages parlés [début, fin] en secondes : des mots séparés par moins de `gapMs` forment un seul passage. */
export function speechSpans(words: VoiceWord[], gapMs = 700): [number, number][] {
  const spans: [number, number][] = [];
  for (const w of words) {
    const last = spans[spans.length - 1];
    if (last && w.startMs / 1000 - last[1] <= gapMs / 1000) last[1] = Math.max(last[1], w.endMs / 1000);
    else spans.push([w.startMs / 1000, Math.max(w.startMs, w.endMs) / 1000]);
  }
  return spans;
}

export interface EngineStoryboard {
  style: DrawStyle;
  duration: number;
  /** Quand la voix parle : la musique de fond s'efface pendant ces passages. */
  speech: [number, number][];
  elements: (DrawElement & { at: number; dur: number; until?: number; group: number })[];
}

/**
 * Le storyboard du moteur : chaque tracé reçoit son instant, pris sur la voix.
 *
 * `scenes[i]` occupe [sceneStartsMs[i], sceneStartsMs[i+1][ ; ses mots sont
 * `ranges[i]` dans `words`. Un tracé ancré sur le mot k de la scène commence
 * quand la voix le prononce ; un tracé de mise en page commence à sa part de
 * la scène. Tout s'efface juste avant la scène suivante — sauf la dernière,
 * qui reste à l'écran.
 */
export function buildStoryboard(input: {
  style: DrawStyle;
  scenes: { placed: PlacedElement[]; wordCount: number }[];
  words: VoiceWord[];
  ranges: WordRange[];
  sceneStartsMs: number[];
  durationMs: number;
}): EngineStoryboard {
  const { style, scenes, words, ranges, sceneStartsMs, durationMs } = input;
  const duration = Math.max(1, durationMs / 1000);
  const elements: EngineStoryboard["elements"] = [];
  scenes.forEach((scene, i) => {
    const start = (sceneStartsMs[i] ?? 0) / 1000;
    const last = i === scenes.length - 1;
    const end = last ? duration : Math.max(start + 1, (sceneStartsMs[i + 1] ?? durationMs) / 1000);
    const until = last ? undefined : end - CLEAR_BEFORE_END;
    const latest = (until ?? end) - 0.3;
    const range = ranges[i] ?? { from: 0, to: 0 };
    const spoken = Math.max(0, range.to - range.from);
    let floor = start;
    // Dans l'ordre où ils doivent arriver : la main ne trace pas deux choses à la fois sans raison.
    const ordered = scene.placed
      .map((p, order) => ({ p, order, key: p.word !== undefined ? (scene.wordCount > 0 ? p.word / scene.wordCount : 0) : (p.frac ?? 0) }))
      .sort((a, b) => a.key - b.key || a.order - b.order);
    for (const { p, key } of ordered) {
      let at: number;
      if (p.word !== undefined && spoken > 0) {
        // Le numéro vient du texte, les instants de la voix : on passe par la proportion.
        const k = Math.min(spoken - 1, Math.floor(Math.min(0.999, Math.max(0, key)) * spoken));
        at = (words[range.from + k]?.startMs ?? start * 1000) / 1000;
      } else {
        at = start + Math.min(0.98, Math.max(0, key)) * (end - start);
      }
      at = Math.max(at, floor);
      if (at > latest - MIN_DRAW) at = Math.max(start, latest - MIN_DRAW - 0.05);
      const dur = Math.max(MIN_DRAW, Math.min(drawSeconds(p.el), latest - at));
      if (at < start || at + dur > (until ?? end) + 0.001) continue;
      // Le tracé suivant attend que celui-ci soit bien engagé.
      floor = Math.min(latest - MIN_DRAW, at + Math.min(dur * 0.6, 0.5));
      elements.push({ ...p.el, at: Math.round(at * 1000) / 1000, dur: Math.round(dur * 1000) / 1000, ...(until !== undefined ? { until: Math.round(until * 1000) / 1000 } : {}), group: i % 64 });
    }
  });
  return { style, duration: Math.round(duration * 1000) / 1000, speech: speechSpans(words).map(([a, b]) => [Math.min(a, duration), Math.min(b, duration)] as [number, number]), elements };
}

/* ── Sous-titres ───────────────────────────────────────────────────────── */

const srtTime = (ms: number) => {
  const t = Math.max(0, Math.round(ms));
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(t / 3_600_000))}:${p(Math.floor(t / 60_000) % 60)}:${p(Math.floor(t / 1000) % 60)},${p(t % 1000, 3)}`;
};

/** Les mêmes sous-titres en WebVTT, pour la balise <track> du navigateur. */
export function buildVtt(words: VoiceWord[]): string {
  return `WEBVTT\n\n${buildSrt(words).replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}

/** Les mots horodatés → sous-titres SRT : 7 mots au plus, coupés aux silences. */
export function buildSrt(words: VoiceWord[], maxWords = 7, gapMs = 450): string {
  const cues: { start: number; end: number; text: string }[] = [];
  let cur: VoiceWord[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    cues.push({ start: cur[0]!.startMs, end: cur[cur.length - 1]!.endMs + 120, text: cur.map((w) => w.text).join(" ").replace(/[\r\n]+/g, " ").replace(/-->/g, "→") });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length >= maxWords || (prev && w.startMs - prev.endMs > gapMs)) flush();
    cur.push(w);
  });
  flush();
  return cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(Math.min(c.end, cues[i + 1]?.start ?? c.end))}\n${c.text}\n`).join("\n");
}
