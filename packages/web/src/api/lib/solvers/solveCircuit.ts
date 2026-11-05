/**
 * solveCircuit — Elektrotechnik, linear, Gleich- und Wechselstrom.
 *
 * ── Warum ein eigener Löser ────────────────────────────────────────────────
 * Ein Sprachmodell stellt die Maschengleichungen meist richtig auf und rechnet
 * sie dann falsch: ein Vorzeichen in der dritten Masche, ein vergessener
 * Parallelzweig, ein Betrag statt eines Zeigers. Hier rechnet der Code, das
 * Modell erklärt.
 *
 * ── Verfahren: Modifizierte Knotenanalyse (MNA) ────────────────────────────
 * Unbekannte sind die Knotenpotentiale (Bezug: Masse) und zusätzlich der
 * Strom jeder Zweigspannungs-Bedingung (Spannungsquelle, Kurzschluss,
 * Spule bei DC, OPV-Ausgang). Jede Zeile ist entweder die Knotenregel
 * (Σ abfließende Ströme = eingespeiste Ströme) oder eine Zweigbedingung
 * (φa − φb = U, bzw. φ+ = φ− beim idealen OPV). Gerechnet wird komplex;
 * Gleichstrom ist der Sonderfall ω = 0 (L → Kurzschluss, C → Leerlauf).
 *
 * Die Maschenregel ist damit automatisch erfüllt (jede Spannung ist eine
 * Potentialdifferenz). Die Knotenregel und die Leistungsbilanz werden nach
 * der Lösung UNABHÄNGIG nachgeprüft und mit ausgegeben — ein Ergebnis, das
 * die eigene Probe nicht besteht, verlässt diesen Löser nicht.
 *
 * ── Zählpfeile ─────────────────────────────────────────────────────────────
 * Für JEDES Element gilt das Verbraucherzählpfeilsystem (VZS) von a nach b:
 *   U = φa − φb,   I fließt im Element von a nach b,   P = Re(U·I*).
 * P > 0: das Element nimmt Leistung auf; P < 0: es gibt Leistung ab (Quelle).
 *
 * Spannungsquelle V: a ist der Pluspol, φa − φb = Wert.
 * Stromquelle I:     treibt den Strom Wert IN den Knoten a (in der Quelle von
 *                    b nach a); im VZS ist ihr Strom daher −Wert.
 *
 * ── Grenzen (werden ehrlich gemeldet, nicht geraten) ───────────────────────
 * Nur lineare Bauelemente und eine einzige Frequenz. Dioden, Transistoren,
 * OPV in Sättigung oder ohne Gegenkopplung, Schaltvorgänge (Ein-/Ausschalten)
 * und Oberschwingungen sind NICHT abgedeckt.
 */
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Komplexe Zahlen                                                            */
/* -------------------------------------------------------------------------- */

export interface Cx {
  re: number;
  im: number;
}

const cx = (re: number, im = 0): Cx => ({ re, im });
const ZERO = cx(0);
const add = (a: Cx, b: Cx): Cx => cx(a.re + b.re, a.im + b.im);
const sub = (a: Cx, b: Cx): Cx => cx(a.re - b.re, a.im - b.im);
const mul = (a: Cx, b: Cx): Cx => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const scale = (a: Cx, k: number): Cx => cx(a.re * k, a.im * k);
const conj = (a: Cx): Cx => cx(a.re, -a.im);
const abs = (a: Cx): number => Math.hypot(a.re, a.im);
function div(a: Cx, b: Cx): Cx {
  const d = b.re * b.re + b.im * b.im;
  if (d === 0) throw new CircuitError("Division durch null (Impedanz 0).");
  return cx((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d);
}
const fromPolar = (mag: number, deg: number): Cx => {
  const r = (deg * Math.PI) / 180;
  return cx(mag * Math.cos(r), mag * Math.sin(r));
};

/* -------------------------------------------------------------------------- */
/* Eingabe                                                                    */
/* -------------------------------------------------------------------------- */

export class CircuitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitError";
  }
}

