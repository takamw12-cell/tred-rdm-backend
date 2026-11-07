/**
 * Werkstoffkunde / Festigkeit — die Kennwerte, exakt und mit Probe.
 *
 *   hooke            σ = E·ε (zwei von σ, ε, E)
 *   spannung         σ = F/A (zwei von σ, F, A; A auch aus Durchmesser d)
 *   waermedehnung    ΔL = α·L₀·ΔT ; mit E zusätzlich die Wärmespannung bei
 *                    behinderter Dehnung σ = −E·α·ΔT
 *   biegespannung    σ_b = M·e/I = M/W ; I, e aus Rechteck (b, h) oder
 *                    Kreis (d) oder direkt
 *   querkontraktion  ν = −ε_quer/ε_längs, Plausibilität −1 < ν ≤ 0,5 ;
 *                    mit E auch G = E / (2(1 + ν))
 *
 * Werkstoffkennwerte (E, α, R_e …) erfindet der Löser NICHT: sie kommen aus
 * der Aufgabe oder dem Skript. Alle Formeln gelten im linear-elastischen
 * Bereich (σ unter der Streck- bzw. Dehngrenze) — das Ergebnis sagt es.
 */
import { z } from "zod";
import { isNum, parseQuantity, sig, type UnitTable } from "./quantity";

export class MaterialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaterialsError";
  }
}
const fail = (m: string) => new MaterialsError(m);

/* -------------------------------------------------------------------------- */
/* Einheiten (intern SI: Pa, N, m, m², m⁴, N·m, 1/K)                          */
/* -------------------------------------------------------------------------- */

const STRESS: UnitTable = { Pa: 1, kPa: 1e3, MPa: 1e6, GPa: 1e9, "N/mm²": 1e6, "N/mm2": 1e6, "N/mm^2": 1e6, "N/m²": 1, "N/m2": 1, "kN/mm²": 1e9, "kN/mm2": 1e9 };
const STRAIN: UnitTable = { "": 1, "%": 1e-2, "‰": 1e-3, "µm/m": 1e-6, "um/m": 1e-6, "mm/m": 1e-3 };
const FORCE: UnitTable = { N: 1, kN: 1e3, MN: 1e6 };
const LENGTH: UnitTable = { mm: 1e-3, cm: 1e-2, dm: 1e-1, m: 1, µm: 1e-6, um: 1e-6 };
const AREA: UnitTable = { "mm²": 1e-6, mm2: 1e-6, "mm^2": 1e-6, "cm²": 1e-4, cm2: 1e-4, "cm^2": 1e-4, "m²": 1, m2: 1, "m^2": 1 };
const MOMENT: UnitTable = { Nm: 1, "N·m": 1, "N*m": 1, kNm: 1e3, "kN·m": 1e3, "kN*m": 1e3, Nmm: 1e-3, "N·mm": 1e-3, "N*mm": 1e-3 };
const INERTIA: UnitTable = { "mm⁴": 1e-12, mm4: 1e-12, "mm^4": 1e-12, "cm⁴": 1e-8, cm4: 1e-8, "cm^4": 1e-8, "m⁴": 1, m4: 1, "m^4": 1 };
const SECTION: UnitTable = { "mm³": 1e-9, mm3: 1e-9, "mm^3": 1e-9, "cm³": 1e-6, cm3: 1e-6, "cm^3": 1e-6, "m³": 1, m3: 1, "m^3": 1 };
const ALPHA: UnitTable = { "1/K": 1, "/K": 1, "K^-1": 1, "1/°C": 1, "10^-6/K": 1e-6, "1e-6/K": 1e-6, "µm/(m·K)": 1e-6, "µm/(m*K)": 1e-6, "um/(m*K)": 1e-6, "ppm/K": 1e-6 };
const DELTA_T: UnitTable = { K: 1, "°C": 1, "°": 1 };
/** T1/T2 absolut: °C und K dürfen gemischt werden. */
const TEMP_ABS: UnitTable = { K: 1, "°C": (v) => v + 273.15 };

type Qty = number | string;
const q = (v: Qty | null | undefined, units: UnitTable, what: string): number | undefined =>
  v === undefined || v === null || v === "" ? undefined : parseQuantity(v, units, what, fail);

