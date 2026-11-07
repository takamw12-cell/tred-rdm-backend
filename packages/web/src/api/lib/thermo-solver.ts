/**
 * Thermodynamik — Grundformeln, rein und geprüft.
 *
 * Ergänzt den Prozess-Löser `solvers/solveThermo.ts` (Zustandsänderungen,
 * Kreisprozesse, Strömungsmaschinen) um die Einzelformeln, mit denen jede
 * Thermo- und Physikvorlesung anfängt — jeweils „eine Größe fehlt, rechne
 * sie aus“:
 *
 *   solveIdealGas        p·V = n·R_m·T
 *   solveFirstLaw        Q + W = ΔU   (zugeführt positiv, TRED-Standard)
 *   solveCarnotEfficiency η_C = 1 − T_kalt / T_warm
 *   solveIsothermal / solveAdiabatic / solveIsobaric / solveIsochoric
 *                        die vier Grundprozesse für n mol eines idealen Gases
 *
 * Dazu `pvDiagram()`: der p-V-Verlauf jeder Zustandsänderung, EXAKT aus den
 * Zuständen berechnet (p·V^n = const, n aus den Endpunkten) — das Diagramm
 * zeigt also genau die Rechnung, nicht eine Skizze des Modells.
 *
 * Alles in SI: Pa, m³, K, mol, J. Einheiten-Strings liest `solveThermo`.
 */

/** Universelle Gaskonstante (CODATA 2018, exakt seit der SI-Reform). */
export const R_MOLAR = 8.314462618;

export class ThermoFormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThermoFormulaError";
  }
}

const isNum = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

function exactlyOneMissing(names: string[], values: (number | null | undefined)[]): number {
  const missing = values.map((v, i) => (isNum(v) ? -1 : i)).filter((i) => i >= 0);
  if (missing.length !== 1) {
    throw new ThermoFormulaError(
      missing.length === 0
        ? `Alle Größen (${names.join(", ")}) sind gegeben — lass genau eine weg, die berechnet werden soll.`
        : `Es fehlen ${missing.map((i) => names[i]).join(", ")} — genau EINE Größe darf unbekannt sein.`,
    );
  }
  return missing[0];
}

function positive(name: string, v: number) {
  if (!(v > 0)) throw new ThermoFormulaError(`${name} muss positiv sein (erhalten: ${v}).`);
}

/* -------------------------------------------------------------------------- */
/* Zustandsgleichung                                                          */
/* -------------------------------------------------------------------------- */

export interface IdealGasResult {
  p: number;
  V: number;
  T: number;
  n: number;
  gesucht: "p" | "V" | "T" | "n";
  formel: string;
}

/**
 * Ideales Gas p·V = n·R·T. Genau eine der vier Größen ist `null`/`undefined`
 * und wird berechnet. `R` überschreibbar (z. B. 8,314 aus dem Skript).
 */
export function solveIdealGas(
  p: number | null | undefined,
  V: number | null | undefined,
  T: number | null | undefined,
  n: number | null | undefined,
  R = R_MOLAR,
): IdealGasResult {
  const i = exactlyOneMissing(["p", "V", "T", "n"], [p, V, T, n]);
  for (const [k, v] of [["p", p], ["V", V], ["T", T], ["n", n]] as const) if (isNum(v)) positive(k, v);
  positive("R", R);
  switch (i) {
    case 0:
      return { p: (n! * R * T!) / V!, V: V!, T: T!, n: n!, gesucht: "p", formel: "p = n·R·T / V" };
    case 1:
      return { p: p!, V: (n! * R * T!) / p!, T: T!, n: n!, gesucht: "V", formel: "V = n·R·T / p" };
    case 2:
      return { p: p!, V: V!, T: (p! * V!) / (n! * R), n: n!, gesucht: "T", formel: "T = p·V / (n·R)" };
    default:
      return { p: p!, V: V!, T: T!, n: (p! * V!) / (R * T!), gesucht: "n", formel: "n = p·V / (R·T)" };
  }
}

/* -------------------------------------------------------------------------- */
/* 1. Hauptsatz                                                               */
/* -------------------------------------------------------------------------- */

/**
 *   zugefuehrt_positiv  Q + W = ΔU  (W am System verrichtet; TRED, Baehr/Kabelac)
 *   abgegeben_positiv   Q − W = ΔU  (W vom System verrichtet; viele Physikbücher)
 */
export type FirstLawConvention = "zugefuehrt_positiv" | "abgegeben_positiv";

export interface FirstLawResult {
  Q: number;
  W: number;
  dU: number;
  gesucht: "Q" | "W" | "dU";
  konvention: FirstLawConvention;
  formel: string;
}