const PREFIX: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  μ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  meg: 1e6,
  G: 1e9,
};

/**
 * "4.7k", "4,7 kΩ", "4k7", "100nF", "10 mH", "2.2e3", 1500 → Zahl in SI.
 * Groß-/Kleinschreibung zählt beim Präfix (m = milli, M = Mega), nicht bei
 * der Einheit.
 */
export function parseSi(value: number | string): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CircuitError(`Ungültiger Zahlenwert: ${value}`);
    return value;
  }
  let s = String(value).trim().replace(/\s+/g, "");
  // Einheit am Ende entfernen (Ω, Ohm, V, A, F, H, W, S, Hz).
  // Ein vorangestelltes "m" bleibt Präfix: "10mH" → "10m".
  s = s.replace(/(ohm|Ω|hz|v|a|f|h|w|s)$/i, "");
  // 4k7 / 4R7 / 2M2 (Bauteil-Schreibweise).
  const inline = /^(\d+)([pnuµμmkKMGR])(\d+)$/.exec(s);
  if (inline) {
    const [, a, p, b] = inline;
    const factor = p === "R" ? 1 : PREFIX[p];
    return Number(`${a}.${b}`) * factor;
  }
  const m = /^([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)(meg|[pnuµμmkKMG])?$/i.exec(s);
  if (!m) throw new CircuitError(`Wert nicht lesbar: "${value}"`);
  const num = Number(m[1].replace(",", "."));
  const pre = m[2];
  // Bei Präfixen zählt die Schreibweise: m ≠ M. "meg" darf beliebig sein.
  const factor = pre ? (pre.toLowerCase() === "meg" ? 1e6 : PREFIX[pre]) : 1;
  if (factor === undefined || !Number.isFinite(num)) {
    throw new CircuitError(`Wert nicht lesbar: "${value}"`);
  }
  return num * factor;
}

const value = z.union([z.number(), z.string().max(40)]);

export const circuitElementSchema = z.discriminatedUnion("typ", [
  z.object({
    typ: z.enum(["R", "L", "C"]),
    name: z.string().min(1).max(20),
    a: z.string().min(1).max(20),
    b: z.string().min(1).max(20),
    wert: value.describe('In SI oder mit Präfix: 4700, "4.7k", "100n", "10mH"'),
  }),
  z.object({
    typ: z.literal("Z"),
    name: z.string().min(1).max(20),
    a: z.string().min(1).max(20),
    b: z.string().min(1).max(20),
    re: z.number().describe("Realteil in Ohm"),
    im: z.number().describe("Imaginärteil in Ohm (induktiv > 0)"),
  }),
  z.object({
    typ: z.enum(["V", "I"]),
    name: z.string().min(1).max(20),
    a: z.string().min(1).max(20).describe("V: Pluspol. I: Knoten, IN den der Strom eingespeist wird"),
    b: z.string().min(1).max(20),
    wert: value.describe("Spannung in V bzw. Strom in A (bei AC: Betrag)"),
    phase: z.number().optional().describe("Nullphase in Grad (nur AC), Standard 0"),
  }),
  z.object({
    typ: z.literal("OPV"),
    name: z.string().min(1).max(20),
    plus: z.string().min(1).max(20),
    minus: z.string().min(1).max(20),
    aus: z.string().min(1).max(20),
    ub: z.number().positive().optional().describe("Betriebsspannung ±UB, nur zur Sättigungsprüfung"),
  }),
]);

export const circuitInputSchema = z.object({
  elemente: z.array(circuitElementSchema).min(1).max(60),
  masse: z.string().max(20).optional().describe('Bezugsknoten, Standard "0"'),
  frequenz: z.number().min(0).optional().describe("Hz. Weglassen oder 0 = Gleichstrom"),
  amplituden: z
    .enum(["effektiv", "scheitel"])
    .optional()
    .describe("Sind die Quellenwerte Effektiv- oder Scheitelwerte? Standard effektiv"),
  thevenin: z
    .object({ a: z.string().max(20), b: z.string().max(20) })
    .optional()
    .describe("Ersatzquelle an den Klemmen a–b. Die Last NICHT in die Elementliste aufnehmen."),
});