function positive(name: string, v: number | undefined): number {
  if (v === undefined) throw fail(`${name} fehlt.`);
  if (!(v > 0)) throw fail(`${name} muss positiv sein (erhalten: ${v}).`);
  return v;
}
function probe(name: string, a: number, b: number) {
  if (Math.abs(a - b) > 1e-9 * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE)) throw fail(`Interne Probe (${name}) nicht erfüllt.`);
}
function exactlyTwo<T extends string>(names: readonly T[], vals: Record<T, number | undefined>): T {
  const missing = names.filter((n) => !isNum(vals[n]));
  if (missing.length !== 1) throw fail(`Genau ZWEI von ${names.join(", ")} angeben (fehlend: ${missing.join(", ") || "keine"}).`);
  return missing[0];
}

export const ELASTIC_NOTE = "Gilt nur im linear-elastischen Bereich (σ unter der Streck- bzw. Dehngrenze R_e / R_p0,2 aus dem Skript).";

/* -------------------------------------------------------------------------- */
/* Hookesches Gesetz                                                          */
/* -------------------------------------------------------------------------- */

export interface HookeResult {
  sigma: number;
  epsilon: number;
  E: number;
  gesucht: "sigma" | "epsilon" | "E";
  formel: string;
}

/** σ = E·ε ; σ und E in Pa, ε dimensionslos. Genau eine Größe fehlt. */
export function solveHookesLaw(a: { sigma?: number; epsilon?: number; E?: number }): HookeResult {
  const gesucht = exactlyTwo(["sigma", "epsilon", "E"] as const, { sigma: a.sigma, epsilon: a.epsilon, E: a.E });
  if (isNum(a.E)) positive("E", a.E);
  let r: HookeResult;
  if (gesucht === "sigma") r = { sigma: a.E! * a.epsilon!, epsilon: a.epsilon!, E: a.E!, gesucht, formel: "σ = E · ε" };
  else if (gesucht === "epsilon") r = { sigma: a.sigma!, epsilon: a.sigma! / a.E!, E: a.E!, gesucht, formel: "ε = σ / E" };
  else {
    if (a.epsilon === 0) throw fail("ε = 0: der E-Modul ist nicht bestimmt.");
    r = { sigma: a.sigma!, epsilon: a.epsilon!, E: a.sigma! / a.epsilon!, gesucht, formel: "E = σ / ε" };
    if (!(r.E > 0)) throw fail("σ und ε haben verschiedene Vorzeichen — Zug (+) und Druck (−) einheitlich angeben.");
  }
  probe("σ = E·ε", r.sigma, r.E * r.epsilon);
  return r;
}

/* -------------------------------------------------------------------------- */
/* Normalspannung                                                             */
/* -------------------------------------------------------------------------- */

export interface StressResult {
  sigma: number;
  F: number;
  A: number;
  gesucht: "sigma" | "F" | "A";
  formel: string;
}

/** σ = F / A ; A > 0. Genau eine Größe fehlt (A darf aus d kommen). */
export function solveStress(a: { F?: number; A?: number; sigma?: number }): StressResult {
  const gesucht = exactlyTwo(["sigma", "F", "A"] as const, { sigma: a.sigma, F: a.F, A: a.A });
  if (isNum(a.A)) positive("A", a.A);
  let r: StressResult;
  if (gesucht === "sigma") r = { sigma: a.F! / a.A!, F: a.F!, A: a.A!, gesucht, formel: "σ = F / A" };
  else if (gesucht === "F") r = { sigma: a.sigma!, F: a.sigma! * a.A!, A: a.A!, gesucht, formel: "F = σ · A" };
  else {
    if (a.sigma === 0) throw fail("σ = 0: die Fläche ist nicht bestimmt.");
    r = { sigma: a.sigma!, F: a.F!, A: a.F! / a.sigma!, gesucht, formel: "A_erf = F / σ_zul" };
    if (!(r.A > 0)) throw fail("F und σ haben verschiedene Vorzeichen.");
  }
  probe("σ·A = F", r.sigma * r.A, r.F);
  return r;
}

export const circleArea = (d: number) => (Math.PI * d * d) / 4;

/* -------------------------------------------------------------------------- */
/* Wärmedehnung                                                               */
/* -------------------------------------------------------------------------- */

export interface ThermalResult {
  dL: number;
  L: number;
  epsilon_th: number;
  /** Nur mit E: Spannung bei vollständig behinderter Dehnung (Erwärmung → Druck, negativ). */
  sigma_behindert?: number;
}

