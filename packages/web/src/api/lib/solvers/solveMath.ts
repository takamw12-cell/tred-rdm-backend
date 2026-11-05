/**
 * solveMath — Ingenieurmathematik: Ableitungen, Integrale, DGL, Matrizen,
 * Nullstellen.
 *
 * ── Grundsatz: nichts verlässt den Löser ungeprüft ─────────────────────────
 *   • Ableitung   — symbolisch (mathjs), gegen den Differenzenquotienten geprüft.
 *   • Integral    — Stammfunktion aus einer kleinen Regeltabelle ODER ein
 *                   Kandidat des Modells; JEDE Stammfunktion wird durch
 *                   Zurückableiten an Stützstellen geprüft. Bestimmte
 *                   Integrale zusätzlich numerisch (adaptives Simpson).
 *                   Findet die Tabelle nichts, sagt der Löser das — er rät nicht.
 *   • DGL         — linear mit konstanten Koeffizienten bis Ordnung 2
 *                   geschlossen (charakteristische Gleichung), gegen Runge-Kutta
 *                   geprüft; sonst numerisch (RK4).
 *   • Matrizen    — det, Inverse, LGS, Eigenwerte, Rang, mit Restprobe
 *                   (A·x − b, A·A⁻¹ − E, A·v − λ·v).
 *
 * ── Sicherheit ─────────────────────────────────────────────────────────────
 * Ausdrücke kommen vom Modell, also indirekt vom Nutzer. Jeder Ausdruck wird
 * geparst und sein Syntaxbaum gegen eine Positivliste geprüft (Zahlen,
 * erlaubte Variablen, + − · / ^, erlaubte Funktionen). Zuweisungen,
 * Objektzugriffe, import, evaluate usw. werden VOR jeder Auswertung abgelehnt.
 */
import { all, create, type MathNode } from "mathjs";
import { z } from "zod";

const math = create(all, { number: "number" });

export class MathSolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MathSolveError";
  }
}

/* -------------------------------------------------------------------------- */
/* Ausdrücke: Parsen mit Positivliste                                         */
/* -------------------------------------------------------------------------- */

const FUNCTIONS = new Set([
  "sin", "cos", "tan", "cot", "sec", "csc",
  "asin", "acos", "atan", "atan2",
  "sinh", "cosh", "tanh",
  "sqrt", "cbrt", "nthRoot", "exp", "log", "log10", "log2", "abs", "sign", "pow",
]);
const CONSTANTS = new Set(["pi", "e"]);
const OPERATORS = new Set(["add", "subtract", "multiply", "divide", "pow", "unaryMinus", "unaryPlus"]);
const MAX_LEN = 400;

type Node = MathNode & {
  type: string;
  name?: string;
  fn?: Node | { name: string };
  op?: string;
  args?: Node[];
  content?: Node;
  value?: unknown;
};

/** "ln(x)" → "log(x)", "·" → "*", "²" → "^2", Dezimalkomma bleibt Argumenttrenner. */
function normalize(expr: string): string {
  return expr
    .replace(/\bln\s*\(/g, "log(")
    .replace(/[·×]/g, "*")
    .replace(/−/g, "-")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "pi");
}

export function parseExpr(expr: string, variables: readonly string[]): Node {
  const src = normalize(String(expr ?? "").trim());
  if (!src) throw new MathSolveError("Leerer Ausdruck.");
  if (src.length > MAX_LEN) throw new MathSolveError("Ausdruck zu lang.");
  let node: Node;
  try {
    node = math.parse(src) as Node;
  } catch (err) {
    throw new MathSolveError(`Ausdruck nicht lesbar: ${err instanceof Error ? err.message : src}`);
  }
  const vars = new Set(variables);
  const check = (n: Node) => {
    switch (n.type) {
      case "ConstantNode":
        if (typeof n.value !== "number") throw new MathSolveError("Nur Zahlen als Konstanten erlaubt.");
        return;
      case "SymbolNode":
        if (!vars.has(n.name!) && !CONSTANTS.has(n.name!)) {
          throw new MathSolveError(
            `Unbekanntes Symbol "${n.name}". Erlaubt: ${[...vars, ...CONSTANTS].join(", ")}.`,
          );
        }
        return;
      case "OperatorNode":
        if (!OPERATORS.has(String((n as unknown as { fn: string }).fn))) {
          throw new MathSolveError(`Operator "${n.op}" nicht erlaubt.`);
        }
        n.args!.forEach(check);
        return;
      case "ParenthesisNode":
        check(n.content!);
        return;
      case "FunctionNode": {
        const fn = n.fn as Node;
        if (fn.type !== "SymbolNode" || !FUNCTIONS.has(fn.name!)) {
          throw new MathSolveError(`Funktion "${fn.name ?? "?"}" nicht erlaubt.`);
        }
        n.args!.forEach(check);
        return;
      }
      default:
        throw new MathSolveError(`Konstrukt "${n.type}" nicht erlaubt.`);
    }
  };
  check(node);
  return node;
}