/** 1. Hauptsatz für ein geschlossenes System. Genau eine Größe fehlt. */
export function solveFirstLaw(
  Q: number | null | undefined,
  W: number | null | undefined,
  dU: number | null | undefined,
  konvention: FirstLawConvention = "zugefuehrt_positiv",
): FirstLawResult {
  const i = exactlyOneMissing(["Q", "W", "ΔU"], [Q, W, dU]);
  const s = konvention === "zugefuehrt_positiv" ? 1 : -1; // ΔU = Q + s·W
  const formel = s === 1 ? "Q + W = ΔU" : "Q − W = ΔU";
  if (i === 0) return { Q: dU! - s * W!, W: W!, dU: dU!, gesucht: "Q", konvention, formel };
  if (i === 1) return { Q: Q!, W: s * (dU! - Q!), dU: dU!, gesucht: "W", konvention, formel };
  return { Q: Q!, W: W!, dU: Q! + s * W!, gesucht: "dU", konvention, formel };
}

/* -------------------------------------------------------------------------- */
/* Carnot                                                                     */
/* -------------------------------------------------------------------------- */

/** η_C = 1 − T_kalt/T_warm, Temperaturen in Kelvin. */
export function solveCarnotEfficiency(T_hot: number, T_cold: number): number {
  if (!isNum(T_hot) || !isNum(T_cold)) throw new ThermoFormulaError("Beide Temperaturen sind nötig (in K).");
  if (!(T_cold > 0)) throw new ThermoFormulaError("T_kalt muss über 0 K liegen — Kelvin, nicht °C.");
  if (!(T_hot > T_cold)) throw new ThermoFormulaError("Es muss T_warm > T_kalt gelten.");
  return 1 - T_cold / T_hot;
}

/* -------------------------------------------------------------------------- */
/* Grundprozesse für n mol                                                    */
/* -------------------------------------------------------------------------- */

/** Ergebnis eines Prozesses 1 → 2. Energien zugeführt positiv, W = −∫p dV. */
export interface ProcessResult {
  prozess: "isotherm" | "adiabat" | "isobar" | "isochor";
  p1: number;
  V1: number;
  T1: number;
  p2: number;
  V2: number;
  T2: number;
  Q: number;
  W: number;
  dU: number;
  dS: number;
}

const cvOf = (kappa: number) => {
  if (!(kappa > 1)) throw new ThermoFormulaError("κ muss größer als 1 sein (Luft: 1,4).");
  return R_MOLAR / (kappa - 1);
};

/** Probe: der 1. Hauptsatz muss aufgehen, sonst kein Ergebnis. */
function checked(r: ProcessResult): ProcessResult {
  const scale = Math.max(1, Math.abs(r.Q), Math.abs(r.W), Math.abs(r.dU));
  if (Math.abs(r.Q + r.W - r.dU) > 1e-9 * scale) {
    throw new ThermoFormulaError("Interne Probe Q + W = ΔU nicht erfüllt.");
  }
  return r;
}

/** Isotherm (T = const): W = −n·R·T·ln(V2/V1), Q = −W, ΔU = 0. */
export function solveIsothermal(a: { n: number; T: number; V1: number; V2: number }): ProcessResult {
  positive("n", a.n);
  positive("T", a.T);
  positive("V1", a.V1);
  positive("V2", a.V2);
  const W = -a.n * R_MOLAR * a.T * Math.log(a.V2 / a.V1);
  return checked({
    prozess: "isotherm",
    p1: (a.n * R_MOLAR * a.T) / a.V1,
    V1: a.V1,
    T1: a.T,
    p2: (a.n * R_MOLAR * a.T) / a.V2,
    V2: a.V2,
    T2: a.T,
    Q: -W,
    W,
    dU: 0,
    dS: a.n * R_MOLAR * Math.log(a.V2 / a.V1),
  });
}

/** Adiabat reversibel (isentrop): T·V^(κ−1) = const, Q = 0, W = ΔU = n·c_v·(T2 − T1). */
export function solveAdiabatic(a: { n: number; T1: number; V1: number; V2: number; kappa?: number }): ProcessResult {
  const kappa = a.kappa ?? 1.4;
  const cv = cvOf(kappa);
  positive("n", a.n);
  positive("T1", a.T1);
  positive("V1", a.V1);
  positive("V2", a.V2);
  const T2 = a.T1 * (a.V1 / a.V2) ** (kappa - 1);
  const p1 = (a.n * R_MOLAR * a.T1) / a.V1;
  const dU = a.n * cv * (T2 - a.T1);
  return checked({
    prozess: "adiabat",
    p1,
    V1: a.V1,
    T1: a.T1,
    p2: p1 * (a.V1 / a.V2) ** kappa,
    V2: a.V2,
    T2,
    Q: 0,
    W: dU,
    dU,
    dS: 0,
  });
}