export type CircuitElement = z.infer<typeof circuitElementSchema>;
export type CircuitInput = z.infer<typeof circuitInputSchema>;

/* -------------------------------------------------------------------------- */
/* Ausgabe                                                                    */
/* -------------------------------------------------------------------------- */

export interface Phasor {
  re: number;
  im: number;
  betrag: number;
  phaseGrad: number;
  /** Lesbar, z. B. "4.70 mA" (DC) oder "0.707 V ∠ -45.0°" (AC). */
  anzeige: string;
}

export interface ElementResult {
  name: string;
  typ: CircuitElement["typ"];
  /** Klemmen in Zählrichtung (VZS): U = φ(von) − φ(nach), I von → nach. */
  von: string;
  nach: string;
  spannung: Phasor;
  strom: Phasor;
  /** Wirkleistung (W), > 0 aufgenommen, < 0 abgegeben. */
  wirkleistung: number;
  /** Blindleistung (var), > 0 induktiv. Bei DC 0. */
  blindleistung: number;
  scheinleistung: number;
  /** Impedanz bei der Rechenfrequenz, nur für passive Elemente. */
  impedanz?: Phasor;
}

export interface CircuitResult {
  ok: true;
  modus: "DC" | "AC";
  frequenz: number;
  zaehlpfeile: string;
  knoten: { name: string; potential: Phasor }[];
  elemente: ElementResult[];
  kontrolle: {
    /** Größter Fehlbetrag der Knotenregel über alle Knoten (A). */
    knotenregelMaxFehler: number;
    /** Σ S aller Elemente (VA) — muss 0 sein (Tellegen). */
    leistungsbilanz: { P: number; Q: number };
    bestanden: boolean;
  };
  thevenin?: {
    klemmen: { a: string; b: string };
    leerlaufspannung: Phasor;
    innenimpedanz: Phasor | null;
    kurzschlussstrom: Phasor | null;
    /** Leistungsanpassung: Z_L = Z_i* ; P_max = |U_0|² / (4·Re Z_i). */
    anpassung: { lastimpedanz: Phasor; maxLeistung: number } | null;
    hinweis?: string;
  };
  warnungen: string[];
}

export interface CircuitFailure {
  ok: false;
  fehler: string;
  /** Was das Modell der/dem Studierenden ehrlich sagen soll. */
  hinweis: string;
}

/* -------------------------------------------------------------------------- */
/* Formatierung                                                               */
/* -------------------------------------------------------------------------- */

const roundSig = (v: number, sig = 10) => {
  if (v === 0 || !Number.isFinite(v)) return v;
  const r = Number(v.toPrecision(sig));
  return Object.is(r, -0) ? 0 : r;
};

const SI_STEPS: [number, string][] = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
  [1e-12, "p"],
];

export function siFormat(v: number, unit: string, digits = 3): string {
  if (v === 0) return `0 ${unit}`;
  const a = Math.abs(v);
  const [f, p] = SI_STEPS.find(([f]) => a >= f * 0.9995) ?? SI_STEPS[SI_STEPS.length - 1];
  return `${Number((v / f).toPrecision(digits))} ${p}${unit}`;
}

/** Unterhalb davon gilt ein Wert relativ zum größten als numerisches Rauschen. */
const clean = (v: number, ref: number) => (Math.abs(v) <= ref * 1e-12 ? 0 : v);

function phasor(z: Cx, unit: string, ac: boolean, ref = abs(z)): Phasor {
  const re = roundSig(clean(z.re, ref));
  const im = roundSig(clean(z.im, ref));
  const betrag = roundSig(Math.hypot(re, im));
  const phaseGrad = betrag === 0 ? 0 : roundSig((Math.atan2(im, re) * 180) / Math.PI, 8);
  const anzeige = ac
    ? `${siFormat(betrag, unit)} ∠ ${Number(phaseGrad.toFixed(1))}°`
    : siFormat(re, unit);
  return { re, im, betrag, phaseGrad, anzeige };
}