const evalAt = (node: Node, scope: Record<string, number>): number => {
  const v = node.compile().evaluate({ ...scope });
  return typeof v === "number" ? v : Number.NaN;
};

const fmt = (v: number, s = 10) => {
  if (!Number.isFinite(v)) return v;
  const r = Number(v.toPrecision(s));
  return Object.is(r, -0) ? 0 : r;
};

const exprOut = (n: MathNode) => ({ ausdruck: n.toString(), latex: n.toTex() });

const simplify = (n: MathNode): Node => {
  try {
    return math.simplify(n) as Node;
  } catch {
    return n as Node;
  }
};

/** Stützstellen für Proben: verteilt, keine "schönen" Werte (0, 1) allein. */
const SAMPLES = [-2.3, -1.1, -0.37, 0.41, 0.93, 1.7, 2.9];

/**
 * Prüft f ≈ g an Stützstellen. Stellen, an denen einer der beiden nicht
 * definiert ist, zählen nicht; es müssen aber mindestens drei übrig bleiben.
 */
function sameFunction(f: Node, g: Node, v: string, points = SAMPLES, rel = 1e-7): boolean {
  let used = 0;
  for (const x of points) {
    const a = evalAt(f, { [v]: x });
    const b = evalAt(g, { [v]: x });
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    used++;
    if (Math.abs(a - b) > rel * Math.max(1, Math.abs(a), Math.abs(b))) return false;
  }
  return used >= 3;
}

/* -------------------------------------------------------------------------- */
/* Ableitung                                                                  */
/* -------------------------------------------------------------------------- */

function differentiate(node: Node, v: string, order: number): Node {
  let d: Node = node;
  for (let i = 0; i < order; i++) d = simplify(math.derivative(d, v) as Node);
  return d;
}

function numericDerivative(node: Node, v: string, x: number): number {
  const h = 1e-5 * Math.max(1, Math.abs(x));
  return (evalAt(node, { [v]: x + h }) - evalAt(node, { [v]: x - h })) / (2 * h);
}

/* -------------------------------------------------------------------------- */
/* Stammfunktion (Regeltabelle, linear zusammengesetzt)                       */
/* -------------------------------------------------------------------------- */

const P = (s: string) => math.parse(s) as Node;
const str = (n: Node) => `(${n.toString()})`;

function dependsOn(n: Node, v: string): boolean {
  let found = false;
  n.traverse((c) => {
    if ((c as Node).type === "SymbolNode" && (c as Node).name === v) found = true;
  });
  return found;
}

const constValue = (n: Node): number => evalAt(n, {});

/** Innere Funktion a·x + b? Dann a (konstant), sonst null. */
function linearSlope(inner: Node, v: string): number | null {
  const d = simplify(math.derivative(inner, v) as Node);
  if (dependsOn(d, v)) return null;
  const a = constValue(d);
  return Number.isFinite(a) && a !== 0 ? a : null;
}

function opName(n: Node): string {
  return (n as unknown as { fn: string }).fn;
}

function antiderivative(n: Node, v: string): Node | null {
  if (n.type === "ParenthesisNode") return antiderivative(n.content!, v);
  if (!dependsOn(n, v)) return P(`${str(n)} * ${v}`);
  if (n.type === "SymbolNode") return P(`${v}^2 / 2`);

  if (n.type === "OperatorNode") {
    const [a, b] = n.args!;
    const op = opName(n);
    if (op === "add" || op === "subtract") {
      const A = antiderivative(a, v);
      const B = antiderivative(b, v);
      return A && B ? P(`${str(A)} ${op === "add" ? "+" : "-"} ${str(B)}`) : null;
    }
    if (op === "unaryMinus") {
      const A = antiderivative(a, v);
      return A ? P(`-${str(A)}`) : null;
    }
    if (op === "unaryPlus") return antiderivative(a, v);
    if (op === "multiply") {
      if (!dependsOn(a, v)) {
        const B = antiderivative(b, v);
        return B ? P(`${str(a)} * ${str(B)}`) : null;
      }
      if (!dependsOn(b, v)) {
        const A = antiderivative(a, v);
        return A ? P(`${str(b)} * ${str(A)}`) : null;
      }
      return null;
    }
    if (op === "divide") {
      if (!dependsOn(b, v)) {
        const A = antiderivative(a, v);
        return A ? P(`${str(A)} / ${str(b)}`) : null;
      }
      // c / (a·x + b)
      if (!dependsOn(a, v)) {
        const k = linearSlope(b, v);
        if (k !== null) return P(`${str(a)} * log(abs(${b.toString()})) / ${k}`);
        // c / (a·x+b)^m
        const inner = b.type === "ParenthesisNode" ? b.content! : b;
        if (inner.type === "OperatorNode" && opName(inner) === "pow" && !dependsOn(inner.args![1], v)) {
          const base = inner.args![0];
          const m = constValue(inner.args![1]);
          const s = linearSlope(base, v);
          if (s !== null && Number.isFinite(m)) {
            if (m === 1) return P(`${str(a)} * log(abs(${base.toString()})) / ${s}`);
            return P(`${str(a)} * ${str(base)}^(${1 - m}) / (${s * (1 - m)})`);
          }
        }
      }
      return null;
    }
    if (op === "pow") {
      // (a·x+b)^n, n konstant
      if (!dependsOn(b, v)) {
        const nExp = constValue(b);
        const s = linearSlope(a, v);
        if (s === null || !Number.isFinite(nExp)) return null;
        if (nExp === -1) return P(`log(abs(${a.toString()})) / ${s}`);
        return P(`${str(a)}^(${nExp + 1}) / (${s * (nExp + 1)})`);
      }
      // c^(a·x+b), c konstant > 0
      if (!dependsOn(a, v)) {
        const c = constValue(a);
        const s = linearSlope(b, v);
        if (s === null || !(c > 0) || c === 1) return null;
        return P(`${str(a)}^${str(b)} / (${s} * log(${str(a)}))`);
      }
      return null;
    }
    return null;
  }

  if (n.type === "FunctionNode") {
    const name = (n.fn as Node).name!;
    const inner = n.args![0];
    if (n.args!.length !== 1) return null;
    const s = linearSlope(inner, v);
    if (s === null) return null;
    const u = inner.toString();
    const table: Record<string, string> = {
      sin: `-cos(${u}) / ${s}`,
      cos: `sin(${u}) / ${s}`,
      exp: `exp(${u}) / ${s}`,
      sinh: `cosh(${u}) / ${s}`,
      cosh: `sinh(${u}) / ${s}`,
      sqrt: `2 / 3 * (${u})^(3/2) / ${s}`,
      tan: `-log(abs(cos(${u}))) / ${s}`,
    };
    return table[name] ? P(table[name]) : null;
  }
  return null;
}

