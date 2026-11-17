/**
 * Exakte Probe eines Gleichstromnetzes — Bruchrechnung, keine Rundung.
 *
 * `solveCircuit` rechnet in Gleitkomma und prüft sich selbst auf 1e-9. Diese
 * Probe ist davon UNABHÄNGIG: eigener Aufbau des Gleichungssystems, eigene
 * Elimination, in rationalen Zahlen (BigInt). Danach wird JEDE Gleichung
 * eingesetzt und muss EXAKT 0 ergeben:
 *
 *   - Knotenregel an jedem Knoten (Masse eingeschlossen),
 *   - Maschenregel an jeder unabhängigen Masche (Fundamentalmaschen eines
 *     Spannbaums), mit den Quellspannungen aus der Netzliste und U = R·I,
 *   - und die Gleitkomma-Ergebnisse des Lösers müssen mit den exakten Werten
 *     übereinstimmen.
 *
 * Was sie beweist: das Ergebnis erfüllt die Kirchhoffschen Gesetze für DIESE
 * Netzliste, ohne Rundungsfehler. Was sie NICHT beweisen kann: dass die
 * Netzliste das Bild richtig wiedergibt — das leistet nur die Bestätigung
 * durch die Studierenden (netlist.ts).
 *
 * Abgedeckt: Gleichstrom mit R, L (Kurzschluss), C (Leerlauf), Z mit
 * Imaginärteil 0, idealen Quellen (Phase 0 oder 180°) und idealem OPV.
 * Wechselstrom (ω = 2πf ist irrational) bleibt bei der numerischen Probe.
 *
 * Modul rein: Server und Browser lesen es.
 */
import { parseSi, type CircuitElement, type CircuitInput, type CircuitResult } from "../solvers/solveCircuit";
import { LAWS, lawsFor, type Law, type LawId } from "./catalog";

/* -------------------------------------------------------------------------- */
/* Rationale Zahlen                                                           */
/* -------------------------------------------------------------------------- */

