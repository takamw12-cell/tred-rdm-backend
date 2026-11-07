/**
 * Elektrotechnik — die Grundgrößen, exakt und mit Probe.
 *
 *   ohm              U = R·I, P = U·I (zwei von U, I, R, P gegeben)
 *   rlc              Reihen-/Parallelschwingkreis: f₀, Güte Q, Bandbreite,
 *                    bei f: X_L, X_C, |Z|, φ; Resonanzkurve |Z|(f)
 *   rc_schaltvorgang Laden/Entladen: τ = R·C, u_C(t), i(t); Kurve u_C(t)
 *   spannungsteiler  unbelastet und belastet (R₂ ∥ R_L)
 *   kirchhoff        lineares Gleichungssystem A·x = b aus Maschen- und
 *                    Knotengleichungen (mathjs.lusolve), mit Residuenprobe
 *
 * Ganze Netzwerke (mehrere Quellen, Thevenin/Norton, Zeiger) rechnet
 * weiterhin schaltung_berechnen (MNA) — es stellt die Gleichungen selbst
 * auf. Hier geht es um die Formeln, an denen man in Klausur und Labor
 * nachrechnet.
 */
import { all, create } from "mathjs";
import { z } from "zod";
import type { ChartSpec } from "../thermo-solver";
import { close, isNum, parseQuantity, sig, type UnitTable } from "./quantity";

const math = create(all, { number: "number" });

export class ElectricalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ElectricalError";
  }
}

const fail = (m: string) => new ElectricalError(m);

/* -------------------------------------------------------------------------- */
/* Einheiten                                                                  */
/* -------------------------------------------------------------------------- */

const U_UNITS: UnitTable = { V: 1, mV: 1e-3, µV: 1e-6, uV: 1e-6, kV: 1e3 };
const I_UNITS: UnitTable = { A: 1, mA: 1e-3, µA: 1e-6, uA: 1e-6, kA: 1e3 };
const R_UNITS: UnitTable = { "Ω": 1, Ohm: 1, mΩ: 1e-3, mOhm: 1e-3, kΩ: 1e3, kOhm: 1e3, MΩ: 1e6, MOhm: 1e6 };
const P_UNITS: UnitTable = { W: 1, mW: 1e-3, µW: 1e-6, kW: 1e3, MW: 1e6 };
const L_UNITS: UnitTable = { H: 1, mH: 1e-3, µH: 1e-6, uH: 1e-6, nH: 1e-9 };
const C_UNITS: UnitTable = { F: 1, mF: 1e-3, µF: 1e-6, uF: 1e-6, nF: 1e-9, pF: 1e-12 };
const F_UNITS: UnitTable = { Hz: 1, kHz: 1e3, MHz: 1e6, GHz: 1e9 };
const T_UNITS: UnitTable = { s: 1, ms: 1e-3, µs: 1e-6, us: 1e-6, ns: 1e-9, min: 60 };

type Qty = number | string;
const q = (v: Qty | null | undefined, units: UnitTable, what: string): number | undefined =>
  v === undefined || v === null || v === "" ? undefined : parseQuantity(v, units, what, fail);

function positive(name: string, v: number | undefined): number {
  if (v === undefined) throw fail(`${name} fehlt.`);
  if (!(v > 0)) throw fail(`${name} muss positiv sein (erhalten: ${v}).`);
  return v;
}

function probe(name: string, a: number, b: number) {
  if (!close(a, b, 1e-9)) throw fail(`Interne Probe (${name}) nicht erfüllt.`);
}

/* -------------------------------------------------------------------------- */
/* Ohmsches Gesetz und Leistung                                               */
/* -------------------------------------------------------------------------- */

export interface OhmResult {
  U: number;
  I: number;
  R: number;
  P: number;
  gegeben: string[];
  formeln: string[];
}