/** Adaptives Simpson mit Richardson-Korrektur. */
function simpson(f: (x: number) => number, a: number, b: number, tol = 1e-11): number {
  const fa = f(a);
  const fb = f(b);
  const m = (a + b) / 2;
  const fm = f(m);
  const whole = ((b - a) / 6) * (fa + 4 * fm + fb);
  let evals = 0;
  const rec = (a: number, b: number, fa: number, fm: number, fb: number, whole: number, tol: number, depth: number): number => {
    if (++evals > 200_000) throw new MathSolveError("Integral konvergiert nicht (Singularität im Intervall?).");
    const m = (a + b) / 2;
    const lm = (a + m) / 2;
    const rm = (m + b) / 2;
    const flm = f(lm);
    const frm = f(rm);
    const left = ((m - a) / 6) * (fa + 4 * flm + fm);
    const right = ((b - m) / 6) * (fm + 4 * frm + fb);
    const delta = left + right - whole;
    if (depth <= 0 || Math.abs(delta) <= 15 * tol) return left + right + delta / 15;
    return rec(a, m, fa, flm, fm, left, tol / 2, depth - 1) + rec(m, b, fm, frm, fb, right, tol / 2, depth - 1);
  };
  const r = rec(a, b, fa, fm, fb, whole, tol, 48);
  if (!Number.isFinite(r)) throw new MathSolveError("Integrand im Intervall nicht endlich (Polstelle?).");
  return r;
}

/* -------------------------------------------------------------------------- */
/* DGL                                                                        */
/* -------------------------------------------------------------------------- */

type Deriv = (x: number, y: number[]) => number[];

function rk4(f: Deriv, x0: number, y0: number[], x1: number, steps = 4000): { xs: number[]; ys: number[][] } {
  const h = (x1 - x0) / steps;
  const xs = [x0];
  const ys = [y0];
  let y = y0;
  let x = x0;
  for (let i = 0; i < steps; i++) {
    const k1 = f(x, y);
    const k2 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k1[j]));
    const k3 = f(x + h / 2, y.map((v, j) => v + (h / 2) * k2[j]));
    const k4 = f(x + h, y.map((v, j) => v + h * k3[j]));
    y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    x = x0 + (i + 1) * h;
    if (!y.every(Number.isFinite)) throw new MathSolveError(`Lösung divergiert bei x ≈ ${fmt(x, 4)}.`);
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

const num = (v: number) => {
  const r = fmt(v, 12);
  return r < 0 ? `(${r})` : `${r}`;
};

interface LinearOde {
  ausdruck: string;
  latex: string;
  fall: string;
  charakteristischeGleichung: string;
  wurzeln: { re: number; im: number }[];
  kennwerte?: Record<string, number>;
  y: (x: number) => number;
}

