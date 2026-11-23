/**
 * Les simulations GÉNÉRÉES du Labo : pour un concept hors du catalogue
 * (web/lib/sim-catalog.ts), le modèle de langage décrit une simulation —
 * grandeurs, formules, formes 3D — et le serveur la contrôle (api/lib/simulation-gen.ts).
 *
 * Le modèle n'écrit PAS de code. Il rend une description ; ce fichier la
 * calcule et components/SimulationScene.tsx la dessine. Rien de ce que le
 * modèle écrit n'est exécuté : une formule arrive ici sous forme d'arbre
 * (`Expr`) déjà passé par la liste blanche du serveur, et l'évaluateur
 * ci-dessous ne connaît que quatre opérations, la puissance et cinq fonctions.
 *
 * Lu par le serveur ET par le navigateur : ne dépend de rien.
 */
export type Expr = number | string | [string, ...Expr[]];

export interface GenVariable {
  symbol: string;
  tex: string;
  unitLabel: string;
  label: string;
}
export interface GenInput extends GenVariable {
  min: number;
  max: number;
  value: number;
  log: boolean;
  color: string;
}
export interface GenOutput extends GenVariable {
  expr: Expr;
  /** Facteur d'unités : F en kN et A en mm² donnent σ en MPa avec 1000. Calculé par le serveur. */
  scale: number;
  /** La plage de la grandeur sur les plages des curseurs : sert à la taille et à la couleur des formes. */
  lo: number;
  hi: number;
}
export type ShapeKind = "box" | "cylinder" | "sphere" | "arrow";
export interface GenShape {
  kind: ShapeKind;
  x: number;
  y: number;
  z: number;
  /** Largeur, hauteur, profondeur de base (unités de scène). Flèche : `h` est sa longueur. */
  w: number;
  h: number;
  d: number;
  /** La grandeur qui fait grandir chaque dimension, ou "". */
  growW: string;
  growH: string;
  growD: string;
  /** Flèche : sa direction. */
  dir: "+x" | "-x" | "+y" | "-y";
  color: string;
  /** La grandeur qui fait briller la forme, ou "". */
  glow: string;
}
export interface GenFormula {
  output: string;
  tex: string;
  /** La page où la phrase citée a été retrouvée ; null = pas trouvée dans le document (ou pas de document). */
  page: number | null;
  excerpt: string;
}
export interface GeneratedSim {
  title: string;
  summary: string;
  inputs: GenInput[];
  outputs: GenOutput[];
  formulas: GenFormula[];
  shapes: GenShape[];
  /** La courbe : une grandeur calculée en fonction d'un curseur. */
  plot: { x: string; y: string } | null;
}
export interface GeneratedExplanation {
  title: string;
  /** Markdown + KaTeX, écrit par le modèle. */
  markdown: string;
  /** Les phrases du document retrouvées par le code, avec leur page. */
  quotes: { text: string; page: number }[];
}

export const GEN_COLORS: Record<string, string> = { amber: "#F59E0B", sky: "#38BDF8", slate: "#94A3B8", green: "#34D399", red: "#F87171", violet: "#A78BFA", white: "#E2E8F0", yellow: "#FDE047" };

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const FN: Record<string, (x: number) => number> = { sqrt: Math.sqrt, exp: Math.exp, log: Math.log, sin: Math.sin, cos: Math.cos, neg: (x) => -x };

/** Évalue un arbre d'expression. Tout ce qui n'est pas prévu rend NaN : jamais d'exception, jamais de code. */
export function evalExpr(expr: Expr, scope: Record<string, number>): number {
  if (typeof expr === "number") return expr;
  if (typeof expr === "string") return expr === "pi" ? Math.PI : has(scope, expr) ? scope[expr]! : Number.NaN;
  if (!Array.isArray(expr)) return Number.NaN;
  const [op, a, b] = expr;
  const x = a === undefined ? Number.NaN : evalExpr(a, scope);
  if (b === undefined) return has(FN, op) ? FN[op]!(x) : Number.NaN;
  const y = evalExpr(b, scope);
  return op === "+" ? x + y : op === "-" ? x - y : op === "*" ? x * y : op === "/" ? x / y : op === "^" ? x ** y : Number.NaN;
}

export function computeGenerated(sim: GeneratedSim, values: Record<string, number>): Record<string, number> {
  return Object.fromEntries(sim.outputs.map((o) => [o.symbol, evalExpr(o.expr, values) * o.scale]));
}

/** Où se trouve une grandeur dans sa plage, de 0 à 1 (échelle logarithmique sur plusieurs décades). */
export function normalized(sim: GeneratedSim, symbol: string, values: Record<string, number>, outputs: Record<string, number>): number {
  const input = sim.inputs.find((v) => v.symbol === symbol);
  const out = sim.outputs.find((v) => v.symbol === symbol);
  const [value, lo, hi] = input ? [values[symbol]!, input.min, input.max] : out ? [outputs[symbol]!, out.lo, out.hi] : [0, 0, 0];
  if (!Number.isFinite(value) || !(hi > lo)) return 0.5;
  const t = lo > 0 && hi / lo > 100 && value > 0 ? Math.log(value / lo) / Math.log(hi / lo) : (value - lo) / (hi - lo);
  return Math.min(1, Math.max(0, t));
}

/** Les points de la courbe y(x), les autres curseurs restant où ils sont. */
export function plotPoints(sim: GeneratedSim, values: Record<string, number>, count = 48): { x: number; y: number }[] {
  const input = sim.inputs.find((v) => v.symbol === sim.plot?.x);
  const out = sim.outputs.find((v) => v.symbol === sim.plot?.y);
  if (!input || !out) return [];
  return Array.from({ length: count + 1 }, (_, i) => {
    const x = input.min + ((input.max - input.min) * i) / count;
    return { x, y: evalExpr(out.expr, { ...values, [input.symbol]: x }) * out.scale };
  }).filter((p) => Number.isFinite(p.y));
}
