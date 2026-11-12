/**
 * La main-feutre de « Als Video erklären » : où se trouve la pointe du feutre
 * à chaque image, pendant que le schéma se trace.
 *
 * Module PUR (aucun React, aucun Remotion), testé dans
 * tests/marker-hand.test.ts. La main ne dessine rien et ne calcule rien :
 * elle SUIT le bout du trait que la composition trace déjà, avec les mêmes
 * formules. Les positions, les charges et les valeurs restent celles du
 * solveur ; la main n'en lit aucune.
 */
import type { Visual } from "../../api/lib/video-visuals";

/** La même courbe d'adoucissement que la composition. */
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

/** Les visuels où la main tient le feutre. Prototype : la poutre et ses charges. */
export const HAND_VISUALS: readonly Visual[] = ["beam", "loads"];

export interface PenPoint {
  /** Position de la pointe, dans le repère du schéma (viewBox). */
  x: number;
  y: number;
  /** 0 → 1 : la main est-elle à l'écran ? */
  opacity: number;
  /** Ce que la main est en train de tracer (pour les tests et le tableau des effets). */
  phase: "idle" | "beam" | "supports" | "load-line" | "arrows" | "done";
}

export interface BeamPenInput {
  /** Avancement du tracé de la poutre (0 → 1), tel que la composition le calcule. */
  draw: number;
  /** Avancement des charges (0 → 1). */
  loads: number;
  /** Extrémités et hauteur de la poutre dans le schéma. */
  x0: number;
  x1: number;
  y: number;
  /** Abscisses des appuis (déjà dans le repère du schéma), de gauche à droite. */
  supportXs: number[];
  /** Le trait des charges réparties : de `from` à `to`, à la hauteur `top`. Absent : aucune charge répartie. */
  loadLine?: { from: number; to: number; top: number };
  /** Les flèches, de gauche à droite : abscisse, départ du trait, pointe. */
  arrows: { x: number; top: number; tip: number }[];
}

/**
 * La pointe du feutre sur la poutre. Les quatre temps, dans l'ordre où la
 * composition trace :
 *   1. la poutre, de gauche à droite (draw 0 → 0,6) ;
 *   2. les appuis (draw 0,55 → 1) : la main passe de l'un à l'autre ;
 *   3. le trait des charges (loads 0 → 1/2,2) ;
 *   4. les flèches, l'une après l'autre, de haut en bas.
 */
export function beamPen(input: BeamPenInput): PenPoint {
  const { draw, loads, x0, x1, y, supportXs, loadLine, arrows } = input;
  const length = x1 - x0;
  if (draw <= 0) return { x: x0, y, opacity: 0, phase: "idle" };
  const fadeIn = clamp01(draw / 0.05);

  if (loads <= 0) {
    // 1. La poutre : la pointe est exactement au bout du trait (même formule que stroke-dashoffset).
    if (draw < 0.6) return { x: x0 + easeOutCubic(clamp01(draw / 0.6)) * length, y, opacity: fadeIn, phase: "beam" };
    // 2. Les appuis : de la fin de la poutre vers chaque appui, puis la main se retire.
    const stops = [{ x: x1, y }, ...supportXs.map((x) => ({ x, y: y + 26 }))];
    const t = clamp01((draw - 0.6) / 0.4) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    const k = easeOutCubic(t - i);
    const a = stops[i]!;
    const b = stops[i + 1]!;
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, opacity: draw >= 1 ? 0 : 1 - clamp01((draw - 0.92) / 0.08), phase: draw >= 1 ? "done" : "supports" };
  }

  // 3. Le trait des charges réparties.
  const lineK = Math.min(1, loads * 2.2);
  const v = loads * (arrows.length + 4) * 0.6;
  const started = arrows.findIndex((_, i) => clamp01(v - i * 0.55) > 0);
  if (loadLine && lineK < 1 && started < 0) {
    return { x: loadLine.from + (loadLine.to - loadLine.from) * lineK, y: loadLine.top, opacity: clamp01(loads / 0.04), phase: "load-line" };
  }
  // 4. Les flèches : la main suit celle qui est en train de tomber (la plus à droite commencée).
  let current = -1;
  arrows.forEach((_, i) => {
    if (clamp01(v - i * 0.55) > 0) current = i;
  });
  if (current < 0) return { x: loadLine?.from ?? x0, y: loadLine?.top ?? y, opacity: clamp01(loads / 0.04), phase: "load-line" };
  const arrow = arrows[current]!;
  const k = easeOutCubic(clamp01(v - current * 0.55));
  const finished = current === arrows.length - 1 && k >= 1;
  return { x: arrow.x, y: arrow.top + (arrow.tip - arrow.top) * k, opacity: finished ? (loads >= 1 ? 0 : 1 - clamp01((loads - 0.9) / 0.1)) : 1, phase: finished && loads >= 1 ? "done" : "arrows" };
}

/**
 * Calée sur la voix : l'image (relative à la scène) où la voix prononce le
 * premier mot qui parle des charges. Sert à faire arriver les charges quand
 * on en parle, et non à une image fixe. `undefined` si la voix n'en dit rien.
 */
const LOAD_WORD = /^(charg|last|streckenlast|gleichstreckenlast|load|kraft|kräft|force|carg|caric|нагруз)/i;
export function loadCueFrame(words: { text: string; startMs: number }[], from: number, to: number, fps: number): number | undefined {
  for (const w of words) {
    const f = Math.round((w.startMs / 1000) * fps);
    if (f < from || f >= to) continue;
    if (LOAD_WORD.test(w.text.normalize("NFC").replace(/^[^\p{L}]+/u, ""))) return f - from;
  }
  return undefined;
}

/**
 * L'effet appliqué à chaque scène. Ne modifie RIEN : ni le texte, ni l'ordre,
 * ni les points de contrôle. Sert au tableau des effets et au test de
 * non-régression sur les scènes.
 */
export const EFFECTS: Record<Visual, string> = {
  question: "question tapée lettre à lettre",
  real_image: "image en fondu, lent travelling",
  highlight: "citation, mots-clés surlignés au feutre",
  formula: "formule en machine à écrire",
  beam: "main-feutre : poutre puis appuis",
  loads: "main-feutre : poutre, appuis, charges flèche après flèche",
  solver_plot: "courbes du solveur tracées de gauche à droite",
  flowchart: "cases une par une, flèches tracées",
  chart: "courbe de principe tracée",
  recap: "points cochés un par un",
  text: "feuille qui se remplit",
};

export function planHandEffects<T extends { visual?: Visual; heading: string }>(scenes: readonly T[]): { index: number; heading: string; visual: Visual; effect: string; hand: boolean }[] {
  return scenes.map((scene, index) => {
    const visual = scene.visual ?? "text";
    return { index, heading: scene.heading, visual, effect: EFFECTS[visual], hand: HAND_VISUALS.includes(visual) };
  });
}