/* -------------------------------------------------------------------------- */
/* Lineares Gleichungssystem (komplex, Gauß mit Spaltenpivot)                 */
/* -------------------------------------------------------------------------- */

class SingularError extends Error {}

function solveLinear(A: Cx[][], rhs: Cx[]): Cx[] {
  const n = rhs.length;
  const M = A.map((row, i) => [...row, rhs[i]]);
  const norm = Math.max(1e-300, ...A.flat().map(abs));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (abs(M[r][col]) > abs(M[piv][col])) piv = r;
    if (abs(M[piv][col]) <= norm * 1e-12) throw new SingularError(String(col));
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = col + 1; r < n; r++) {
      const f = div(M[r][col], M[col][col]);
      if (f.re === 0 && f.im === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] = sub(M[r][c], mul(f, M[col][c]));
    }
  }
  const x: Cx[] = Array.from({ length: n }, () => ZERO);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s = sub(s, mul(M[r][c], x[c]));
    x[r] = div(s, M[r][r]);
  }
  return x;
}

/* -------------------------------------------------------------------------- */
/* Aufbereitung                                                               */
/* -------------------------------------------------------------------------- */

/** Ein Element, wie die Matrix es sieht. */
type Prepared =
  | { kind: "Y"; el: CircuitElement; a: string; b: string; y: Cx; z: Cx }
  /** Zweigbedingung φa − φb = u (Quelle, Kurzschluss, Spule bei DC). */
  | { kind: "U"; el: CircuitElement; a: string; b: string; u: Cx; z?: Cx }
  /** Stromquelle: speist j in a ein. */
  | { kind: "J"; el: CircuitElement; a: string; b: string; j: Cx }
  /** Leerlauf (C bei DC): kein Beitrag, Strom 0. */
  | { kind: "OPEN"; el: CircuitElement; a: string; b: string; z: Cx }
  | { kind: "OPV"; el: CircuitElement; plus: string; minus: string; aus: string };

const INF = cx(Number.POSITIVE_INFINITY);

function prepare(input: CircuitInput, omega: number): Prepared[] {
  const ac = omega > 0;
  return input.elemente.map((el): Prepared => {
    if (el.typ === "OPV") return { kind: "OPV", el, plus: el.plus, minus: el.minus, aus: el.aus };
    if (el.a === el.b) throw new CircuitError(`${el.name}: beide Anschlüsse am selben Knoten "${el.a}".`);
    if (el.typ === "Z") {
      const z = cx(el.re, el.im);
      if (el.re < 0) throw new CircuitError(`${el.name}: negativer Wirkwiderstand.`);
      if (abs(z) === 0) return { kind: "U", el, a: el.a, b: el.b, u: ZERO, z };
      return { kind: "Y", el, a: el.a, b: el.b, y: div(cx(1), z), z };
    }
    if (el.typ === "V" || el.typ === "I") {
      const mag = parseSi(el.wert);
      if (!ac && el.phase && el.phase % 180 !== 0) {
        throw new CircuitError(`${el.name}: Phase ist nur bei Wechselstrom sinnvoll (frequenz angeben).`);
      }
      const v = fromPolar(mag, el.phase ?? 0);
      return el.typ === "V"
        ? { kind: "U", el, a: el.a, b: el.b, u: v }
        : { kind: "J", el, a: el.a, b: el.b, j: v };
    }
    const w = parseSi(el.wert);
    if (!(w >= 0)) throw new CircuitError(`${el.name}: Wert muss ≥ 0 sein (ist ${el.wert}).`);
    if (el.typ === "R") {
      if (w === 0) return { kind: "U", el, a: el.a, b: el.b, u: ZERO, z: ZERO };
      return { kind: "Y", el, a: el.a, b: el.b, y: cx(1 / w), z: cx(w) };
    }
    if (el.typ === "L") {
      if (w === 0 || !ac) return { kind: "U", el, a: el.a, b: el.b, u: ZERO, z: cx(0, omega * w) };
      const z = cx(0, omega * w);
      return { kind: "Y", el, a: el.a, b: el.b, y: div(cx(1), z), z };
    }
    // C
    if (w === 0) return { kind: "OPEN", el, a: el.a, b: el.b, z: INF };
    if (!ac) return { kind: "OPEN", el, a: el.a, b: el.b, z: INF };
    const y = cx(0, omega * w);
    return { kind: "Y", el, a: el.a, b: el.b, y, z: div(cx(1), y) };
  });
}