function solveLinearOde(c: number[], r: number, x0: number, y0: number, dy0: number | undefined, v: string): LinearOde {
  const s = x0 === 0 ? v : `(${v} - ${num(x0)})`;
  if (c.length === 2) {
    const [a1, a0] = c;
    if (a1 === 0) throw new MathSolveError("Koeffizient vor y' darf nicht 0 sein.");
    if (a0 === 0) {
      const k = r / a1;
      const expr = P(`${num(y0)} + ${num(k)} * ${s}`);
      return {
        ...exprOut(simplify(expr)),
        fall: "y' = konstant: Gerade",
        charakteristischeGleichung: `${fmt(a1)}·λ = 0`,
        wurzeln: [{ re: 0, im: 0 }],
        y: (x) => y0 + k * (x - x0),
      };
    }
    const yp = r / a0;
    const lam = -a0 / a1;
    const C = y0 - yp;
    const expr = P(`${num(yp)} + ${num(C)} * exp(${num(lam)} * ${s})`);
    return {
      ...exprOut(expr),
      fall: lam < 0 ? "exponentiell abklingend" : "exponentiell wachsend",
      charakteristischeGleichung: `${fmt(a1)}·λ + ${fmt(a0)} = 0`,
      wurzeln: [{ re: fmt(lam), im: 0 }],
      kennwerte: { zeitkonstante: fmt(Math.abs(1 / lam)), endwert: lam < 0 ? fmt(yp) : Number.NaN },
      y: (x) => yp + C * Math.exp(lam * (x - x0)),
    };
  }

  const [a2, a1, a0] = c;
  if (a2 === 0) throw new MathSolveError("Koeffizient vor y'' darf nicht 0 sein (sonst Ordnung 1 angeben).");
  if (dy0 === undefined) throw new MathSolveError("Ordnung 2 braucht y'(x0) als zweiten Anfangswert.");
  // Partikuläre Lösung für konstante rechte Seite.
  let yp: (x: number) => number;
  let dyp: (x: number) => number;
  let ypStr: string;
  if (a0 !== 0) {
    const k = r / a0;
    yp = () => k;
    dyp = () => 0;
    ypStr = num(k);
  } else if (a1 !== 0) {
    const k = r / a1;
    yp = (x) => k * (x - x0);
    dyp = () => k;
    ypStr = `${num(k)} * ${s}`;
  } else {
    const k = r / (2 * a2);
    yp = (x) => k * (x - x0) ** 2;
    dyp = (x) => 2 * k * (x - x0);
    ypStr = `${num(k)} * ${s}^2`;
  }
  const Y0 = y0 - yp(x0);
  const Y1 = dy0 - dyp(x0);
  const D = a1 * a1 - 4 * a2 * a0;
  const scaleD = Math.max(a1 * a1, Math.abs(4 * a2 * a0), 1e-300);
  const kennwerte: Record<string, number> = {};
  if (a2 > 0 && a0 > 0 && a1 >= 0) {
    kennwerte.eigenkreisfrequenz_ungedaempft = fmt(Math.sqrt(a0 / a2));
    kennwerte.daempfungsgrad = fmt(a1 / (2 * Math.sqrt(a0 * a2)));
  }
  const char = `${fmt(a2)}·λ² + ${fmt(a1)}·λ + ${fmt(a0)} = 0`;

  if (Math.abs(D) <= 1e-12 * scaleD) {
    const l = -a1 / (2 * a2);
    const C1 = Y0;
    const C2 = Y1 - l * Y0;
    const expr = P(`${ypStr} + (${num(C1)} + ${num(C2)} * ${s}) * exp(${num(l)} * ${s})`);
    return {
      ...exprOut(expr),
      fall: "doppelte reelle Wurzel (aperiodischer Grenzfall)",
      charakteristischeGleichung: char,
      wurzeln: [{ re: fmt(l), im: 0 }, { re: fmt(l), im: 0 }],
      kennwerte,
      y: (x) => yp(x) + (C1 + C2 * (x - x0)) * Math.exp(l * (x - x0)),
    };
  }
  if (D > 0) {
    const sq = Math.sqrt(D);
    const l1 = (-a1 + sq) / (2 * a2);
    const l2 = (-a1 - sq) / (2 * a2);
    const C2 = (Y1 - l1 * Y0) / (l2 - l1);
    const C1 = Y0 - C2;
    const expr = P(`${ypStr} + ${num(C1)} * exp(${num(l1)} * ${s}) + ${num(C2)} * exp(${num(l2)} * ${s})`);
    return {
      ...exprOut(expr),
      fall: "zwei reelle Wurzeln (Kriechfall / aperiodisch)",
      charakteristischeGleichung: char,
      wurzeln: [{ re: fmt(l1), im: 0 }, { re: fmt(l2), im: 0 }],
      kennwerte,
      y: (x) => yp(x) + C1 * Math.exp(l1 * (x - x0)) + C2 * Math.exp(l2 * (x - x0)),
    };
  }
  const sigma = -a1 / (2 * a2);
  const omega = Math.sqrt(-D) / (2 * Math.abs(a2));
  const C1 = Y0;
  const C2 = (Y1 - sigma * Y0) / omega;
  const env = sigma === 0 ? "" : `exp(${num(sigma)} * ${s}) * `;
  const expr = P(`${ypStr} + ${env}(${num(C1)} * cos(${num(omega)} * ${s}) + ${num(C2)} * sin(${num(omega)} * ${s}))`);
  kennwerte.eigenkreisfrequenz_gedaempft = fmt(omega);
  return {
    ...exprOut(expr),
    fall: sigma === 0 ? "rein imaginäre Wurzeln (ungedämpfte Schwingung)" : "konjugiert komplexe Wurzeln (gedämpfte Schwingung)",
    charakteristischeGleichung: char,
    wurzeln: [{ re: fmt(sigma), im: fmt(omega) }, { re: fmt(sigma), im: fmt(-omega) }],
    kennwerte,
    y: (x) =>
      yp(x) +
      Math.exp(sigma * (x - x0)) * (C1 * Math.cos(omega * (x - x0)) + C2 * Math.sin(omega * (x - x0))),
  };
}