/** Genau zwei von U, I, R, P sind gegeben; die anderen beiden folgen. */
export function solveOhmLaw(g: { U?: number | null; I?: number | null; R?: number | null; P?: number | null }): OhmResult {
  const given = (["U", "I", "R", "P"] as const).filter((k) => isNum(g[k]));
  if (given.length !== 2) {
    throw fail(`Genau ZWEI der Größen U, I, R, P angeben (gegeben: ${given.join(", ") || "keine"}).`);
  }
  if (isNum(g.R) && !(g.R > 0)) throw fail("Der Widerstand R muss positiv sein.");
  const key = given.join("");
  let U: number, I: number, R: number, P: number;
  let formeln: string[];
  switch (key) {
    case "UI":
      if (g.I === 0) throw fail("I = 0: der Widerstand ist nicht bestimmt (Leerlauf).");
      [U, I] = [g.U!, g.I!];
      R = U / I;
      P = U * I;
      formeln = ["R = U / I", "P = U · I"];
      break;
    case "UR":
      [U, R] = [g.U!, g.R!];
      I = U / R;
      P = (U * U) / R;
      formeln = ["I = U / R", "P = U² / R"];
      break;
    case "IR":
      [I, R] = [g.I!, g.R!];
      U = R * I;
      P = I * I * R;
      formeln = ["U = R · I", "P = I² · R"];
      break;
    case "UP":
      if (g.U === 0) throw fail("U = 0: Strom und Widerstand sind nicht bestimmt.");
      [U, P] = [g.U!, g.P!];
      I = P / U;
      R = (U * U) / P;
      formeln = ["I = P / U", "R = U² / P"];
      break;
    case "IP":
      if (g.I === 0) throw fail("I = 0: Spannung und Widerstand sind nicht bestimmt.");
      [I, P] = [g.I!, g.P!];
      U = P / I;
      R = P / (I * I);
      formeln = ["U = P / I", "R = P / I²"];
      break;
    default: {
      // R und P
      [R, P] = [g.R!, g.P!];
      if (P < 0) throw fail("Aus P und R allein ist eine negative Leistung nicht deutbar.");
      I = Math.sqrt(P / R);
      U = Math.sqrt(P * R);
      formeln = ["I = √(P / R)", "U = √(P · R)  (Beträge)"];
    }
  }
  if (!(R > 0)) throw fail(`Der berechnete Widerstand R = ${sig(R)} Ω ist nicht positiv — passen die Vorzeichen von U, I, P zusammen?`);
  probe("U = R·I", U, R * I);
  probe("P = U·I", P, U * I);
  return { U, I, R, P, gegeben: given, formeln };
}

/* -------------------------------------------------------------------------- */
/* RLC-Schwingkreis                                                           */
/* -------------------------------------------------------------------------- */

export type RlcCircuit = "reihe" | "parallel";

export interface RlcAtFrequency {
  f: number;
  omega: number;
  XL: number;
  XC: number;
  /** Betrag der Impedanz in Ω. */
  Z: number;
  /** Phasenwinkel von Z in Grad (> 0: induktiv, Spannung eilt dem Strom voraus). */
  phi_grad: number;
  charakter: "induktiv" | "kapazitiv" | "ohmsch";
  /** Nur mit U: Strom aus der Quelle. */
  I?: number;
}

export interface RlcResult {
  schaltung: RlcCircuit;
  f0: number;
  omega0: number;
  Q: number;
  bandbreite: number;
  /** |Z| bei f₀ (= R in beiden Fällen, im Idealfall). */
  Z_resonanz: number;
  beiF?: RlcAtFrequency;
}

function rlcAt(R: number, L: number, C: number, f: number, schaltung: RlcCircuit, U?: number): RlcAtFrequency {
  const omega = 2 * Math.PI * f;
  const XL = omega * L;
  const XC = 1 / (omega * C);
  let Z: number;
  let phi: number;
  if (schaltung === "reihe") {
    const X = XL - XC;
    Z = Math.hypot(R, X);
    phi = Math.atan2(X, R);
  } else {
    const G = 1 / R;
    const B = omega * C - 1 / (omega * L);
    Z = 1 / Math.hypot(G, B);
    phi = Math.atan2(-B, G);
  }
  const phiDeg = (phi * 180) / Math.PI;
  const charakter = Math.abs(phiDeg) < 1e-9 ? "ohmsch" : phiDeg > 0 ? "induktiv" : "kapazitiv";
  return { f, omega, XL, XC, Z, phi_grad: phiDeg, charakter, ...(U !== undefined ? { I: U / Z } : {}) };
}