/** Isobar (p = const): W = −p·(V2 − V1), Q = n·c_p·ΔT. */
export function solveIsobaric(a: { n: number; p: number; V1: number; V2: number; kappa?: number }): ProcessResult {
  const kappa = a.kappa ?? 1.4;
  const cv = cvOf(kappa);
  positive("n", a.n);
  positive("p", a.p);
  positive("V1", a.V1);
  positive("V2", a.V2);
  const T1 = (a.p * a.V1) / (a.n * R_MOLAR);
  const T2 = (a.p * a.V2) / (a.n * R_MOLAR);
  return checked({
    prozess: "isobar",
    p1: a.p,
    V1: a.V1,
    T1,
    p2: a.p,
    V2: a.V2,
    T2,
    Q: a.n * (cv + R_MOLAR) * (T2 - T1),
    W: -a.p * (a.V2 - a.V1),
    dU: a.n * cv * (T2 - T1),
    dS: a.n * (cv + R_MOLAR) * Math.log(T2 / T1),
  });
}

/** Isochor (V = const): W = 0, Q = ΔU = n·c_v·ΔT. */
export function solveIsochoric(a: { n: number; V: number; T1: number; T2: number; kappa?: number }): ProcessResult {
  const kappa = a.kappa ?? 1.4;
  const cv = cvOf(kappa);
  positive("n", a.n);
  positive("V", a.V);
  positive("T1", a.T1);
  positive("T2", a.T2);
  const dU = a.n * cv * (a.T2 - a.T1);
  return checked({
    prozess: "isochor",
    p1: (a.n * R_MOLAR * a.T1) / a.V,
    V1: a.V,
    T1: a.T1,
    p2: (a.n * R_MOLAR * a.T2) / a.V,
    V2: a.V,
    T2: a.T2,
    Q: dU,
    W: 0,
    dU,
    dS: a.n * cv * Math.log(a.T2 / a.T1),
  });
}

/* -------------------------------------------------------------------------- */
/* p-V-Diagramm                                                               */
/* -------------------------------------------------------------------------- */

/** Dasselbe Schema wie der ```chart-Block (web/components/diagram-blocks.tsx). */
export interface ChartSpec {
  type: "line" | "scatter";
  title: string;
  xLabel: string;
  yLabel: string;
  series: { label: string; data: { x: number; y: number }[] }[];
}

const round4 = (v: number) => (v === 0 || !Number.isFinite(v) ? v : Number(v.toPrecision(4)));

/**
 * Punkte des Verlaufs a → b. Jede der fünf Grundzustandsänderungen ist eine
 * Polytrope p·V^n = const (isobar n = 0, isotherm n = 1, isentrop n = κ) ;
 * n folgt exakt aus den beiden Endpunkten. Isochor : senkrechte Strecke.
 */
export function processCurve(a: { p: number; V: number }, b: { p: number; V: number }, points = 16): { V: number; p: number }[] {
  if (Math.abs(a.V - b.V) <= 1e-12 * Math.max(a.V, b.V)) return [{ V: a.V, p: a.p }, { V: b.V, p: b.p }];
  const n = Math.log(b.p / a.p) / Math.log(a.V / b.V);
  const out: { V: number; p: number }[] = [];
  for (let i = 0; i <= points; i++) {
    // Gleichmäßig in ln V : die Kurve ist dort gekrümmt, wo V klein ist.
    const V = a.V * (b.V / a.V) ** (i / points);
    out.push({ V, p: a.p * (a.V / V) ** n });
  }
  out[out.length - 1] = { V: b.V, p: b.p };
  return out;
}

/**
 * p-V-Diagramm aus den Zuständen eines Prozesses (Zustand i → i+1, mit
 * Namen je Schritt). p in bar, V in m³ (bzw. m³/kg spezifisch).
 */
export function pvDiagram(
  states: { p: number; V: number }[],
  stepNames: string[],
  opts: { spezifisch?: boolean; geschlossen?: boolean; title?: string } = {},
): ChartSpec {
  const series = stepNames.map((name, i) => {
    const a = states[i];
    const b = states[i + 1];
    const to = opts.geschlossen && i === stepNames.length - 1 ? 1 : i + 2;
    return {
      label: `${i + 1}→${to} ${name}`,
      data: processCurve(a, b).map((pt) => ({ x: round4(pt.V), y: round4(pt.p / 1e5) })),
    };
  });
  return {
    type: "line",
    title: opts.title ?? (opts.geschlossen ? "Kreisprozess im p-V-Diagramm" : "Zustandsänderung im p-V-Diagramm"),
    xLabel: opts.spezifisch ? "v [m³/kg]" : "V [m³]",
    yLabel: "p [bar]",
    series,
  };
}