/** ΔL = α·L₀·ΔT ; L = L₀ + ΔL ; σ = −E·α·ΔT (beidseitig fest eingespannt). */
export function solveThermalExpansion(a: { alpha: number; L0: number; dT: number; E?: number }): ThermalResult {
  if (!isNum(a.alpha)) throw fail("α (Wärmeausdehnungskoeffizient) fehlt — aus der Aufgabe bzw. Werkstofftabelle des Skripts.");
  if (!(a.alpha > 0 && a.alpha < 1e-3)) throw fail(`α = ${a.alpha} 1/K ist unplausibel (Metalle ≈ 10⁻⁵ 1/K). Einheit prüfen, z. B. "12e-6 1/K" oder "12 µm/(m·K)".`);
  const L0 = positive("L0", a.L0);
  if (!isNum(a.dT)) throw fail("ΔT fehlt.");
  const eps = a.alpha * a.dT;
  const dL = eps * L0;
  probe("L = L₀(1 + αΔT)", L0 + dL, L0 * (1 + eps));
  const out: ThermalResult = { dL, L: L0 + dL, epsilon_th: eps };
  if (a.E !== undefined) out.sigma_behindert = -positive("E", a.E) * eps;
  return out;
}

/* -------------------------------------------------------------------------- */
/* Biegespannung                                                              */
/* -------------------------------------------------------------------------- */

export interface BendingResult {
  sigma_b: number;
  I: number;
  e: number;
  W: number;
  querschnitt: string;
  formel: string;
}

/**
 * σ_b = M·e / I = M / W. Querschnitt: Rechteck (b, h → I = b·h³/12,
 * e = h/2), Kreis (d → I = π·d⁴/64, e = d/2) oder I und e bzw. W direkt.
 */
export function solveBeamBendingStress(a: { M: number; I?: number; e?: number; W?: number; b?: number; h?: number; d?: number }): BendingResult {
  if (!isNum(a.M)) throw fail("Das Biegemoment M fehlt (aus balkenstatik bzw. der Aufgabe).");
  let I: number, e: number, querschnitt: string;
  if (isNum(a.b) || isNum(a.h)) {
    const b = positive("b", a.b);
    const h = positive("h (in Lastrichtung)", a.h);
    I = (b * h ** 3) / 12;
    e = h / 2;
    querschnitt = "Rechteck: I = b·h³/12, e = h/2, W = b·h²/6";
  } else if (isNum(a.d)) {
    const d = positive("d", a.d);
    I = (Math.PI * d ** 4) / 64;
    e = d / 2;
    querschnitt = "Kreis: I = π·d⁴/64, e = d/2, W = π·d³/32";
  } else if (isNum(a.I) && isNum(a.e)) {
    I = positive("I", a.I);
    e = positive("e (Randfaserabstand)", a.e);
    querschnitt = "I und e gegeben";
  } else if (isNum(a.W)) {
    const W = positive("W", a.W);
    return { sigma_b: a.M / W, I: NaN, e: NaN, W, querschnitt: "W gegeben", formel: "σ_b = M / W" };
  } else {
    throw fail("Querschnitt fehlt: b und h (Rechteck), d (Kreis), I und e, oder W angeben.");
  }
  const W = I / e;
  const sigma = (a.M * e) / I;
  probe("M·e/I = M/W", sigma, a.M / W);
  return { sigma_b: sigma, I, e, W, querschnitt, formel: "σ_b = M · e / I = M / W" };
}

/* -------------------------------------------------------------------------- */
/* Querkontraktion                                                            */
/* -------------------------------------------------------------------------- */

export interface PoissonResult {
  nu: number;
  G?: number;
  E?: number;
  formel: string;
  bemerkung: string;
}

