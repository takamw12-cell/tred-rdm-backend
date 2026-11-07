/**
 * KI & Data Science — die Grundrechnungen, exakt.
 *
 *   Lineare Algebra   matrixMultiply, vectorDotProduct
 *   Statistik         linearRegression (kleinste Quadrate: y = a·x + b, R²)
 *   Optimierung       gradientDescentStep (w ← w − η·∇L)
 *   Neuronale Netze   sigmoid, relu, softmax, perceptronForwardPass
 *
 * Ein Sprachmodell verrechnet sich zuverlässig bei Matrixprodukten und
 * Exponentialfunktionen — genau die Stellen, an denen ein Studierender in
 * der KI-Vorlesung nachrechnet. Hier rechnet der Code; Proben, wo es eine
 * unabhängige gibt (Softmax summiert zu 1, Regression: Residuen summieren
 * zu 0).
 */
import { z } from "zod";
import type { ChartSpec } from "../thermo-solver";

export class AiSolverError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiSolverError";
  }
}

const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
function assertVector(v: number[], name: string) {
  if (!Array.isArray(v) || v.length === 0 || !v.every(finite)) throw new AiSolverError(`${name} muss ein nichtleerer Zahlenvektor sein.`);
}
function assertMatrix(M: number[][], name: string): { rows: number; cols: number } {
  if (!Array.isArray(M) || M.length === 0) throw new AiSolverError(`${name} ist leer.`);
  const cols = M[0]?.length ?? 0;
  if (cols === 0 || !M.every((r) => Array.isArray(r) && r.length === cols && r.every(finite))) {
    throw new AiSolverError(`${name} muss rechteckig sein (alle Zeilen gleich lang, nur Zahlen).`);
  }
  return { rows: M.length, cols };
}

/* -------------------------------------------------------------------------- */
/* Lineare Algebra                                                            */
/* -------------------------------------------------------------------------- */

/** v1 · v2 = Σ v1ᵢ·v2ᵢ */
export function vectorDotProduct(v1: number[], v2: number[]): number {
  assertVector(v1, "v1");
  assertVector(v2, "v2");
  if (v1.length !== v2.length) throw new AiSolverError(`Skalarprodukt: Längen ${v1.length} und ${v2.length} verschieden.`);
  return v1.reduce((s, x, i) => s + x * v2[i], 0);
}

/** C = A·B, (m×k)·(k×n) → (m×n). */
export function matrixMultiply(A: number[][], B: number[][]): number[][] {
  const a = assertMatrix(A, "A");
  const b = assertMatrix(B, "B");
  if (a.cols !== b.rows) {
    throw new AiSolverError(`Matrixprodukt nicht definiert: A ist ${a.rows}×${a.cols}, B ist ${b.rows}×${b.cols} (Spalten von A ≠ Zeilen von B).`);
  }
  return A.map((row) => Array.from({ length: b.cols }, (_, j) => row.reduce((s, x, k) => s + x * B[k][j], 0)));
}

/* -------------------------------------------------------------------------- */
/* Lineare Regression                                                         */
/* -------------------------------------------------------------------------- */

export interface RegressionResult {
  /** Steigung a in y = a·x + b */
  a: number;
  /** Achsenabschnitt b */
  b: number;
  r2: number;
  n: number;
  x_mittel: number;
  y_mittel: number;
  residuen: number[];
  mse: number;
}

/** Kleinste Quadrate: a = Σ(x−x̄)(y−ȳ) / Σ(x−x̄)², b = ȳ − a·x̄, R² = 1 − SS_res/SS_tot. */
export function linearRegression(x: number[], y: number[]): RegressionResult {
  assertVector(x, "x");
  assertVector(y, "y");
  if (x.length !== y.length) throw new AiSolverError("x und y brauchen gleich viele Werte.");
  if (x.length < 2) throw new AiSolverError("Mindestens zwei Punkte nötig.");
  const n = x.length;
  const xm = x.reduce((s, v) => s + v, 0) / n;
  const ym = y.reduce((s, v) => s + v, 0) / n;
  const sxx = x.reduce((s, v) => s + (v - xm) ** 2, 0);
  if (sxx === 0) throw new AiSolverError("Alle x-Werte sind gleich — die Steigung ist nicht bestimmt.");
  const sxy = x.reduce((s, v, i) => s + (v - xm) * (y[i] - ym), 0);
  const a = sxy / sxx;
  const b = ym - a * xm;
  const residuen = y.map((v, i) => v - (a * x[i] + b));
  const ssRes = residuen.reduce((s, r) => s + r * r, 0);
  const ssTot = y.reduce((s, v) => s + (v - ym) ** 2, 0);
  // Probe: bei kleinsten Quadraten summieren sich die Residuen zu 0.
  const sumRes = residuen.reduce((s, r) => s + r, 0);
  if (Math.abs(sumRes) > 1e-9 * Math.max(1, ...y.map(Math.abs)) * n) throw new AiSolverError("Interne Probe Σ Residuen = 0 nicht erfüllt.");
  return { a, b, r2: ssTot === 0 ? 1 : 1 - ssRes / ssTot, n, x_mittel: xm, y_mittel: ym, residuen, mse: ssRes / n };
}