/**
 * f₀ = 1 / (2π·√(L·C)) ; Reihe: Q = (1/R)·√(L/C), Parallel: Q = R·√(C/L) ;
 * Bandbreite B = f₀ / Q. Probe: X_L(f₀) = X_C(f₀).
 */
export function solveRLC(a: { R: number; L: number; C: number; f?: number; U?: number; schaltung?: RlcCircuit }): RlcResult {
  const R = positive("R", a.R);
  const L = positive("L", a.L);
  const C = positive("C", a.C);
  const schaltung = a.schaltung ?? "reihe";
  const omega0 = 1 / Math.sqrt(L * C);
  const f0 = omega0 / (2 * Math.PI);
  const Q = schaltung === "reihe" ? Math.sqrt(L / C) / R : R * Math.sqrt(C / L);
  probe("X_L(f₀) = X_C(f₀)", omega0 * L, 1 / (omega0 * C));
  const res = rlcAt(R, L, C, f0, schaltung);
  probe("|Z(f₀)| = R", res.Z, R);
  const out: RlcResult = { schaltung, f0, omega0, Q, bandbreite: f0 / Q, Z_resonanz: res.Z };
  if (a.f !== undefined) out.beiF = rlcAt(R, L, C, positive("f", a.f), schaltung, a.U);
  return out;
}

export function resonanceChart(a: { R: number; L: number; C: number; schaltung?: RlcCircuit }, r: RlcResult, points = 41): ChartSpec {
  const schaltung = a.schaltung ?? "reihe";
  // Logarithmisch von f₀/5 bis 5·f₀ : symmetrisch um die Resonanz.
  const data = Array.from({ length: points }, (_, k) => {
    const f = r.f0 * 5 ** (-1 + (2 * k) / (points - 1));
    return { x: sig(f, 4), y: sig(rlcAt(a.R, a.L, a.C, f, schaltung).Z, 4) };
  });
  return {
    type: "line",
    title: `${schaltung === "reihe" ? "Reihen" : "Parallel"}schwingkreis: |Z|(f), f₀ = ${sig(r.f0, 5)} Hz, Q = ${sig(r.Q, 4)}`,
    xLabel: "f in Hz",
    yLabel: "|Z| in Ω",
    series: [{ label: "|Z|", data }],
  };
}

/* -------------------------------------------------------------------------- */
/* RC-Schaltvorgang                                                           */
/* -------------------------------------------------------------------------- */

export type RcMode = "laden" | "entladen";

export interface RcResult {
  modus: RcMode;
  tau: number;
  /** Anfangsstrom U₀/R (beim Entladen mit negativem Vorzeichen). */
  i0: number;
  beiT?: { t: number; uC: number; uR: number; i: number; prozent: number };
  /** u_C bei 1τ … 5τ in % von U₀. */
  tabelle: { t_durch_tau: number; prozent: number }[];
}

/** Laden: u_C = U₀(1 − e^(−t/τ)), Entladen: u_C = U₀·e^(−t/τ), τ = R·C. */
export function solveRCTransient(a: { U0: number; R: number; C: number; t?: number; modus?: RcMode }): RcResult {
  if (!isNum(a.U0)) throw fail("U0 (Quellen- bzw. Anfangsspannung) fehlt.");
  const R = positive("R", a.R);
  const C = positive("C", a.C);
  const modus = a.modus ?? "laden";
  const tau = R * C;
  const uC = (t: number) => (modus === "laden" ? a.U0 * (1 - Math.exp(-t / tau)) : a.U0 * Math.exp(-t / tau));
  const share = (t: number) => (modus === "laden" ? 1 - Math.exp(-t / tau) : Math.exp(-t / tau));
  const i0 = modus === "laden" ? a.U0 / R : -a.U0 / R;
  const out: RcResult = {
    modus,
    tau,
    i0,
    tabelle: [1, 2, 3, 4, 5].map((k) => ({ t_durch_tau: k, prozent: sig(100 * share(k * tau), 4) })),
  };
  if (a.t !== undefined) {
    if (!(a.t >= 0)) throw fail("t muss ≥ 0 sein.");
    const i = i0 * Math.exp(-a.t / tau);
    const u = uC(a.t);
    // Probe Maschenregel: beim Laden U₀ = u_R + u_C, beim Entladen 0 = u_R + u_C.
    probe("Maschenregel", modus === "laden" ? a.U0 : 0, R * i + u);
    out.beiT = { t: a.t, uC: u, uR: R * i, i, prozent: 100 * share(a.t) };
  }
  return out;
}