const babs = (x: bigint) => (x < 0n ? -x : x);
function gcd(a: bigint, b: bigint): bigint {
  a = babs(a);
  b = babs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export class Q {
  readonly n: bigint;
  readonly d: bigint;
  constructor(n: bigint, d = 1n) {
    if (d === 0n) throw new Error("Nenner 0");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d) || 1n;
    this.n = n / g;
    this.d = d / g;
  }
  static readonly ZERO = new Q(0n);
  static readonly ONE = new Q(1n);
  /**
   * Aus einer Gleitkommazahl, über ihre Dezimalform mit 15 Stellen: 4.7e3 →
   * 4700, 1e-7 → 1/10⁷, 0.1 → 1/10. Eingaben kommen als Dezimalzahlen
   * („4.7k“, „100n“), dafür ist das exakt.
   */
  static from(x: number): Q {
    if (!Number.isFinite(x)) throw new Error(`Kein endlicher Wert: ${x}`);
    if (Number.isSafeInteger(x)) return new Q(BigInt(x));
    const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(x.toPrecision(15));
    if (!m) throw new Error(`Wert nicht darstellbar: ${x}`);
    const [, sign, int, frac = "", exp = "0"] = m;
    const digits = BigInt(`${sign}${int}${frac}`);
    const scale = frac.length - Number(exp);
    return scale >= 0 ? new Q(digits, 10n ** BigInt(scale)) : new Q(digits * 10n ** BigInt(-scale));
  }
  add(o: Q) {
    return new Q(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Q) {
    return new Q(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Q) {
    return new Q(this.n * o.n, this.d * o.d);
  }
  div(o: Q) {
    if (o.n === 0n) throw new Error("Division durch 0");
    return new Q(this.n * o.d, this.d * o.n);
  }
  neg() {
    return new Q(-this.n, this.d);
  }
  get zero() {
    return this.n === 0n;
  }
  toNumber() {
    return Number(this.n) / Number(this.d);
  }
}

/* -------------------------------------------------------------------------- */
/* Ausgabe                                                                    */
/* -------------------------------------------------------------------------- */

export interface ProofEquation {
  gesetz: LawId;
  /** Wo: Knotenname, Masche oder Bauteil. */
  ort: string;
  /** Allgemeine Form und eingesetzte Zahlen, LaTeX. */
  latex: string;
  /** Exakt 0 (bzw. exakt erfüllt). */
  erfuellt: boolean;
}

export type CircuitProof =
  | {
      exakt: true;
      bestanden: boolean;
      gesetze: Law[];
      knoten: ProofEquation[];
      maschen: ProofEquation[];
      ohm: ProofEquation[];
      /** Größte Abweichung Gleitkomma ↔ exakt, relativ zum größten Wert. */
      abgleich: number;
      /** Anzahl geprüfter Gleichungen (auch die, die nicht angezeigt werden). */
      geprueft: number;
    }
  | { exakt: false; grund: string; gesetze: Law[] };

/* -------------------------------------------------------------------------- */
/* Darstellung                                                                */
/* -------------------------------------------------------------------------- */

/** Bauteil- und Knotennamen kommen vom Modell: in LaTeX nur Buchstaben und Ziffern. */
const safe = (s: string) => s.replace(/[^A-Za-z0-9]/g, "") || "x";
const I_ = (name: string) => String.raw`I_{\mathrm{${safe(name)}}}`;
const U_ = (name: string) => String.raw`U_{\mathrm{${safe(name)}}}`;
/** „R1“ bleibt „R1“ (kein R_{R1}). */
const R_ = (name: string) => String.raw`\mathrm{${safe(name)}}`;

/** Endet die Dezimaldarstellung (Nenner nur aus 2 und 5)? Dann wie viele Stellen. */
function decimals(d: bigint): number | null {
  let k2 = 0;
  let k5 = 0;
  while (d % 2n === 0n) {
    d /= 2n;
    k2++;
  }
  while (d % 5n === 0n) {
    d /= 5n;
    k5++;
  }
  return d === 1n ? Math.max(k2, k5) : null;
}

function decimalString(q: Q, places: number): string {
  const neg = q.n < 0n;
  const scaled = (babs(q.n) * 10n ** BigInt(places)) / q.d;
  let s = scaled.toString().padStart(places + 1, "0");
  if (places > 0) s = `${s.slice(0, -places)}.${s.slice(-places)}`.replace(/\.?0+$/, "");
  return `${neg ? "-" : ""}${s}`;
}

const PREFIXES: [number, string][] = [
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
];

/** Exakter Wert mit Einheit: „48\,\mathrm{mA}“ oder „\tfrac{10}{3}\,\mathrm{V} \approx 3.333\,\mathrm{V}“. */
export function fmtQ(q: Q, unit: string): string {
  if (q.zero) return String.raw`0\,\mathrm{${unit}}`;
  const v = Math.abs(q.toNumber());
  const [f, p] = PREFIXES.find(([f]) => v >= f * 0.9999) ?? PREFIXES[PREFIXES.length - 1];
  const scaled = q.div(Q.from(f));
  const places = decimals(scaled.d);
  const u = String.raw`\,\mathrm{${p === "µ" ? "\\mu " : p}${unit}}`;
  if (places !== null && places <= 6) return `${decimalString(scaled, places)}${u}`;
  const approx = Number(scaled.toNumber().toPrecision(4));
  const sign = scaled.n < 0n ? "-" : "";
  return String.raw`${sign}\tfrac{${babs(scaled.n)}}{${scaled.d}}${u} \approx ${approx}${u}`;
}

/** „+ 48 mA“ / „- 24 mA“ für eine Summe. */
function signed(q: Q, unit: string, first: boolean): string {
  const neg = q.n < 0n;
  const body = fmtQ(neg ? q.neg() : q, unit);
  if (first) return neg ? `-${body}` : body;
  return neg ? ` - ${body}` : ` + ${body}`;
}

/* -------------------------------------------------------------------------- */
/* Exakte Knotenanalyse                                                       */
/* -------------------------------------------------------------------------- */

type Prep =
  | { kind: "G"; el: CircuitElement; a: string; b: string; g: Q; r: Q }
  | { kind: "U"; el: CircuitElement; a: string; b: string; u: Q }
  | { kind: "J"; el: CircuitElement; a: string; b: string; j: Q }
  | { kind: "OPEN"; el: CircuitElement; a: string; b: string }
  | { kind: "OPV"; el: CircuitElement; plus: string; minus: string; aus: string };

class Unsupported extends Error {}

function signOfPhase(phase: number | undefined): Q {
  const p = (((phase ?? 0) % 360) + 360) % 360;
  if (p === 0) return Q.ONE;
  if (p === 180) return Q.ONE.neg();
  throw new Unsupported("Phase ≠ 0°/180° bei Gleichstrom.");
}

function prepare(el: CircuitElement): Prep {
  switch (el.typ) {
    case "OPV":
      return { kind: "OPV", el, plus: el.plus, minus: el.minus, aus: el.aus };
    case "R": {
      const w = Q.from(parseSi(el.wert));
      return w.zero ? { kind: "U", el, a: el.a, b: el.b, u: Q.ZERO } : { kind: "G", el, a: el.a, b: el.b, g: Q.ONE.div(w), r: w };
    }
    case "L":
      return { kind: "U", el, a: el.a, b: el.b, u: Q.ZERO };
    case "C":
      return { kind: "OPEN", el, a: el.a, b: el.b };
    case "Z": {
      if (el.im !== 0) throw new Unsupported(`${el.name}: komplexe Impedanz — nur numerische Probe.`);
      const w = Q.from(el.re);
      return w.zero ? { kind: "U", el, a: el.a, b: el.b, u: Q.ZERO } : { kind: "G", el, a: el.a, b: el.b, g: Q.ONE.div(w), r: w };
    }
    case "V":
      return { kind: "U", el, a: el.a, b: el.b, u: Q.from(parseSi(el.wert)).mul(signOfPhase(el.phase)) };
    case "I":
      return { kind: "J", el, a: el.a, b: el.b, j: Q.from(parseSi(el.wert)).mul(signOfPhase(el.phase)) };
  }
}

function solveExact(A: Q[][], rhs: Q[]): Q[] | null {
  const n = rhs.length;
  const M = A.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    const piv = M.findIndex((row, r) => r >= col && !row[col].zero);
    if (piv < 0) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col || M[r][col].zero) continue;
      const f = M[r][col].div(M[col][col]);
      for (let c = col; c <= n; c++) M[r][c] = M[r][c].sub(f.mul(M[col][c]));
    }
  }
  return M.map((row, i) => row[n].div(row[i]));
}