export function regressionChart(x: number[], y: number[], r: RegressionResult): ChartSpec {
  const lo = Math.min(...x);
  const hi = Math.max(...x);
  const round = (v: number) => (v === 0 ? 0 : Number(v.toPrecision(5)));
  return {
    type: "scatter",
    title: `Lineare Regression: y = ${round(r.a)}·x ${r.b < 0 ? "−" : "+"} ${round(Math.abs(r.b))}  (R² = ${round(r.r2)})`,
    xLabel: "x",
    yLabel: "y",
    series: [
      { label: "Messpunkte", data: x.map((v, i) => ({ x: v, y: y[i] })) },
      { label: "Regressionsgerade", line: true, data: [lo, hi].map((v) => ({ x: v, y: round(r.a * v + r.b) })) },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Gradientenabstieg                                                          */
/* -------------------------------------------------------------------------- */

/** Ein Schritt w_neu = w − η·∇L. */
export function gradientDescentStep(weights: number[], gradients: number[], learningRate: number): number[] {
  assertVector(weights, "gewichte");
  assertVector(gradients, "gradienten");
  if (weights.length !== gradients.length) throw new AiSolverError("Gewichte und Gradienten brauchen dieselbe Länge.");
  if (!finite(learningRate) || learningRate <= 0) throw new AiSolverError("Die Lernrate η muss positiv sein.");
  return weights.map((w, i) => w - learningRate * gradients[i]);
}

/* -------------------------------------------------------------------------- */
/* Aktivierungen und Perzeptron                                               */
/* -------------------------------------------------------------------------- */

/** σ(x) = 1 / (1 + e^(−x)), numerisch stabil auch für große |x|. */
export function sigmoid(x: number): number {
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

export const relu = (x: number): number => (x > 0 ? x : 0);

/** softmax(z)ᵢ = e^(zᵢ − max z) / Σ e^(zⱼ − max z) — die Verschiebung ändert nichts am Ergebnis, verhindert aber Überlauf. */
export function softmax(values: number[]): number[] {
  assertVector(values, "werte");
  const m = Math.max(...values);
  const ex = values.map((v) => Math.exp(v - m));
  const sum = ex.reduce((s, v) => s + v, 0);
  const out = ex.map((v) => v / sum);
  if (Math.abs(out.reduce((s, v) => s + v, 0) - 1) > 1e-12) throw new AiSolverError("Interne Probe Σ softmax = 1 nicht erfüllt.");
  return out;
}

export type Activation = "step" | "sigmoid" | "relu" | "linear" | "tanh";

export function activate(z: number, fn: Activation): number {
  switch (fn) {
    case "step":
      return z >= 0 ? 1 : 0;
    case "sigmoid":
      return sigmoid(z);
    case "relu":
      return relu(z);
    case "tanh":
      return Math.tanh(z);
    default:
      return z;
  }
}

export interface PerceptronResult {
  z: number;
  ausgabe: number;
  aktivierung: Activation;
  rechnung: string;
}

/** z = w·x + b, Ausgabe = f(z). Standard: Stufenfunktion (klassisches Perzeptron, f(0) = 1). */
export function perceptronForwardPass(inputs: number[], weights: number[], bias: number, activation: Activation = "step"): PerceptronResult {
  if (!finite(bias)) throw new AiSolverError("Der Bias muss eine Zahl sein.");
  const z = vectorDotProduct(weights, inputs) + bias;
  const terms = weights.map((w, i) => `${w}·${inputs[i]}`).join(" + ");
  return { z, ausgabe: activate(z, activation), aktivierung: activation, rechnung: `z = ${terms} + (${bias}) = ${Number(z.toPrecision(10))}` };
}

/* -------------------------------------------------------------------------- */
/* Werkzeug                                                                   */
/* -------------------------------------------------------------------------- */

const vec = z.array(z.number()).max(1000);
const mat = z.array(z.array(z.number()).max(50)).max(50);

export const aiInputSchema = z.object({
  aufgabe: z.enum(["matrix_produkt", "skalarprodukt", "regression", "gradientenschritt", "aktivierung", "perzeptron"]),
  A: mat.optional().describe("matrix_produkt: Matrix A als Zeilenliste"),
  B: mat.optional().describe("matrix_produkt: Matrix B"),
  v1: vec.optional(),
  v2: vec.optional(),
  x: vec.optional().describe("regression: x-Werte"),
  y: vec.optional().describe("regression: y-Werte"),
  gewichte: vec.optional().describe("gradientenschritt, perzeptron"),
  gradienten: vec.optional().describe("gradientenschritt: ∂L/∂w je Gewicht"),
  lernrate: z.number().optional().describe("gradientenschritt: η"),
  funktion: z.enum(["sigmoid", "relu", "softmax", "tanh"]).optional().describe("aktivierung"),
  werte: vec.optional().describe("aktivierung: Eingabewerte (softmax: der ganze Vektor)"),
  eingaben: vec.optional().describe("perzeptron: x"),
  bias: z.number().optional().describe("perzeptron: b"),
  aktivierung: z.enum(["step", "sigmoid", "relu", "linear", "tanh"]).optional().describe("perzeptron, Standard step"),
});
export type AiInput = z.infer<typeof aiInputSchema>;

const LIMITS =
  "Abgedeckt: Matrixprodukt, Skalarprodukt, lineare Regression (eine Variable, kleinste Quadrate), ein Schritt " +
  "Gradientenabstieg, Sigmoid/ReLU/tanh/Softmax, Vorwärtsdurchlauf eines Perzeptrons. NICHT abgedeckt: Training " +
  "ganzer Netze, Backpropagation über mehrere Schichten, mehrdimensionale Regression. Weitere Matrixoperationen " +
  "(Inverse, Eigenwerte) rechnet mathe_berechnen.";

export type AiResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

const sig = (v: number) => (v === 0 || !Number.isFinite(v) ? v : Number(v.toPrecision(10)));
const need = <T>(v: T | undefined, name: string): T => {
  if (v === undefined) throw new AiSolverError(`${name} fehlt.`);
  return v;
};

export function solveAi(raw: AiInput): AiResult {
  try {
    const input = aiInputSchema.parse(raw);
    switch (input.aufgabe) {
      case "matrix_produkt": {
        const A = need(input.A, "A");
        const B = need(input.B, "B");
        const C = matrixMultiply(A, B);
        return { ok: true, ergebnis: C.map((r) => r.map(sig)), format: `${A.length}×${A[0].length} · ${B.length}×${B[0].length} = ${C.length}×${C[0].length}` };
      }
      case "skalarprodukt":
        return { ok: true, ergebnis: sig(vectorDotProduct(need(input.v1, "v1"), need(input.v2, "v2"))) };
      case "regression": {
        const x = need(input.x, "x");
        const y = need(input.y, "y");
        const r = linearRegression(x, y);
        return {
          ok: true,
          a_steigung: sig(r.a),
          b_achsenabschnitt: sig(r.b),
          r2: sig(r.r2),
          n: r.n,
          x_mittel: sig(r.x_mittel),
          y_mittel: sig(r.y_mittel),
          mse: sig(r.mse),
          residuen: r.residuen.map(sig),
          formel: "y = a·x + b, a = Σ(x−x̄)(y−ȳ)/Σ(x−x̄)², b = ȳ − a·x̄",
          // Wird im Chat automatisch als Diagramm angezeigt (web/lib/solver-charts.ts).
          diagramme: [regressionChart(x, y, r)],
        };
      }
      case "gradientenschritt": {
        const w = need(input.gewichte, "gewichte");
        const g = need(input.gradienten, "gradienten");
        const eta = need(input.lernrate, "lernrate");
        return { ok: true, gewichte_neu: gradientDescentStep(w, g, eta).map(sig), formel: "w_neu = w − η·∂L/∂w" };
      }
      case "aktivierung": {
        const fn = need(input.funktion, "funktion");
        const v = need(input.werte, "werte");
        if (fn === "softmax") return { ok: true, funktion: fn, ergebnis: softmax(v).map(sig), summe: 1 };
        return { ok: true, funktion: fn, ergebnis: v.map((x) => sig(activate(x, fn))) };
      }
      case "perzeptron": {
        const r = perceptronForwardPass(need(input.eingaben, "eingaben"), need(input.gewichte, "gewichte"), input.bias ?? 0, input.aktivierung);
        return { ok: true, z: sig(r.z), ausgabe: sig(r.ausgabe), aktivierung: r.aktivierung, rechnung: r.rechnung };
      }
    }
  } catch (err) {
    if (err instanceof AiSolverError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    throw err;
  }
}
