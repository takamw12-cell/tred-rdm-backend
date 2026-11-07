/**
 * Schulmathematik (Mittel- und Oberstufe) — exakt, in Schulschreibweise.
 *
 *   quadratisch  a·x² + b·x + c = 0 : Diskriminante, Lösungen (reell,
 *                doppelt, komplex), EXAKTE Form (x = 1 ± √2), p-q-Formel,
 *                Scheitelpunkt und Scheitelpunktform, Linearfaktoren ;
 *                Probe durch Einsetzen und Vieta ; Parabel als Diagramm
 *   pythagoras   a² + b² = c² : fehlende Seite (auch exakt: √2, 2√5) oder
 *                Prüfung, ob ein Dreieck rechtwinklig ist (Umkehrung)
 *
 * Ein Sprachmodell rundet √13 gern zu früh oder vertauscht das Vorzeichen
 * von p/2 — genau die Fehler, die in der Klassenarbeit Punkte kosten.
 */
import { z } from "zod";
import type { ChartSpec } from "../thermo-solver";
import { isNum, sig } from "./quantity";

export class SchoolMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchoolMathError";
  }
}
const fail = (m: string) => new SchoolMathError(m);

/* -------------------------------------------------------------------------- */
/* Exakte Darstellung                                                         */
/* -------------------------------------------------------------------------- */

const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/** Ganze Zahlen mit demselben Verhältnis (bis 6 Nachkommastellen), sonst null. */
function asIntegers(vals: number[]): number[] | null {
  for (let d = 0; d <= 6; d++) {
    const f = 10 ** d;
    const ints = vals.map((v) => Math.round(v * f));
    if (ints.every((n, i) => Math.abs(n - vals[i] * f) < 1e-9 * Math.max(1, Math.abs(vals[i] * f)) && Number.isSafeInteger(n))) {
      const g = ints.reduce((acc, n) => gcd(acc, n), 0) || 1;
      return ints.map((n) => n / g);
    }
  }
  return null;
}

/** √n = k·√m mit quadratfreiem m (n ≤ 10¹²). */
export function simplifySqrt(n: number): [number, number] | null {
  if (!Number.isSafeInteger(n) || n < 0 || n > 1e12) return null;
  if (n === 0) return [0, 1];
  for (let f = Math.floor(Math.sqrt(n)); f >= 1; f--) {
    if (n % (f * f) === 0) return [f, n / (f * f)];
  }
  return [1, n];
}

function frac(p: number, q: number): string {
  if (q < 0) [p, q] = [-p, -q];
  const g = gcd(p, q) || 1;
  [p, q] = [p / g, q / g];
  return q === 1 ? String(p) : `${p}/${q}`;
}

/** (B ± K·√m [·i]) / Den, gekürzt. */
function plusMinus(B: number, K: number, m: number, Den: number, imag: boolean): string {
  if (Den < 0) [B, Den] = [-B, -Den];
  const g = gcd(gcd(B, K), Den) || 1;
  [B, K, Den] = [B / g, K / g, Den / g];
  const rad = m === 1 ? "" : `√${m}`;
  const coef = K === 1 && (rad || imag) ? "" : String(K);
  const term = `${coef}${rad}${imag ? (rad ? "·i" : "i") : ""}`;
  if (B === 0) return Den === 1 ? `±${term}` : `±${term}/${Den}`;
  const head = `${B} ± ${term}`;
  return Den === 1 ? head : `(${head})/${Den}`;
}

const num = (v: number) => {
  const r = sig(v, 10);
  return String(r).replace(/e\+?/, "·10^");
};
const signed = (v: number) => (v < 0 ? `− ${num(-v)}` : `+ ${num(v)}`);

/* -------------------------------------------------------------------------- */
/* Quadratische Gleichung                                                     */
/* -------------------------------------------------------------------------- */

export interface QuadraticResult {
  typ: "quadratisch" | "linear";
  a: number;
  b: number;
  c: number;
  diskriminante?: number;
  anzahl: 0 | 1 | 2 | "unendlich";
  /** Reelle Lösungen, aufsteigend. */
  loesungen: number[];
  /** Bei D < 0: x = re ± im·i. */
  komplex?: { re: number; im: number };
  exakt?: string;
  scheitel?: { x: number; y: number };
  scheitelform?: string;
  linearfaktoren?: string;
  pq?: { p: number; q: number; rechnung: string };
  rechenweg: string[];
}