/* -------------------------------------------------------------------------- */
/* Probe                                                                      */
/* -------------------------------------------------------------------------- */

const SHOW = 12;

export function proveCircuit(input: CircuitInput, numeric: CircuitResult): CircuitProof {
  const modus = (input.frequenz ?? 0) > 0 ? "AC" : "DC";
  const gesetze = lawsFor(new Set(input.elemente.map((e) => e.typ)), modus);
  if (modus === "AC") return { exakt: false, grund: "Wechselstrom: ω = 2πf ist irrational, es bleibt die numerische Probe des Lösers.", gesetze };
  let prep: Prep[];
  try {
    prep = input.elemente.map(prepare);
  } catch (err) {
    if (err instanceof Unsupported) return { exakt: false, grund: err.message, gesetze };
    throw err;
  }

  const ground = input.masse ?? "0";
  const all = [...new Set(prep.flatMap((p) => (p.kind === "OPV" ? [p.plus, p.minus, p.aus] : [p.a, p.b])))];
  const nodes = all.filter((n) => n !== ground);
  const idx = new Map(nodes.map((n, i) => [n, i]));
  const branchEls = prep.filter((p) => p.kind === "U" || p.kind === "OPV");
  const N = nodes.length + branchEls.length;
  const A: Q[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => Q.ZERO));
  const rhs: Q[] = Array.from({ length: N }, () => Q.ZERO);
  const at = (n: string) => (n === ground ? -1 : idx.get(n)!);
  const addA = (r: number, c: number, v: Q) => {
    if (r >= 0 && c >= 0) A[r][c] = A[r][c].add(v);
  };
  const addR = (r: number, v: Q) => {
    if (r >= 0) rhs[r] = rhs[r].add(v);
  };

  let k = nodes.length;
  for (const p of prep) {
    if (p.kind === "G") {
      const a = at(p.a);
      const b = at(p.b);
      addA(a, a, p.g);
      addA(b, b, p.g);
      addA(a, b, p.g.neg());
      addA(b, a, p.g.neg());
    } else if (p.kind === "J") {
      addR(at(p.a), p.j);
      addR(at(p.b), p.j.neg());
    } else if (p.kind === "U") {
      addA(at(p.a), k, Q.ONE);
      addA(at(p.b), k, Q.ONE.neg());
      addA(k, at(p.a), Q.ONE);
      addA(k, at(p.b), Q.ONE.neg());
      rhs[k] = p.u;
      k++;
    } else if (p.kind === "OPV") {
      addA(at(p.aus), k, Q.ONE);
      addA(k, at(p.plus), Q.ONE);
      addA(k, at(p.minus), Q.ONE.neg());
      k++;
    }
  }
  const x = solveExact(A, rhs);
  if (!x) return { exakt: false, grund: "Das exakte Gleichungssystem ist singulär.", gesetze };

  const phi = new Map<string, Q>([[ground, Q.ZERO]]);
  nodes.forEach((n, i) => phi.set(n, x[i]));
  const V = (n: string) => phi.get(n) ?? Q.ZERO;
  const current = new Map<string, Q>();
  const voltage = new Map<string, Q>();
  k = nodes.length;
  for (const p of prep) {
    if (p.kind === "OPV") {
      // Strom, den der Ausgang IN den Knoten „aus“ liefert.
      current.set(p.el.name, x[k++].neg());
      voltage.set(p.el.name, V(p.aus));
      continue;
    }
    const u = V(p.a).sub(V(p.b));
    voltage.set(p.el.name, u);
    if (p.kind === "G") current.set(p.el.name, u.mul(p.g));
    else if (p.kind === "U") current.set(p.el.name, x[k++]);
    else if (p.kind === "J") current.set(p.el.name, p.j.neg());
    else current.set(p.el.name, Q.ZERO);
  }

  let geprueft = 0;
  let bestanden = true;

  // ── Knotenregel: Σ abfließende Ströme = 0, an JEDEM Knoten ──────────────
  const knoten: ProofEquation[] = [];
  for (const n of all) {
    const terms: { name: string; sign: 1 | -1 }[] = [];
    let sum = Q.ZERO;
    for (const p of prep) {
      const i = current.get(p.el.name)!;
      if (p.kind === "OPV") {
        if (p.aus === n) {
          sum = sum.sub(i);
          terms.push({ name: p.el.name, sign: -1 });
        }
        if (ground === n) {
          sum = sum.add(i);
          terms.push({ name: p.el.name, sign: 1 });
        }
        continue;
      }
      if (p.a === n) {
        sum = sum.add(i);
        terms.push({ name: p.el.name, sign: 1 });
      }
      if (p.b === n) {
        sum = sum.sub(i);
        terms.push({ name: p.el.name, sign: -1 });
      }
    }
    geprueft++;
    const ok = sum.zero;
    bestanden &&= ok;
    if (n === ground || knoten.length >= SHOW) continue;
    const sym = terms.map((t, j) => `${t.sign < 0 ? "-" : j ? "+" : ""}${j && t.sign > 0 ? " " : ""}${I_(t.name)}`).join(" ");
    const num = terms.map((t, j) => signed(t.sign > 0 ? current.get(t.name)! : current.get(t.name)!.neg(), "A", j === 0)).join("");
    knoten.push({ gesetz: "knotenregel", ort: n, latex: `${sym} = ${num} = 0`, erfuellt: ok });
  }

  // ── Maschenregel an den Fundamentalmaschen ──────────────────────────────
  // Zweipole bilden den Graphen; Spannung je Element: Quelle = ihr Wert aus
  // der Netzliste, Widerstand = R·I, sonst die Potentialdifferenz.
  const twoPoles = prep.filter((p): p is Exclude<Prep, { kind: "OPV" }> => p.kind !== "OPV");
  const elU = (p: Exclude<Prep, { kind: "OPV" }>): Q =>
    p.kind === "U" ? p.u : p.kind === "G" ? p.r.mul(current.get(p.el.name)!) : voltage.get(p.el.name)!;
  const adj = new Map<string, { p: Exclude<Prep, { kind: "OPV" }>; to: string; dir: 1 | -1 }[]>();
  for (const p of twoPoles) {
    adj.set(p.a, [...(adj.get(p.a) ?? []), { p, to: p.b, dir: 1 }]);
    adj.set(p.b, [...(adj.get(p.b) ?? []), { p, to: p.a, dir: -1 }]);
  }
  const parent = new Map<string, { via: Exclude<Prep, { kind: "OPV" }>; from: string; dir: 1 | -1 } | null>();
  const tree = new Set<string>();
  for (const start of [ground, ...nodes]) {
    if (parent.has(start) || !adj.has(start)) continue;
    parent.set(start, null);
    const queue = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const e of adj.get(cur) ?? []) {
        if (parent.has(e.to)) continue;
        parent.set(e.to, { via: e.p, from: cur, dir: e.dir });
        tree.add(e.p.el.name);
        queue.push(e.to);
      }
    }
  }
  /** Weg von der Wurzel zum Knoten, als Folge (Element, Richtung). */
  const pathFromRoot = (n: string) => {
    const out: { p: Exclude<Prep, { kind: "OPV" }>; dir: 1 | -1 }[] = [];
    let cur = n;
    for (let e = parent.get(cur); e; e = parent.get(cur)) {
      out.unshift({ p: e.via, dir: e.dir });
      cur = e.from;
    }
    return out;
  };
  const maschen: ProofEquation[] = [];
  let m = 0;
  for (const p of twoPoles) {
    if (tree.has(p.el.name)) continue;
    // Masche: von a über das Element nach b, dann im Baum von b zurück nach a.
    const pa = pathFromRoot(p.a);
    const pb = pathFromRoot(p.b);
    let common = 0;
    while (common < pa.length && common < pb.length && pa[common].p === pb[common].p) common++;
    const loop: { p: Exclude<Prep, { kind: "OPV" }>; dir: 1 | -1 }[] = [
      { p, dir: 1 },
      ...pb.slice(common).reverse().map((s) => ({ p: s.p, dir: (s.dir * -1) as 1 | -1 })),
      ...pa.slice(common),
    ];
    let sum = Q.ZERO;
    for (const s of loop) sum = s.dir > 0 ? sum.add(elU(s.p)) : sum.sub(elU(s.p));
    geprueft++;
    const ok = sum.zero;
    bestanden &&= ok;
    m++;
    if (maschen.length >= SHOW) continue;
    const sym = loop.map((s, j) => `${s.dir < 0 ? "-" : j ? "+" : ""}${j && s.dir > 0 ? " " : ""}${U_(s.p.el.name)}`).join(" ");
    const num = loop.map((s, j) => signed(s.dir > 0 ? elU(s.p) : elU(s.p).neg(), "V", j === 0)).join("");
    maschen.push({ gesetz: "maschenregel", ort: `M${m}`, latex: `${sym} = ${num} = 0`, erfuellt: ok });
  }

  // ── Ohmsches Gesetz je Widerstand (zur Anzeige, exakt) ──────────────────
  const ohm: ProofEquation[] = prep
    .filter((p): p is Extract<Prep, { kind: "G" }> => p.kind === "G")
    .slice(0, SHOW)
    .map((p) => {
      const i = current.get(p.el.name)!;
      const u = voltage.get(p.el.name)!;
      return {
        gesetz: "ohm" as const,
        ort: p.el.name,
        latex: String.raw`${U_(p.el.name)} = ${R_(p.el.name)} \cdot ${I_(p.el.name)} = ${fmtQ(p.r, "\\Omega")} \cdot ${fmtQ(i, "A")} = ${fmtQ(u, "V")}`,
        erfuellt: p.r.mul(i).sub(u).zero,
      };
    });

  // ── Abgleich mit dem Gleitkomma-Löser ───────────────────────────────────
  const pairs: [number, number][] = [];
  for (const kn of numeric.knoten) pairs.push([kn.potential.re, V(kn.name).toNumber()]);
  for (const e of numeric.elemente) {
    const ex = current.get(e.name);
    if (!ex) continue;
    // OPV: der Löser zählt den Strom IN den Ausgang (VZS), hier den gelieferten.
    pairs.push([e.strom.re, e.typ === "OPV" ? -ex.toNumber() : ex.toNumber()]);
  }
  const scale = Math.max(1e-300, ...pairs.map(([, e]) => Math.abs(e)));
  const abgleich = Math.max(0, ...pairs.map(([f, e]) => Math.abs(f - e) / scale));
  // Der Löser rundet auf 10 gültige Stellen.
  bestanden &&= abgleich <= 1e-8;

  return { exakt: true, bestanden, gesetze, knoten, maschen, ohm, abgleich: Number(abgleich.toPrecision(3)), geprueft };
}

export { LAWS };