export function rcChart(a: { U0: number; modus?: RcMode }, r: RcResult, points = 26): ChartSpec {
  const [unit, f] = r.tau >= 1 ? ["s", 1] : r.tau >= 1e-3 ? ["ms", 1e3] : ["µs", 1e6];
  const share = (t: number) => (r.modus === "laden" ? 1 - Math.exp(-t / r.tau) : Math.exp(-t / r.tau));
  const data = Array.from({ length: points }, (_, k) => {
    const t = (5 * r.tau * k) / (points - 1);
    return { x: sig(t * f, 4), y: sig(a.U0 * share(t), 4) };
  });
  return {
    type: "line",
    title: `${r.modus === "laden" ? "Laden" : "Entladen"} eines Kondensators: u_C(t), τ = ${sig(r.tau * f, 4)} ${unit}`,
    xLabel: `t in ${unit}`,
    yLabel: "u_C in V",
    series: [{ label: "u_C(t)", data }],
  };
}

/* -------------------------------------------------------------------------- */
/* Spannungsteiler                                                            */
/* -------------------------------------------------------------------------- */

export interface DividerResult {
  U_aus: number;
  U_R1: number;
  I: number;
  R2_wirksam: number;
  belastet: boolean;
  formel: string;
}

/** U_aus = U_ein · R₂' / (R₁ + R₂'), R₂' = R₂ bzw. R₂ ∥ R_L. */
export function solveVoltageDivider(a: { Uin: number; R1: number; R2: number; RL?: number }): DividerResult {
  if (!isNum(a.Uin)) throw fail("U_ein fehlt.");
  const R1 = positive("R1", a.R1);
  const R2 = positive("R2", a.R2);
  const belastet = a.RL !== undefined;
  const R2w = belastet ? (R2 * positive("R_L", a.RL)) / (R2 + a.RL!) : R2;
  const I = a.Uin / (R1 + R2w);
  const Uout = I * R2w;
  probe("U_R1 + U_aus = U_ein", R1 * I + Uout, a.Uin);
  return {
    U_aus: Uout,
    U_R1: R1 * I,
    I,
    R2_wirksam: R2w,
    belastet,
    formel: belastet ? "U_aus = U_ein · (R₂ ∥ R_L) / (R₁ + R₂ ∥ R_L)" : "U_aus = U_ein · R₂ / (R₁ + R₂)",
  };
}

/* -------------------------------------------------------------------------- */
/* Kirchhoff : lineares Gleichungssystem                                      */
/* -------------------------------------------------------------------------- */

export interface KirchhoffResult {
  x: number[];
  namen: string[];
  determinante: number;
  /** max |A·x − b| */
  residuum: number;
}

export function solveKirchhoff(A: number[][], b: number[], namen?: string[]): KirchhoffResult {
  const n = A.length;
  if (n === 0 || n > 20) throw fail("Das Gleichungssystem braucht 1 bis 20 Gleichungen.");
  if (!A.every((row) => Array.isArray(row) && row.length === n && row.every(isNum))) {
    throw fail(`A muss quadratisch sein (${n} Gleichungen → je ${n} Koeffizienten). Genauso viele unabhängige Gleichungen wie Unbekannte aufstellen.`);
  }
  if (b.length !== n || !b.every(isNum)) throw fail(`b braucht ${n} Zahlen (rechte Seiten).`);
  const det = math.det(A) as number;
  const scale = Math.max(...A.flat().map(Math.abs), 1);
  if (Math.abs(det) < 1e-12 * scale ** n) {
    throw fail("Das Gleichungssystem ist singulär (Determinante 0): mindestens eine Gleichung hängt von den anderen ab — z. B. eine Knotengleichung zu viel. Nimm k − 1 Knoten- und z − (k − 1) Maschengleichungen.");
  }
  const sol = math.lusolve(A, b) as number[][];
  const x = sol.map((r) => r[0]);
  const residuum = Math.max(...A.map((row, i) => Math.abs(row.reduce((s, v, j) => s + v * x[j], 0) - b[i])));
  if (residuum > 1e-9 * Math.max(1, ...b.map(Math.abs), scale)) throw fail("Interne Probe A·x = b nicht erfüllt.");
  const names = namen && namen.length === n ? namen : x.map((_, i) => `x${i + 1}`);
  return { x, namen: names, determinante: det, residuum };
}