/** Union-Find über Knotennamen. */
function unionFind() {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent.set(ra, rb);
    return true;
  };
  return { find, union };
}

/** Strukturprüfungen VOR der Rechnung: aussagekräftige Fehler statt "singulär". */
function checkTopology(prep: Prepared[], ground: string, nodes: string[], ac: boolean) {
  // 1. Masche aus idealen Spannungsquellen / Kurzschlüssen.
  const uf = unionFind();
  for (const p of prep) {
    if (p.kind !== "U") continue;
    if (!uf.union(p.a, p.b)) {
      throw new CircuitError(
        `Masche nur aus idealen Spannungsquellen/Kurzschlüssen (bei ${p.el.name}). ` +
          "Die Ströme darin sind unbestimmt — ein Innenwiderstand fehlt.",
      );
    }
  }

  // 2. Jeder Knoten braucht einen leitenden Weg zur Masse (Stromquellen und
  //    Leerläufe leiten nicht im Sinne der Potentialbestimmung).
  const conn = unionFind();
  for (const p of prep) {
    if (p.kind === "Y" || p.kind === "U") conn.union(p.a, p.b);
    if (p.kind === "OPV") conn.union(p.aus, ground);
  }
  const floating = nodes.filter((n) => conn.find(n) !== conn.find(ground));
  if (floating.length) {
    const onlyCaps = !ac && prep.some((p) => p.kind === "OPEN");
    throw new CircuitError(
      `Potential unbestimmt an Knoten ${floating.map((n) => `"${n}"`).join(", ")}: ` +
        (onlyCaps
          ? "bei Gleichstrom ist ein Kondensator ein Leerlauf, der Knoten hängt in der Luft."
          : "kein leitender Weg zur Masse (nur über Stromquellen oder gar nicht angeschlossen)."),
    );
  }
}

interface Solved {
  phi: Map<string, Cx>;
  /** Strom der Zweigbedingungen, Zählrichtung von a nach b durch das Element. */
  branch: Map<string, Cx>;
  /** Vom OPV-Ausgang IN die Schaltung gelieferter Strom. */
  opvOut: Map<string, Cx>;
}