/* -------------------------------------------------------------------------- */
/* Matrizen                                                                   */
/* -------------------------------------------------------------------------- */

function rank(A: number[][]): number {
  const M = A.map((r) => [...r]);
  const rows = M.length;
  const cols = M[0]?.length ?? 0;
  const norm = Math.max(1e-300, ...M.flat().map(Math.abs));
  let rk = 0;
  for (let c = 0; c < cols && rk < rows; c++) {
    let piv = rk;
    for (let r = rk + 1; r < rows; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) <= 1e-10 * norm) continue;
    [M[rk], M[piv]] = [M[piv], M[rk]];
    for (let r = rk + 1; r < rows; r++) {
      const f = M[r][c] / M[rk][c];
      for (let k = c; k < cols; k++) M[r][k] -= f * M[rk][k];
    }
    rk++;
  }
  return rk;
}

const roundMatrix = (A: number[][]) => A.map((r) => r.map((v) => fmt(Math.abs(v) < 1e-13 ? 0 : v)));
const isSquare = (A: number[][]) => A.length > 0 && A.every((r) => r.length === A.length);
const toCx = (v: unknown) =>
  typeof v === "number" ? { re: fmt(v), im: 0 } : { re: fmt((v as { re: number }).re), im: fmt((v as { im: number }).im) };

/* -------------------------------------------------------------------------- */
/* Schnittstelle                                                              */
/* -------------------------------------------------------------------------- */

const matrix = z.array(z.array(z.number()).min(1).max(8)).min(1).max(8);

export const mathInputSchema = z.object({
  aufgabe: z.enum(["ableitung", "integral", "dgl", "matrix", "nullstellen", "auswerten"]),
  ausdruck: z.string().max(MAX_LEN).optional().describe('z. B. "x^3*sin(x)", "3*x^2 + 2*x", "exp(-2*t)"'),
  variable: z.string().regex(/^[a-zA-Z]$/).optional().describe('Standard "x"'),
  ordnung: z.number().int().min(1).max(4).optional().describe("Ableitungsordnung"),
  stelle: z.number().optional().describe("Auswerten an dieser Stelle"),
  von: z.number().optional(),
  bis: z.number().optional(),
  stammfunktion_kandidat: z.string().max(MAX_LEN).optional().describe("Deine Stammfunktion — wird durch Ableiten geprüft"),
  // DGL
  dgl: z
    .object({
      art: z.enum(["linear_konstant", "numerisch"]),
      koeffizienten: z
        .array(z.number())
        .min(2)
        .max(3)
        .optional()
        .describe("linear_konstant: [a1, a0] für a1·y' + a0·y = r oder [a2, a1, a0] für a2·y'' + a1·y' + a0·y = r"),
      rechte_seite: z.number().optional().describe("konstante rechte Seite r, Standard 0"),
      gleichung: z
        .string()
        .max(MAX_LEN)
        .optional()
        .describe('numerisch: rechte Seite von y\' = f(x, y) oder y\'\' = f(x, y, dy), z. B. "-2*y + sin(x)"'),
      ordnung: z.number().int().min(1).max(2).optional().describe("numerisch: 1 oder 2"),
      x0: z.number().optional(),
      y0: z.number(),
      dy0: z.number().optional().describe("y'(x0), nötig bei Ordnung 2"),
      x_ende: z.number().optional().describe("numerisch: bis wohin integrieren"),
    })
    .optional(),
  // Matrix
  matrix: z
    .object({
      operation: z.enum(["determinante", "inverse", "lgs", "eigenwerte", "rang", "transponiert", "produkt"]),
      A: matrix,
      B: matrix.optional(),
      b: z.array(z.number()).max(8).optional(),
    })
    .optional(),
  parameter: z.object({}).catchall(z.number()).optional().describe('Zahlenwerte für weitere Symbole, z. B. {"a": 2}'),
});

export type MathInput = z.infer<typeof mathInputSchema>;
export type MathResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

const LIMITS =
  "Abgedeckt: Ableitungen, Stammfunktionen elementarer Funktionen (linear zusammengesetzt, " +
  "innere Funktion linear), bestimmte Integrale numerisch, lineare DGL mit konstanten " +
  "Koeffizienten bis Ordnung 2 (konstante rechte Seite) und DGL numerisch, Matrizen bis 8×8, " +
  "Nullstellen. NICHT abgedeckt: partielle Integration/Substitution als Rechenweg, " +
  "Grenzwerte, Reihen, partielle DGL, symbolische Matrizen.";