/** ν = −ε_quer / ε_längs ; oder aus E und G : ν = E/(2G) − 1. Plausibel: −1 < ν ≤ 0,5. */
export function solvePoissonRatio(a: { eps_quer?: number; eps_laengs?: number; nu?: number; E?: number; G?: number }): PoissonResult {
  let nu: number;
  let formel: string;
  if (isNum(a.eps_quer) && isNum(a.eps_laengs)) {
    if (a.eps_laengs === 0) throw fail("ε_längs = 0: ν ist nicht bestimmt.");
    nu = -a.eps_quer / a.eps_laengs;
    formel = "ν = −ε_quer / ε_längs";
  } else if (isNum(a.nu)) {
    nu = a.nu;
    formel = "ν gegeben";
  } else if (isNum(a.E) && isNum(a.G)) {
    nu = positive("E", a.E) / (2 * positive("G", a.G)) - 1;
    formel = "ν = E / (2G) − 1";
  } else {
    throw fail("Angeben: ε_quer und ε_längs, oder ν, oder E und G.");
  }
  if (!(nu > -1 && nu <= 0.5)) {
    throw fail(`ν = ${sig(nu, 4)} liegt außerhalb −1 < ν ≤ 0,5 (thermodynamisch unmöglich). Vorzeichen prüfen: bei Zug wird der Stab dünner, ε_quer < 0.`);
  }
  const out: PoissonResult = {
    nu,
    formel,
    bemerkung:
      nu === 0.5
        ? "ν = 0,5: inkompressibel (Volumen bleibt konstant, z. B. Gummi)."
        : nu < 0
          ? "ν < 0: auxetischer Werkstoff (wird bei Zug dicker) — selten, prüfe die Vorzeichen."
          : "Metalle typischerweise 0,25 … 0,35.",
  };
  if (isNum(a.E) && !isNum(a.G)) {
    out.E = a.E;
    out.G = a.E / (2 * (1 + nu));
  } else if (isNum(a.G) && !isNum(a.E)) {
    out.G = a.G;
    out.E = 2 * a.G * (1 + nu);
  } else if (isNum(a.E) && isNum(a.G)) {
    out.E = a.E;
    out.G = a.G;
  }
  if (out.E !== undefined && out.G !== undefined) probe("E = 2G(1 + ν)", out.E, 2 * out.G * (1 + nu));
  return out;
}

/* -------------------------------------------------------------------------- */
/* Werkzeug                                                                   */
/* -------------------------------------------------------------------------- */

const qty = z.union([z.number(), z.string().max(40)]);

export const materialsInputSchema = z.object({
  aufgabe: z.enum(["hooke", "spannung", "waermedehnung", "biegespannung", "querkontraktion"]),
  sigma: qty.optional().describe('Spannung, z. B. "210 MPa" oder "235 N/mm²"'),
  epsilon: qty.optional().describe('Dehnung, z. B. 0.001, "0,1 %", "1 ‰", "500 µm/m"'),
  E: qty.optional().describe('E-Modul, z. B. "210 GPa" oder "70000 N/mm²"'),
  F: qty.optional().describe('Kraft, z. B. "10 kN"'),
  A: qty.optional().describe('Querschnittsfläche, z. B. "100 mm²"'),
  d: qty.optional().describe('Durchmesser (Vollkreis), z. B. "10 mm" — spannung: A = π·d²/4; biegespannung: Kreisquerschnitt'),
  alpha: qty.optional().describe('Wärmeausdehnungskoeffizient, z. B. "12e-6 1/K" oder "12 µm/(m·K)"'),
  L0: qty.optional().describe('Ausgangslänge, z. B. "1 m"'),
  delta_T: qty.optional().describe('Temperaturdifferenz, z. B. "100 K"'),
  T1: qty.optional().describe("statt delta_T: Anfangstemperatur (°C oder K, wie T2)"),
  T2: qty.optional().describe("statt delta_T: Endtemperatur"),
  M: qty.optional().describe('Biegemoment, z. B. "1 kNm" oder "500 Nm"'),
  I: qty.optional().describe('Flächenträgheitsmoment, z. B. "869 cm⁴"'),
  e: qty.optional().describe('Randfaserabstand, z. B. "80 mm"'),
  W: qty.optional().describe('Widerstandsmoment, z. B. "109 cm³"'),
  b: qty.optional().describe("Rechteck: Breite"),
  h: qty.optional().describe("Rechteck: Höhe (in Lastrichtung)"),
  eps_quer: qty.optional().describe("Querdehnung (bei Zug negativ)"),
  eps_laengs: qty.optional().describe("Längsdehnung"),
  nu: z.number().optional().describe("Querkontraktionszahl ν"),
  G: qty.optional().describe("Schubmodul"),
});
export type MaterialsInput = z.infer<typeof materialsInputSchema>;

const LIMITS =
  "Abgedeckt: Hooke (σ = E·ε), Normalspannung σ = F/A, Wärmedehnung und Wärmespannung, Biegespannung für " +
  "Rechteck, Kreis oder gegebenes I/W, Querkontraktion und G = E/(2(1+ν)). Linear-elastisch. NICHT abgedeckt: " +
  "Plastizität, Kerbwirkung, Knicken, Verbundquerschnitte. Lagerkräfte und M(x) → balkenstatik.";