function assembleAndSolve(prep: Prepared[], ground: string, nodes: string[], extra?: { a: string; b: string; j: Cx }): Solved {
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const branchEls = prep.filter((p) => p.kind === "U" || p.kind === "OPV");
  const N = nodes.length + branchEls.length;
  const A: Cx[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => ZERO));
  const rhs: Cx[] = Array.from({ length: N }, () => ZERO);
  const at = (n: string) => (n === ground ? -1 : idx.get(n)!);
  const addA = (r: number, c: number, v: Cx) => {
    if (r >= 0 && c >= 0) A[r][c] = add(A[r][c], v);
  };
  const addR = (r: number, v: Cx) => {
    if (r >= 0) rhs[r] = add(rhs[r], v);
  };

  const inject = (a: string, b: string, j: Cx) => {
    addR(at(a), j);
    addR(at(b), scale(j, -1));
  };

  let k = nodes.length;
  for (const p of prep) {
    if (p.kind === "Y") {
      const a = at(p.a);
      const b = at(p.b);
      addA(a, a, p.y);
      addA(b, b, p.y);
      addA(a, b, scale(p.y, -1));
      addA(b, a, scale(p.y, -1));
    } else if (p.kind === "J") {
      inject(p.a, p.b, p.j);
    } else if (p.kind === "U") {
      const a = at(p.a);
      const b = at(p.b);
      // Strom x_k fließt von a durch das Element nach b.
      addA(a, k, cx(1));
      addA(b, k, cx(-1));
      addA(k, a, cx(1));
      addA(k, b, cx(-1));
      rhs[k] = p.u;
      k++;
    } else if (p.kind === "OPV") {
      // x_k = Strom vom Knoten "aus" IN den OPV-Ausgang (Knotenregel),
      // Bedingung φ+ − φ− = 0 (ideal, mit Gegenkopplung).
      addA(at(p.aus), k, cx(1));
      addA(k, at(p.plus), cx(1));
      addA(k, at(p.minus), cx(-1));
      k++;
    }
  }
  if (extra) inject(extra.a, extra.b, extra.j);

  const x = solveLinear(A, rhs);
  const phi = new Map<string, Cx>([[ground, ZERO]]);
  nodes.forEach((n, i) => phi.set(n, x[i]));
  const branch = new Map<string, Cx>();
  const opvOut = new Map<string, Cx>();
  k = nodes.length;
  for (const p of prep) {
    if (p.kind === "U") branch.set(p.el.name, x[k++]);
    else if (p.kind === "OPV") opvOut.set(p.el.name, scale(x[k++], -1));
  }
  return { phi, branch, opvOut };
}

/* -------------------------------------------------------------------------- */
/* Hauptfunktion                                                              */
/* -------------------------------------------------------------------------- */

const LIMITS =
  "Abgedeckt sind lineare Netzwerke (R, L, C, Z, ideale Quellen, idealer OPV mit " +
  "Gegenkopplung) bei EINER Frequenz. Nicht abgedeckt: Dioden, Transistoren, " +
  "OPV-Sättigung/Komparator, Schaltvorgänge, Oberschwingungen.";

export function solveCircuit(raw: CircuitInput): CircuitResult | CircuitFailure {
  try {
    const input = circuitInputSchema.parse(raw);
    return solveCircuitUnsafe(input);
  } catch (err) {
    if (err instanceof CircuitError) {
      return { ok: false, fehler: err.message, hinweis: LIMITS };
    }
    if (err instanceof z.ZodError) {
      return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    }
    throw err;
  }
}