export function solveQuadratic(a: number, b: number, c: number): QuadraticResult {
  if (![a, b, c].every(isNum)) throw fail("a, b und c müssen Zahlen sein.");
  if (a === 0) {
    // Keine quadratische Gleichung: b·x + c = 0
    if (b === 0) {
      return { typ: "linear", a, b, c, anzahl: c === 0 ? "unendlich" : 0, loesungen: [], rechenweg: [c === 0 ? "0 = 0: jede Zahl ist Lösung." : `${num(c)} = 0 ist falsch: keine Lösung.`] };
    }
    const x = -c / b;
    const ints = asIntegers([b, c]);
    return {
      typ: "linear",
      a,
      b,
      c,
      anzahl: 1,
      loesungen: [x],
      ...(ints ? { exakt: `x = ${frac(-ints[1], ints[0])}` } : {}),
      rechenweg: [`a = 0: lineare Gleichung ${num(b)}·x ${signed(c)} = 0`, `x = −c / b = ${num(x)}`],
    };
  }

  const D = b * b - 4 * a * c;
  const xs = -b / (2 * a);
  const ys = c - (b * b) / (4 * a);
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  // Gerundete Eingaben (0,1 + 0,2) sollen nicht aus einer Doppellösung zwei machen.
  const Dc = Math.abs(D) < 1e-12 * scale * scale ? 0 : D;
  const p = b / a;
  const q = c / a;
  const rechenweg = [
    `D = b² − 4ac = (${num(b)})² − 4·(${num(a)})·(${num(c)}) = ${num(D)}`,
    Dc > 0 ? "D > 0: zwei reelle Lösungen" : Dc === 0 ? "D = 0: eine (doppelte) Lösung" : "D < 0: keine reelle Lösung (zwei komplexe)",
  ];
  const pqText =
    `Normalform x² ${signed(p)}·x ${signed(q)} = 0 ; p = ${num(p)}, q = ${num(q)} ; ` +
    `x₁,₂ = −p/2 ± √((p/2)² − q) = ${num(-p / 2)} ± √(${num((p / 2) ** 2 - q)})`;

  let loesungen: number[] = [];
  let komplex: QuadraticResult["komplex"];
  if (Dc > 0) {
    const s = Math.sqrt(D);
    // Numerisch stabil (kein Auslöschen bei b² ≫ 4ac).
    const q1 = -0.5 * (b + Math.sign(b || 1) * s);
    loesungen = [q1 / a, c / q1].sort((u, v) => u - v);
  } else if (Dc === 0) {
    loesungen = [xs];
  } else {
    komplex = { re: xs, im: Math.sqrt(-D) / Math.abs(2 * a) };
  }

  // Probe: Einsetzen und Vieta
  const f = (x: number) => a * x * x + b * x + c;
  for (const x of loesungen) {
    if (Math.abs(f(x)) > 1e-9 * (Math.abs(a) * x * x + Math.abs(b * x) + Math.abs(c) + 1e-300)) throw fail("Interne Probe (Einsetzen) nicht erfüllt.");
  }
  if (loesungen.length === 2) {
    const [x1, x2] = loesungen;
    if (Math.abs(x1 + x2 + p) > 1e-9 * Math.max(1, Math.abs(p))) throw fail("Interne Probe (Vieta, Summe) nicht erfüllt.");
    if (Math.abs(x1 * x2 - q) > 1e-9 * Math.max(1, Math.abs(q))) throw fail("Interne Probe (Vieta, Produkt) nicht erfüllt.");
  }

  // Exakte Form (ganzzahlige oder endliche Dezimal-Koeffizienten)
  let exakt: string | undefined;
  const ints = asIntegers([a, b, c]);
  if (ints) {
    const [A, B, C] = ints;
    const DI = B * B - 4 * A * C;
    const root = Number.isSafeInteger(DI) ? simplifySqrt(Math.abs(DI)) : null;
    if (root) {
      const [k, m] = root;
      if (DI === 0) exakt = `x = ${frac(-B, 2 * A)}`;
      else if (DI > 0 && m === 1) {
        const r = [(-B - k) / (2 * A), (-B + k) / (2 * A)];
        const f1 = frac(-B - k, 2 * A);
        const f2 = frac(-B + k, 2 * A);
        exakt = r[0] <= r[1] ? `x₁ = ${f1}, x₂ = ${f2}` : `x₁ = ${f2}, x₂ = ${f1}`;
      } else exakt = `x₁,₂ = ${plusMinus(-B, k, m, 2 * A, DI < 0)}`;
    }
  }

  const fx = (v: number) => (v === 0 ? "x" : `(x ${signed(-v)})`);
  return {
    typ: "quadratisch",
    a,
    b,
    c,
    diskriminante: D,
    anzahl: Dc > 0 ? 2 : Dc === 0 ? 1 : 0,
    loesungen,
    ...(komplex ? { komplex } : {}),
    ...(exakt ? { exakt } : {}),
    scheitel: { x: xs, y: ys },
    scheitelform: `f(x) = ${a === 1 ? "" : a === -1 ? "−" : `${num(a)}·`}${fx(xs)}² ${signed(ys)}`.replace(/ \+ 0$/, ""),
    ...(loesungen.length
      ? { linearfaktoren: `f(x) = ${a === 1 ? "" : a === -1 ? "−" : `${num(a)}·`}${loesungen.length === 2 ? `${fx(loesungen[0])}·${fx(loesungen[1])}` : `${fx(loesungen[0])}²`}` }
      : {}),
    pq: { p, q, rechnung: pqText },
    rechenweg,
  };
}