export type MaterialsResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

const MPa = (v: number) => sig(v / 1e6);
const GPa = (v: number) => sig(v / 1e9);

export function solveMaterials(raw: MaterialsInput): MaterialsResult {
  try {
    const input = materialsInputSchema.parse(raw);
    switch (input.aufgabe) {
      case "hooke": {
        const r = solveHookesLaw({ sigma: q(input.sigma, STRESS, "σ"), epsilon: q(input.epsilon, STRAIN, "ε"), E: q(input.E, STRESS, "E") });
        return {
          ok: true,
          gesucht: r.gesucht,
          sigma_MPa: MPa(r.sigma),
          epsilon: sig(r.epsilon),
          epsilon_promille: sig(r.epsilon * 1e3),
          E_GPa: GPa(r.E),
          formel: r.formel,
          gueltigkeit: ELASTIC_NOTE,
        };
      }
      case "spannung": {
        const d = q(input.d, LENGTH, "d");
        const A = q(input.A, AREA, "A") ?? (d !== undefined ? circleArea(positive("d", d)) : undefined);
        const r = solveStress({ F: q(input.F, FORCE, "F"), A, sigma: q(input.sigma, STRESS, "σ") });
        return {
          ok: true,
          gesucht: r.gesucht,
          sigma_MPa: MPa(r.sigma),
          F_kN: sig(r.F / 1e3),
          A_mm2: sig(r.A * 1e6),
          ...(d !== undefined && input.A === undefined ? { A_aus_d: "A = π·d²/4" } : {}),
          formel: r.formel,
          gueltigkeit: ELASTIC_NOTE,
        };
      }
      case "waermedehnung": {
        let dT = q(input.delta_T, DELTA_T, "ΔT");
        if (dT === undefined && input.T1 !== undefined && input.T2 !== undefined) {
          dT = (q(input.T2, TEMP_ABS, "T2") as number) - (q(input.T1, TEMP_ABS, "T1") as number);
        }
        const r = solveThermalExpansion({
          alpha: q(input.alpha, ALPHA, "α") as number,
          L0: q(input.L0, LENGTH, "L0") as number,
          dT: dT as number,
          E: q(input.E, STRESS, "E"),
        });
        return {
          ok: true,
          delta_L_mm: sig(r.dL * 1e3),
          L_neu_m: sig(r.L),
          epsilon_th: sig(r.epsilon_th),
          ...(r.sigma_behindert !== undefined
            ? { sigma_behindert_MPa: MPa(r.sigma_behindert), sigma_formel: "σ = −E·α·ΔT (Dehnung vollständig behindert; Erwärmung → Druck)" }
            : {}),
          formel: "ΔL = α · L₀ · ΔT",
        };
      }
      case "biegespannung": {
        const r = solveBeamBendingStress({
          M: q(input.M, MOMENT, "M") as number,
          I: q(input.I, INERTIA, "I"),
          e: q(input.e, LENGTH, "e"),
          W: q(input.W, SECTION, "W"),
          b: q(input.b, LENGTH, "b"),
          h: q(input.h, LENGTH, "h"),
          d: q(input.d, LENGTH, "d"),
        });
        return {
          ok: true,
          sigma_b_MPa: MPa(r.sigma_b),
          ...(Number.isFinite(r.I) ? { I_mm4: sig(r.I * 1e12), e_mm: sig(r.e * 1e3) } : {}),
          W_mm3: sig(r.W * 1e9),
          querschnitt: r.querschnitt,
          formel: r.formel,
          gueltigkeit: ELASTIC_NOTE,
        };
      }
      case "querkontraktion": {
        const r = solvePoissonRatio({
          eps_quer: q(input.eps_quer, STRAIN, "ε_quer"),
          eps_laengs: q(input.eps_laengs, STRAIN, "ε_längs"),
          nu: input.nu,
          E: q(input.E, STRESS, "E"),
          G: q(input.G, STRESS, "G"),
        });
        return {
          ok: true,
          nu: sig(r.nu),
          ...(r.E !== undefined ? { E_GPa: GPa(r.E) } : {}),
          ...(r.G !== undefined ? { G_GPa: GPa(r.G) } : {}),
          formel: r.G !== undefined ? `${r.formel} ; G = E / (2(1 + ν))` : r.formel,
          bemerkung: r.bemerkung,
        };
      }
    }
  } catch (err) {
    if (err instanceof MaterialsError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    throw err;
  }
}