function solveCircuitUnsafe(input: CircuitInput): CircuitResult | CircuitFailure {
  const ground = input.masse ?? "0";
  const f = input.frequenz ?? 0;
  const ac = f > 0;
  const omega = 2 * Math.PI * f;
  const powerFactor = input.amplituden === "scheitel" ? 0.5 : 1;
  const warnungen: string[] = [];

  const names = new Set<string>();
  for (const el of input.elemente) {
    if (names.has(el.name)) throw new CircuitError(`Elementname doppelt: ${el.name}`);
    names.add(el.name);
  }

  const terminals = (el: CircuitElement) => (el.typ === "OPV" ? [el.plus, el.minus, el.aus] : [el.a, el.b]);
  const all = [...new Set(input.elemente.flatMap(terminals))];
  if (!all.includes(ground)) {
    throw new CircuitError(`Kein Element ist an der Masse "${ground}" angeschlossen.`);
  }
  const nodes = all.filter((n) => n !== ground);

  const prep = prepare(input, omega);
  checkTopology(prep, ground, nodes, ac);

  let sol: Solved;
  try {
    sol = assembleAndSolve(prep, ground, nodes);
  } catch (err) {
    if (err instanceof SingularError) {
      const opv = prep.some((p) => p.kind === "OPV");
      throw new CircuitError(
        opv
          ? "Gleichungssystem singulär: ein OPV hat vermutlich keine Gegenkopplung " +
              "(Komparatorbetrieb) — dann gilt U+ = U− nicht, das lineare Modell versagt."
          : "Gleichungssystem singulär: das Netzwerk ist unterbestimmt.",
      );
    }
    throw err;
  }

  const V = (n: string) => sol.phi.get(n) ?? ZERO;
  const maxPhi = Math.max(1e-300, ...[...sol.phi.values()].map(abs));

  const elemente: ElementResult[] = [];
  /** Σ der von jedem Knoten abfließenden Ströme. */
  const leaving = new Map<string, Cx>(all.map((n) => [n, ZERO]));
  const leave = (n: string, i: Cx) => leaving.set(n, add(leaving.get(n)!, i));
  let S = ZERO;

  // Erst alle Ströme, dann formatieren: Rauschen (1e-18 A) wird relativ zum
  // GRÖSSTEN Strom der Schaltung zu 0, nicht relativ zu sich selbst.
  const currentOf = (p: Prepared): Cx => {
    if (p.kind === "OPV") return sol.opvOut.get(p.el.name)!;
    if (p.kind === "Y") return mul(sub(V(p.a), V(p.b)), p.y);
    if (p.kind === "U") return sol.branch.get(p.el.name)!;
    if (p.kind === "J") return scale(p.j, -1);
    return ZERO;
  };
  // Bezugsgröße: auch wenn ÜBERALL kein Strom fließt (C bei DC), gibt
  // φ_max · Y_max die Größenordnung, unter der ein Strom Rauschen ist.
  const maxY = Math.max(0, ...prep.map((p) => (p.kind === "Y" ? abs(p.y) : 0)));
  const maxI = Math.max(1e-300, maxPhi * maxY, ...prep.map((p) => abs(currentOf(p))));

  for (const p of prep) {
    if (p.kind === "OPV") {
      const iOut = sol.opvOut.get(p.el.name)!;
      // Der Ausgang liefert iOut in den Knoten "aus" (aus der Masse gespeist).
      leave(p.aus, scale(iOut, -1));
      leave(ground, iOut);
      const u = V(p.aus);
      const el = p.el as Extract<CircuitElement, { typ: "OPV" }>;
      if (el.ub && abs(u) > el.ub) {
        warnungen.push(
          `${el.name}: |U_aus| = ${siFormat(abs(u), "V")} > UB = ${siFormat(el.ub, "V")} — ` +
            "der OPV wäre übersteuert, das Ergebnis ist so NICHT real.",
        );
      }
      // Leistung des OPV-Ausgangs (gegen Masse), VZS: Strom in den Ausgang.
      const s = scale(mul(u, conj(scale(iOut, -1))), powerFactor);
      S = add(S, s);
      elemente.push({
        name: el.name,
        typ: "OPV",
        von: el.aus,
        nach: ground,
        spannung: phasor(u, "V", ac, maxPhi),
        strom: phasor(scale(iOut, -1), "A", ac, maxI),
        wirkleistung: roundSig(s.re),
        blindleistung: roundSig(s.im),
        scheinleistung: roundSig(abs(s)),
      });
      continue;
    }
    const u = sub(V(p.a), V(p.b));
    const i = currentOf(p);
    leave(p.a, i);
    leave(p.b, scale(i, -1));
    const s = scale(mul(u, conj(i)), powerFactor);
    S = add(S, s);
    const passive = p.el.typ === "R" || p.el.typ === "L" || p.el.typ === "C" || p.el.typ === "Z";
    const z = "z" in p ? p.z : undefined;
    elemente.push({
      name: p.el.name,
      typ: p.el.typ,
      von: p.a,
      nach: p.b,
      spannung: phasor(u, "V", ac, maxPhi),
      strom: phasor(i, "A", ac, maxI),
      wirkleistung: roundSig(s.re),
      blindleistung: roundSig(s.im),
      scheinleistung: roundSig(abs(s)),
      ...(passive && z && Number.isFinite(z.re) ? { impedanz: phasor(z, "Ω", ac) } : {}),
    });
  }

  // Probe 1: Knotenregel an JEDEM Knoten, auch an der Masse.
  const kclMax = Math.max(...[...leaving.values()].map(abs));
  // Probe 2: Leistungsbilanz Σ S = 0.
  const sMag = Math.max(1e-300, ...elemente.map((e) => e.scheinleistung));
  const bestanden = kclMax <= maxI * 1e-9 + 1e-15 && abs(S) <= sMag * 1e-9 + 1e-15;
  if (!bestanden) {
    // Sollte nie passieren. Lieber keine Antwort als eine falsche.
    throw new CircuitError("Interne Probe nicht bestanden (Knotenregel/Leistungsbilanz).");
  }

  const result: CircuitResult = {
    ok: true,
    modus: ac ? "AC" : "DC",
    frequenz: f,
    zaehlpfeile:
      "Verbraucherzählpfeilsystem je Element: U = φ(von) − φ(nach), I von → nach, " +
      "P > 0 aufgenommen, P < 0 abgegeben." +
      (ac ? ` Leistungen für ${input.amplituden === "scheitel" ? "Scheitelwerte (½·Re U·I*)" : "Effektivwerte"}.` : ""),
    knoten: all.map((n) => ({ name: n, potential: phasor(V(n), "V", ac, maxPhi) })),
    elemente,
    kontrolle: {
      knotenregelMaxFehler: roundSig(clean(kclMax, maxI), 3),
      leistungsbilanz: { P: roundSig(clean(S.re, sMag), 3), Q: roundSig(clean(S.im, sMag), 3) },
      bestanden,
    },
    warnungen,
  };

  if (input.thevenin) result.thevenin = thevenin(input, prep, ground, nodes, sol, ac, powerFactor);
  return result;
}