/* -------------------------------------------------------------------------- */
/* Werkzeug                                                                   */
/* -------------------------------------------------------------------------- */

const qty = z.union([z.number(), z.string().max(40)]);

export const electricalInputSchema = z.object({
  aufgabe: z.enum(["ohm", "rlc", "rc_schaltvorgang", "spannungsteiler", "kirchhoff"]),
  U: qty.optional().describe('ohm: Spannung, z. B. "12 V"; rlc: Quellenspannung (optional, für den Strom)'),
  I: qty.optional().describe('ohm: Strom, z. B. "20 mA"'),
  R: qty.optional().describe('ohm, rlc, rc_schaltvorgang: Widerstand, z. B. "4,7 kΩ"'),
  P: qty.optional().describe("ohm: Leistung"),
  L: qty.optional().describe('rlc: Induktivität, z. B. "10 mH"'),
  C: qty.optional().describe('rlc, rc_schaltvorgang: Kapazität, z. B. "1 µF"'),
  f: qty.optional().describe("rlc: Frequenz, bei der |Z| und φ berechnet werden (optional)"),
  schaltung: z.enum(["reihe", "parallel"]).optional().describe("rlc, Standard reihe"),
  U0: qty.optional().describe("rc_schaltvorgang: Quellenspannung (laden) bzw. Anfangsspannung (entladen)"),
  t: qty.optional().describe('rc_schaltvorgang: Zeitpunkt, z. B. "2 ms" (optional)'),
  modus: z.enum(["laden", "entladen"]).optional().describe("rc_schaltvorgang, Standard laden"),
  U_ein: qty.optional().describe("spannungsteiler: Eingangsspannung"),
  R1: qty.optional().describe("spannungsteiler: oberer Widerstand"),
  R2: qty.optional().describe("spannungsteiler: unterer Widerstand (an ihm liegt U_aus)"),
  R_last: qty.optional().describe("spannungsteiler: Lastwiderstand parallel zu R2 (optional)"),
  A: z.array(z.array(z.number()).max(20)).max(20).optional().describe("kirchhoff: Koeffizientenmatrix, eine Zeile pro Gleichung"),
  b: z.array(z.number()).max(20).optional().describe("kirchhoff: rechte Seiten"),
  unbekannte: z.array(z.string().max(20)).max(20).optional().describe('kirchhoff: Namen der Unbekannten, z. B. ["I1","I2","I3"]'),
});
export type ElectricalInput = z.infer<typeof electricalInputSchema>;

const LIMITS =
  "Abgedeckt: Ohmsches Gesetz mit Leistung, RLC-Reihen-/Parallelschwingkreis (ideal), Laden/Entladen eines " +
  "Kondensators über R, unbelasteter/belasteter Spannungsteiler, lineare Gleichungssysteme aus Kirchhoff. " +
  "Ganze Netzwerke mit mehreren Quellen, Zeigerrechnung, Thevenin/Norton → schaltung_berechnen.";

export type ElectricalResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