export function solveMath(raw: MathInput): MathResult {
  try {
    const input = mathInputSchema.parse(raw);
    return run(input);
  } catch (err) {
    if (err instanceof MathSolveError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) {
      return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    }
    throw err;
  }
}

function run(input: MathInput): MathResult {
  const v = input.variable ?? "x";
  const params = input.parameter ?? {};
  for (const k of Object.keys(params)) {
    // Nur einfache Namen, und keine, die Funktionen oder Konstanten verdecken.
    if (!/^[a-zA-Z]\w{0,9}$/.test(k) || FUNCTIONS.has(k) || CONSTANTS.has(k) || k === v) {
      throw new MathSolveError(`Parametername "${k}" nicht erlaubt.`);
    }
    if (!Number.isFinite(params[k])) throw new MathSolveError(`Parameter "${k}" ist keine Zahl.`);
  }
  const vars = [v, ...Object.keys(params)];
  const withParams = (n: Node): Node => {
    if (!Object.keys(params).length) return n;
    return n.transform((c) => {
      const node = c as Node;
      return node.type === "SymbolNode" && node.name! in params ? new math.ConstantNode(params[node.name!]) : c;
    }) as Node;
  };
  const need = (s: string | undefined, what: string) => {
    if (!s) throw new MathSolveError(`${what} fehlt.`);
    return withParams(parseExpr(s, vars));
  };

  switch (input.aufgabe) {
    case "auswerten": {
      const f = need(input.ausdruck, "ausdruck");
      if (input.stelle === undefined && dependsOn(f, v)) throw new MathSolveError("stelle fehlt.");
      const val = evalAt(f, { [v]: input.stelle ?? 0 });
      if (!Number.isFinite(val)) throw new MathSolveError("Ausdruck an dieser Stelle nicht definiert.");
      return { ok: true, ...exprOut(f), stelle: input.stelle, wert: fmt(val) };
    }

    case "ableitung": {
      const f = need(input.ausdruck, "ausdruck");
      const order = input.ordnung ?? 1;
      const d = differentiate(f, v, order);
      // Probe (1. Ableitung) gegen den zentralen Differenzenquotienten.
      if (order === 1) {
        const d1 = d;
        const pts = SAMPLES.filter((x) => Number.isFinite(evalAt(d1, { [v]: x })));
        const bad = pts.find((x) => {
          const sym = evalAt(d1, { [v]: x });
          const numd = numericDerivative(f, v, x);
          return Number.isFinite(numd) && Math.abs(sym - numd) > 1e-4 * Math.max(1, Math.abs(sym));
        });
        if (bad !== undefined) throw new MathSolveError("Interne Probe der Ableitung nicht bestanden.");
      }
      const out: Record<string, unknown> = { ok: true, funktion: exprOut(f), ordnung: order, ableitung: exprOut(d) };
      if (input.stelle !== undefined) out.wert_an_stelle = fmt(evalAt(d, { [v]: input.stelle }));
      return out as MathResult;
    }

    case "integral": {
      const f = need(input.ausdruck, "ausdruck");
      let F: Node | null = null;
      let quelle = "";
      if (input.stammfunktion_kandidat) {
        const cand = need(input.stammfunktion_kandidat, "stammfunktion_kandidat");
        const back = simplify(math.derivative(cand, v) as Node);
        if (sameFunction(back, f, v)) {
          F = cand;
          quelle = "Kandidat — durch Ableiten bestätigt";
        } else {
          quelle = "Kandidat FALSCH: seine Ableitung ist nicht der Integrand";
        }
      }
      if (!F) {
        const table = antiderivative(f, v);
        if (table) {
          const Fs = simplify(table);
          const back = simplify(math.derivative(Fs, v) as Node);
          if (sameFunction(back, f, v)) {
            F = Fs;
            quelle = quelle ? `${quelle}; Regeltabelle — durch Ableiten bestätigt` : "Regeltabelle — durch Ableiten bestätigt";
          }
        }
      }
      const out: Record<string, unknown> = {
        ok: true,
        integrand: exprOut(f),
        stammfunktion: F ? { ...exprOut(F), konstante: "+ C", quelle } : null,
        ...(F ? {} : { hinweis_stammfunktion: `${quelle ? `${quelle}. ` : ""}Keine geschlossene Form gefunden — nicht raten; bestimmte Integrale gehen numerisch.` }),
      };
      if (input.von !== undefined || input.bis !== undefined) {
        if (input.von === undefined || input.bis === undefined) throw new MathSolveError("von und bis angeben.");
        const a = input.von;
        const b = input.bis;
        const g = (x: number) => evalAt(f, { [v]: x });
        const numeric = a === b ? 0 : simpson(g, a, b);
        let exact: number | null = null;
        if (F) {
          const Fa = evalAt(F, { [v]: a });
          const Fb = evalAt(F, { [v]: b });
          if (Number.isFinite(Fa) && Number.isFinite(Fb)) exact = Fb - Fa;
        }
        if (exact !== null && Math.abs(exact - numeric) > 1e-6 * Math.max(1, Math.abs(exact))) {
          // Passiert z. B. bei einer Polstelle im Intervall: F ist dort nicht stetig.
          throw new MathSolveError(
            "Stammfunktion und numerisches Integral widersprechen sich — vermutlich Polstelle im Intervall.",
          );
        }
        out.bestimmtes_integral = {
          von: a,
          bis: b,
          wert: fmt(exact ?? numeric),
          verfahren: exact !== null ? "F(b) − F(a), numerisch bestätigt" : "numerisch (adaptives Simpson)",
        };
      }
      return out as MathResult;
    }

    case "dgl": {
      const d = input.dgl;
      if (!d) throw new MathSolveError("dgl-Angaben fehlen.");
      const x0 = d.x0 ?? 0;
      if (d.art === "linear_konstant") {
        if (!d.koeffizienten) throw new MathSolveError("koeffizienten fehlen.");
        const sol = solveLinearOde(d.koeffizienten, d.rechte_seite ?? 0, x0, d.y0, d.dy0, v);
        // Probe gegen Runge-Kutta auf [x0, x0 + 1] (bzw. bis zur Stelle).
        const xEnd = input.stelle ?? x0 + 1;
        const c = d.koeffizienten;
        const r = d.rechte_seite ?? 0;
        const f: Deriv =
          c.length === 2 ? (_x, [y]) => [(r - c[1] * y) / c[0]] : (_x, [y, dy]) => [dy, (r - c[1] * dy - c[2] * y) / c[0]];
        const y0v = c.length === 2 ? [d.y0] : [d.y0, d.dy0!];
        if (xEnd !== x0) {
          const { ys } = rk4(f, x0, y0v, xEnd);
          const yNum = ys[ys.length - 1][0];
          const yCl = sol.y(xEnd);
          if (Math.abs(yNum - yCl) > 1e-6 * Math.max(1, Math.abs(yCl))) {
            throw new MathSolveError("Interne Probe (Runge-Kutta) der DGL-Lösung nicht bestanden.");
          }
        }
        const { y, ...rest } = sol;
        return {
          ok: true,
          ...rest,
          anfangswerte: { x0, y0: d.y0, ...(d.dy0 !== undefined ? { dy0: d.dy0 } : {}) },
          ...(input.stelle !== undefined ? { wert_an_stelle: { [v]: input.stelle, y: fmt(y(input.stelle)) } } : {}),
          probe: "geschlossene Lösung mit Runge-Kutta (RK4) nachgerechnet",
        };
      }
      // numerisch
      if (!d.gleichung || d.x_ende === undefined) throw new MathSolveError("gleichung und x_ende angeben.");
      const order = d.ordnung ?? 1;
      const g = withParams(parseExpr(d.gleichung, [v, "y", "dy", ...Object.keys(params)]));
      const f: Deriv =
        order === 1
          ? (x, [y]) => [evalAt(g, { [v]: x, y })]
          : (x, [y, dy]) => [dy, evalAt(g, { [v]: x, y, dy })];
      if (order === 2 && d.dy0 === undefined) throw new MathSolveError("Ordnung 2 braucht dy0.");
      const y0v = order === 1 ? [d.y0] : [d.y0, d.dy0!];
      const fine = rk4(f, x0, y0v, d.x_ende, 4000);
      const coarse = rk4(f, x0, y0v, d.x_ende, 2000);
      const yF = fine.ys[fine.ys.length - 1][0];
      const yC = coarse.ys[coarse.ys.length - 1][0];
      const fehler = Math.abs(yF - yC) / 15; // Richardson-Abschätzung für RK4
      const table = Array.from({ length: 11 }, (_, i) => {
        const k = Math.round((i * 4000) / 10);
        return { [v]: fmt(fine.xs[k], 8), y: fmt(fine.ys[k][0], 8) };
      });
      return {
        ok: true,
        gleichung: `${order === 1 ? "y'" : "y''"} = ${g.toString()}`,
        verfahren: "Runge-Kutta 4. Ordnung, 4000 Schritte",
        endwert: { [v]: d.x_ende, y: fmt(yF) },
        fehlerabschaetzung: fmt(fehler, 3),
        tabelle: table,
      };
    }

    case "matrix": {
      const m = input.matrix;
      if (!m) throw new MathSolveError("matrix-Angaben fehlen.");
      const A = m.A;
      const cols = A[0].length;
      if (!A.every((r) => r.length === cols)) throw new MathSolveError("Alle Zeilen von A brauchen gleich viele Spalten.");
      const sq = isSquare(A);
      const needSquare = () => {
        if (!sq) throw new MathSolveError("Diese Operation braucht eine quadratische Matrix.");
      };
      switch (m.operation) {
        case "transponiert":
          return { ok: true, ergebnis: math.transpose(A) as number[][] };
        case "rang":
          return { ok: true, rang: rank(A), zeilen: A.length, spalten: cols };
        case "produkt": {
          if (!m.B) throw new MathSolveError("B fehlt.");
          if (m.B.length !== cols) throw new MathSolveError(`Spalten von A (${cols}) ≠ Zeilen von B (${m.B.length}).`);
          return { ok: true, ergebnis: roundMatrix(math.multiply(A, m.B) as number[][]) };
        }
        case "determinante": {
          needSquare();
          return { ok: true, determinante: fmt(Math.abs(math.det(A)) < 1e-12 ? 0 : math.det(A)) };
        }
        case "inverse": {
          needSquare();
          if (rank(A) < A.length) throw new MathSolveError("Matrix singulär (det = 0): keine Inverse.");
          const inv = math.inv(A) as number[][];
          const I = math.multiply(A, inv) as number[][];
          const err = Math.max(...I.flatMap((r, i) => r.map((x, j) => Math.abs(x - (i === j ? 1 : 0)))));
          if (err > 1e-8) throw new MathSolveError("Interne Probe A·A⁻¹ = E nicht bestanden (schlecht konditioniert).");
          return { ok: true, inverse: roundMatrix(inv), probe: "A·A⁻¹ = E geprüft" };
        }
        case "lgs": {
          needSquare();
          if (!m.b || m.b.length !== A.length) throw new MathSolveError("b fehlt oder passt nicht zu A.");
          const rA = rank(A);
          if (rA < A.length) {
            const rAb = rank(A.map((r, i) => [...r, m.b![i]]));
            return {
              ok: true,
              loesbar: rAb === rA,
              rang_A: rA,
              rang_Ab: rAb,
              aussage:
                rAb === rA
                  ? `unendlich viele Lösungen (${A.length - rA} freie Parameter)`
                  : "keine Lösung (Rang A < Rang [A|b])",
            };
          }
          const x = (math.lusolve(A, m.b) as number[][]).map((r) => r[0]);
          const res = Math.max(...A.map((r, i) => Math.abs(r.reduce((s, a, j) => s + a * x[j], 0) - m.b![i])));
          const scale = Math.max(1, ...m.b.map(Math.abs));
          if (res > 1e-9 * scale) throw new MathSolveError("Interne Probe A·x = b nicht bestanden.");
          return { ok: true, loesung: x.map((v) => fmt(v)), probe: "A·x − b ≈ 0 geprüft" };
        }
        case "eigenwerte": {
          needSquare();
          const e = math.eigs(A) as unknown as { values: unknown[]; eigenvectors?: { value: unknown; vector: unknown }[] };
          const values = (Array.isArray(e.values) ? e.values : (e.values as { toArray(): unknown[] }).toArray()).map(toCx);
          const vectors = (e.eigenvectors ?? []).map((ev) => ({
            eigenwert: toCx(ev.value),
            vektor: (Array.isArray(ev.vector) ? ev.vector : (ev.vector as { toArray(): unknown[] }).toArray()).map(toCx),
          }));
          return {
            ok: true,
            eigenwerte: values,
            eigenvektoren: vectors,
            hinweis: "Eigenvektoren sind auf Länge 1 normiert; jedes Vielfache ist ebenfalls Eigenvektor.",
          };
        }
      }
      break;
    }

    case "nullstellen": {
      const f = need(input.ausdruck, "ausdruck");
      if (input.von === undefined || input.bis === undefined || !(input.bis > input.von)) {
        throw new MathSolveError("Intervall von < bis angeben.");
      }
      const g = (x: number) => evalAt(f, { [v]: x });
      const N = 400;
      const roots: number[] = [];
      const h = (input.bis - input.von) / N;
      for (let i = 0; i < N && roots.length < 12; i++) {
        let a = input.von + i * h;
        let b = a + h;
        let fa = g(a);
        const fb = g(b);
        if (!Number.isFinite(fa) || !Number.isFinite(fb)) continue;
        if (fa === 0) {
          roots.push(a);
          continue;
        }
        if (fa * fb > 0) continue;
        // Polstelle statt Nullstelle? Dann wächst |f| beim Eingrenzen.
        for (let k = 0; k < 200; k++) {
          const mid = (a + b) / 2;
          const fm = g(mid);
          if (fa * fm <= 0) b = mid;
          else {
            a = mid;
            fa = fm;
          }
        }
        const x = (a + b) / 2;
        if (Math.abs(g(x)) < 1e-8 * Math.max(1, Math.abs(fa))) roots.push(x);
      }
      const unique = roots.filter((x, i) => i === 0 || Math.abs(x - roots[i - 1]) > 1e-9);
      return {
        ok: true,
        funktion: exprOut(f),
        intervall: [input.von, input.bis],
        nullstellen: unique.map((x) => fmt(x)),
        hinweis: "Gefunden werden Vorzeichenwechsel; doppelte Nullstellen ohne Vorzeichenwechsel (Berührpunkte) nicht.",
      };
    }
  }
  throw new MathSolveError("Unbekannte Aufgabe.");
}