function thevenin(
  input: CircuitInput,
  prep: Prepared[],
  ground: string,
  nodes: string[],
  sol: Solved,
  ac: boolean,
  powerFactor: number,
): NonNullable<CircuitResult["thevenin"]> {
  const { a, b } = input.thevenin!;
  for (const n of [a, b]) {
    if (n !== ground && !nodes.includes(n)) throw new CircuitError(`Klemme "${n}" kommt im Netzwerk nicht vor.`);
  }
  if (a === b) throw new CircuitError("Thevenin: Klemmen a und b sind derselbe Knoten.");
  const V = (n: string) => sol.phi.get(n) ?? ZERO;
  const u0 = sub(V(a), V(b));

  // Unabhängige Quellen abschalten: U → Kurzschluss (u = 0), I → Leerlauf.
  // Abhängige Elemente (OPV) bleiben. Dann 1 A von b nach a einspeisen.
  const dead: Prepared[] = prep
    .filter((p) => p.kind !== "J")
    .map((p) => (p.kind === "U" ? { ...p, u: ZERO } : p));
  let zi: Cx | null = null;
  let hinweis: string | undefined;
  try {
    checkTopology(dead, ground, nodes, ac);
    const s = assembleAndSolve(dead, ground, nodes, { a, b, j: cx(1) });
    zi = sub(s.phi.get(a) ?? ZERO, s.phi.get(b) ?? ZERO);
  } catch (err) {
    if (!(err instanceof CircuitError || err instanceof SingularError)) throw err;
    hinweis = "Innenimpedanz unendlich (zwischen a und b nur Stromquellen): es gibt nur eine Norton-Ersatzquelle.";
  }
  const ziAbs = zi ? abs(zi) : 0;
  const ziZero = zi !== null && ziAbs <= 1e-12 * Math.max(1, abs(u0));
  if (ziZero) hinweis = "Innenimpedanz 0 (ideale Spannungsquelle an a–b): Kurzschlussstrom unendlich.";

  return {
    klemmen: { a, b },
    leerlaufspannung: phasor(u0, "V", ac),
    innenimpedanz: zi ? phasor(zi, "Ω", ac) : null,
    kurzschlussstrom: zi && !ziZero ? phasor(div(u0, zi), "A", ac) : null,
    anpassung:
      zi && !ziZero && zi.re > 0
        ? {
            lastimpedanz: phasor(conj(zi), "Ω", ac),
            maxLeistung: roundSig((powerFactor * abs(u0) ** 2) / (4 * zi.re)),
          }
        : null,
    ...(hinweis ? { hinweis } : {}),
  };
}