export function solveElectrical(raw: ElectricalInput): ElectricalResult {
  try {
    const input = electricalInputSchema.parse(raw);
    switch (input.aufgabe) {
      case "ohm": {
        const r = solveOhmLaw({
          U: q(input.U, U_UNITS, "U"),
          I: q(input.I, I_UNITS, "I"),
          R: q(input.R, R_UNITS, "R"),
          P: q(input.P, P_UNITS, "P"),
        });
        return { ok: true, U_V: sig(r.U), I_A: sig(r.I), R_Ohm: sig(r.R), P_W: sig(r.P), gegeben: r.gegeben, formeln: r.formeln };
      }
      case "rlc": {
        const a = {
          R: positive("R", q(input.R, R_UNITS, "R")),
          L: positive("L", q(input.L, L_UNITS, "L")),
          C: positive("C", q(input.C, C_UNITS, "C")),
          f: q(input.f, F_UNITS, "f"),
          U: q(input.U, U_UNITS, "U"),
          schaltung: input.schaltung,
        };
        const r = solveRLC(a);
        const bei = r.beiF && {
          f_Hz: sig(r.beiF.f),
          X_L_Ohm: sig(r.beiF.XL),
          X_C_Ohm: sig(r.beiF.XC),
          Z_Ohm: sig(r.beiF.Z),
          phi_grad: sig(r.beiF.phi_grad, 6),
          charakter: r.beiF.charakter,
          ...(r.beiF.I !== undefined ? { I_A: sig(r.beiF.I) } : {}),
        };
        return {
          ok: true,
          schaltung: r.schaltung,
          f0_Hz: sig(r.f0),
          omega0_1_s: sig(r.omega0),
          guete_Q: sig(r.Q),
          bandbreite_Hz: sig(r.bandbreite),
          Z_bei_f0_Ohm: sig(r.Z_resonanz),
          ...(bei ? { bei_f: bei } : {}),
          formeln: [
            "f₀ = 1 / (2π·√(L·C))",
            r.schaltung === "reihe" ? "Q = (1/R)·√(L/C)" : "Q = R·√(C/L)",
            "B = f₀ / Q",
            r.schaltung === "reihe" ? "|Z| = √(R² + (X_L − X_C)²)" : "1/|Z| = √((1/R)² + (ωC − 1/(ωL))²)",
          ],
          // Wird im Chat automatisch als Diagramm angezeigt (web/lib/solver-charts.ts).
          diagramme: [resonanceChart(a, r)],
        };
      }
      case "rc_schaltvorgang": {
        const U0 = q(input.U0 ?? input.U, U_UNITS, "U0");
        const a = {
          U0: U0 as number,
          R: positive("R", q(input.R, R_UNITS, "R")),
          C: positive("C", q(input.C, C_UNITS, "C")),
          t: q(input.t, T_UNITS, "t"),
          modus: input.modus,
        };
        const r = solveRCTransient(a);
        return {
          ok: true,
          modus: r.modus,
          tau_s: sig(r.tau),
          i0_A: sig(r.i0),
          ...(r.beiT
            ? { bei_t: { t_s: sig(r.beiT.t), u_C_V: sig(r.beiT.uC), u_R_V: sig(r.beiT.uR), i_A: sig(r.beiT.i), prozent_von_U0: sig(r.beiT.prozent, 6) } }
            : {}),
          tabelle_u_C: r.tabelle,
          formeln: [r.modus === "laden" ? "u_C(t) = U₀·(1 − e^(−t/τ))" : "u_C(t) = U₀·e^(−t/τ)", "i(t) = ±(U₀/R)·e^(−t/τ)", "τ = R·C"],
          diagramme: [rcChart(a, r)],
        };
      }
      case "spannungsteiler": {
        const r = solveVoltageDivider({
          Uin: q(input.U_ein ?? input.U, U_UNITS, "U_ein") as number,
          R1: positive("R1", q(input.R1, R_UNITS, "R1")),
          R2: positive("R2", q(input.R2, R_UNITS, "R2")),
          RL: q(input.R_last, R_UNITS, "R_last"),
        });
        return { ok: true, U_aus_V: sig(r.U_aus), U_R1_V: sig(r.U_R1), I_A: sig(r.I), R2_wirksam_Ohm: sig(r.R2_wirksam), belastet: r.belastet, formel: r.formel };
      }
      case "kirchhoff": {
        if (!input.A || !input.b) throw fail("kirchhoff braucht A (Koeffizienten) und b (rechte Seiten).");
        const r = solveKirchhoff(input.A, input.b, input.unbekannte);
        return {
          ok: true,
          loesung: Object.fromEntries(r.namen.map((n, i) => [n, sig(r.x[i])])),
          determinante: sig(r.determinante),
          probe: `max |A·x − b| = ${r.residuum.toExponential(2)}`,
          hinweis: "Die Lösung ist exakt für DIESES Gleichungssystem; ob die Maschen- und Knotengleichungen stimmen, prüfst du am Schaltbild (Vorzeichen, Zählpfeile).",
        };
      }
    }
  } catch (err) {
    if (err instanceof ElectricalError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    throw err;
  }
}
