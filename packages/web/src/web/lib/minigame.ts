/**
 * Mini-jeu « Triebwerk-Check » (2026-11-15) : une question, on touche la bonne
 * pièce sur la coupe du turboréacteur.
 *
 * Module PUR : les règles (manches, points, médaille) et le dessin en zones.
 * Phaser n'est que le pinceau (components/MiniGame.tsx) ; tout ce qui décide
 * est ici, et testé. Les questions et les noms viennent de l'Explorateur 3D
 * (lib/explorer-models.ts) : on apprend là-bas, on vérifie ici.
 */

/** Taille de la planche de jeu ; Phaser la met à l'échelle de l'écran. */
export const BOARD = { width: 800, height: 600 } as const;
export const ROUND_COUNT = 8;

export interface Zone {
  /** Le repère de l'Explorateur que cette zone représente. */
  id: string;
  /** Le numéro affiché sur la zone (touche 1–6 au clavier). */
  n: number;
  /** Un ou deux polygones [x, y, x, y…] : le flux secondaire passe au-dessus ET en dessous du cœur. */
  shapes: number[][];
  /** Couleur de la zone : du froid (bleu) au chaud (orange). */
  color: number;
}

/** La coupe du moteur, schématique : l'air entre à gauche, sort à droite. */
export const ZONES: Zone[] = [
  { id: "fan", n: 1, color: 0x7dd3fc, shapes: [[100, 120, 190, 120, 190, 480, 100, 480]] },
  { id: "compressor", n: 2, color: 0x93c5fd, shapes: [[200, 215, 365, 240, 365, 360, 200, 385]] },
  { id: "combustor", n: 3, color: 0xfb923c, shapes: [[375, 235, 470, 235, 470, 365, 375, 365]] },
  { id: "turbine", n: 4, color: 0xf59e0b, shapes: [[480, 240, 600, 215, 600, 385, 480, 360]] },
  { id: "nozzle", n: 5, color: 0xf87171, shapes: [[610, 225, 730, 265, 730, 335, 610, 375]] },
  { id: "bypass", n: 6, color: 0xbae6fd, shapes: [[200, 120, 570, 120, 570, 195, 200, 195], [200, 405, 570, 405, 570, 480, 200, 480]] },
];

function inside(poly: number[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const [xi, yi, xj, yj] = [poly[i], poly[i + 1], poly[j], poly[j + 1]];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** La zone touchée à ce point de la planche, ou aucune. */
export function zoneAt(x: number, y: number): Zone | null {
  return ZONES.find((z) => z.shapes.some((s) => inside(s, x, y))) ?? null;
}

/** Où poser le numéro d'une zone : le centre de son premier polygone. */
export function zoneCentre(zone: Zone): [number, number] {
  const s = zone.shapes[0];
  let [x, y] = [0, 0];
  for (let i = 0; i < s.length; i += 2) {
    x += s[i];
    y += s[i + 1];
  }
  return [x / (s.length / 2), y / (s.length / 2)];
}

/**
 * Les pièces à trouver, dans l'ordre : toutes passent avant qu'une revienne,
 * et jamais la même deux fois de suite.
 */
export function buildRounds(ids: string[], count: number, rand: () => number = Math.random): string[] {
  const out: string[] = [];
  while (out.length < count && ids.length > 0) {
    const bag = [...ids];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (out.length > 0 && bag.length > 1 && bag[0] === out[out.length - 1]) [bag[0], bag[1]] = [bag[1], bag[0]];
    out.push(...bag);
  }
  return out.slice(0, count);
}

/** Série en cours → multiplicateur : ×1, puis ×1,5 à partir de 3 bonnes réponses de suite, ×2 à partir de 5. */
export const multiplier = (streak: number) => (streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1);

/**
 * Points d'une réponse. Fausse : 0. Juste : 100, plus jusqu'à 50 de rapidité
 * (tout le bonus en moins d'une seconde, plus rien après 8 s), le tout multiplié
 * par la série — `streak` compte CETTE bonne réponse.
 */
export function pointsFor(correct: boolean, ms: number, streak: number): number {
  if (!correct) return 0;
  const speed = Math.max(0, Math.min(1, (8000 - ms) / 7000));
  return Math.round((100 + 50 * speed) * multiplier(streak));
}

export type Medal = "gold" | "silver" | "bronze" | "retry";
export function medalFor(correct: number, total: number): Medal {
  const share = total > 0 ? correct / total : 0;
  return share === 1 ? "gold" : share >= 0.75 ? "silver" : share >= 0.5 ? "bronze" : "retry";
}

export interface GameState {
  round: number;
  score: number;
  streak: number;
  correct: number;
}
export const START: GameState = { round: 0, score: 0, streak: 0, correct: 0 };

/** L'état après une réponse à la manche en cours. */
export function answer(state: GameState, ok: boolean, ms: number): GameState {
  const streak = ok ? state.streak + 1 : 0;
  return { round: state.round + 1, score: state.score + pointsFor(ok, ms, streak), streak, correct: state.correct + (ok ? 1 : 0) };
}