export function parabolaChart(r: QuadraticResult, points = 41): ChartSpec {
  if (r.typ !== "quadratisch" || !r.scheitel) throw fail("Diagramm nur für quadratische Funktionen.");
  const { a, b, c } = r;
  const xs = r.scheitel.x;
  const w = r.loesungen.length === 2 ? Math.max(1.6 * Math.abs(r.loesungen[1] - xs), 1) : Math.max(2, 1.6 * Math.sqrt(Math.abs(r.scheitel.y / a)));
  const data = Array.from({ length: points }, (_, k) => {
    const x = xs - w + (2 * w * k) / (points - 1);
    return { x: sig(x, 6), y: sig(a * x * x + b * x + c, 6) };
  });
  return {
    type: "scatter",
    title: `f(x) = ${num(a)}x² ${signed(b)}x ${signed(c)}`,
    xLabel: "x",
    yLabel: "f(x)",
    series: [
      { label: "f(x)", line: true, data },
      ...(r.loesungen.length ? [{ label: "Nullstellen", data: r.loesungen.map((x) => ({ x: sig(x, 6), y: 0 })) }] : []),
      { label: "Scheitelpunkt S", data: [{ x: sig(xs, 6), y: sig(r.scheitel.y, 6) }] },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Pythagoras                                                                 */
/* -------------------------------------------------------------------------- */

export interface PythagorasResult {
  a: number;
  b: number;
  c: number;
  gesucht: "a" | "b" | "c" | null;
  exakt?: string;
  rechtwinklig?: boolean;
  rechnung: string;
}

/** a, b Katheten, c Hypotenuse. Zwei gegeben → dritte ; drei gegeben → Umkehrung prüfen. */
export function solvePythagoras(s: { a?: number; b?: number; c?: number }): PythagorasResult {
  const given = (["a", "b", "c"] as const).filter((k) => isNum(s[k]));
  for (const k of given) if (!(s[k]! > 0)) throw fail(`Die Seite ${k} muss positiv sein.`);
  if (given.length < 2) throw fail("Mindestens zwei Seiten angeben (c = Hypotenuse, gegenüber dem rechten Winkel).");
  if (given.length === 3) {
    const { a, b, c } = s as { a: number; b: number; c: number };
    const [lhs, rhs] = [a * a + b * b, c * c];
    const ok = Math.abs(lhs - rhs) <= 1e-9 * rhs;
    return {
      a,
      b,
      c,
      gesucht: null,
      rechtwinklig: ok,
      rechnung: `a² + b² = ${num(lhs)}, c² = ${num(rhs)} → ${ok ? "gleich: das Dreieck ist rechtwinklig (Umkehrung des Satzes)" : "verschieden: NICHT rechtwinklig mit c als Hypotenuse"}`,
    };
  }
  const exact = (sq: number, name: string) => {
    const ints = asIntegers([sq]);
    if (!ints || !Number.isSafeInteger(sq) || Math.abs(sq - Math.round(sq)) > 1e-9) return undefined;
    const r = simplifySqrt(Math.round(sq));
    if (!r) return undefined;
    const [k, m] = r;
    return m === 1 ? `${name} = ${k}` : `${name} = ${k === 1 ? "" : k}√${m}`;
  };
  if (!isNum(s.c)) {
    const sq = s.a! ** 2 + s.b! ** 2;
    return { a: s.a!, b: s.b!, c: Math.sqrt(sq), gesucht: "c", exakt: exact(sq, "c"), rechnung: `c = √(a² + b²) = √(${num(s.a! ** 2)} + ${num(s.b! ** 2)}) = √${num(sq)}` };
  }
  const known = isNum(s.a) ? "a" : "b";
  const leg = s[known]!;
  if (!(s.c > leg)) throw fail(`Die Hypotenuse c muss länger sein als die Kathete ${known} (c = ${num(s.c)}, ${known} = ${num(leg)}).`);
  const sq = s.c ** 2 - leg ** 2;
  const other = known === "a" ? "b" : "a";
  const val = Math.sqrt(sq);
  return {
    a: known === "a" ? leg : val,
    b: known === "b" ? leg : val,
    c: s.c,
    gesucht: other,
    exakt: exact(sq, other),
    rechnung: `${other} = √(c² − ${known}²) = √(${num(s.c ** 2)} − ${num(leg ** 2)}) = √${num(sq)}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Werkzeug                                                                   */
/* -------------------------------------------------------------------------- */

export const schoolInputSchema = z.object({
  aufgabe: z.enum(["quadratisch", "pythagoras"]),
  a: z.number().optional().describe("quadratisch: Koeffizient von x² ; pythagoras: Kathete a"),
  b: z.number().optional().describe("quadratisch: Koeffizient von x ; pythagoras: Kathete b"),
  c: z.number().optional().describe("quadratisch: absolutes Glied ; pythagoras: Hypotenuse c"),
});
export type SchoolInput = z.infer<typeof schoolInputSchema>;

const LIMITS =
  "Abgedeckt: quadratische Gleichungen a·x² + b·x + c = 0 (Mitternachts- und p-q-Formel, exakte Form, Scheitelpunkt) " +
  "und der Satz des Pythagoras mit Umkehrung. Alles andere (Ableitungen, Gleichungssysteme, Nullstellen beliebiger " +
  "Funktionen) → mathe_berechnen ; einzelne Zahlen → rechnen.";

export type SchoolResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

export function solveSchoolMath(raw: SchoolInput): SchoolResult {
  try {
    const input = schoolInputSchema.parse(raw);
    if (input.aufgabe === "quadratisch") {
      if (!isNum(input.a) || !isNum(input.b) || !isNum(input.c)) throw fail("a, b und c angeben (fehlendes Glied = 0).");
      const r = solveQuadratic(input.a, input.b, input.c);
      return {
        ok: true,
        typ: r.typ,
        ...(r.diskriminante !== undefined ? { diskriminante: sig(r.diskriminante) } : {}),
        anzahl_loesungen: r.anzahl,
        loesungen: r.loesungen.map((x) => sig(x)),
        ...(r.komplex ? { komplex: `x = ${num(r.komplex.re)} ± ${num(r.komplex.im)}·i` } : {}),
        ...(r.exakt ? { exakt: r.exakt } : {}),
        ...(r.scheitel ? { scheitelpunkt: { x: sig(r.scheitel.x), y: sig(r.scheitel.y) } } : {}),
        ...(r.scheitelform ? { scheitelform: r.scheitelform } : {}),
        ...(r.linearfaktoren ? { linearfaktoren: r.linearfaktoren } : {}),
        ...(r.pq ? { pq_formel: r.pq.rechnung } : {}),
        rechenweg: r.rechenweg,
        ...(r.typ === "quadratisch" ? { diagramme: [parabolaChart(r)] } : {}),
      };
    }
    const r = solvePythagoras({ a: input.a, b: input.b, c: input.c });
    return {
      ok: true,
      a: sig(r.a),
      b: sig(r.b),
      c: sig(r.c),
      gesucht: r.gesucht,
      ...(r.exakt ? { exakt: r.exakt } : {}),
      ...(r.rechtwinklig !== undefined ? { rechtwinklig: r.rechtwinklig } : {}),
      rechnung: r.rechnung,
      formel: "a² + b² = c² (c = Hypotenuse)",
    };
  } catch (err) {
    if (err instanceof SchoolMathError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    throw err;
  }
}
