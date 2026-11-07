/**
 * Chemie — die Grundrechnungen, exakt und mit Probe.
 *
 *   molare_masse    M aus der Summenformel ("H2SO4", "Ca(OH)2", "CuSO4·5H2O"),
 *                   Massenanteile
 *   konzentration   c = n/V (n auch aus m und M bzw. Formel)
 *   stoechiometrie  n_B = n_A · ν_B/ν_A aus einer Reaktionsgleichung, die
 *                   vorher auf Atom- und Ladungsbilanz GEPRÜFT wird
 *   ph              pH/pOH aus c(H₃O⁺) bzw. c(OH⁻), starke und schwache
 *                   Säuren/Basen (exakte quadratische Lösung), Puffer
 *                   (Henderson-Hasselbalch), Konzentration aus dem pH
 *   ideales_gas     p·V = n·R·T in Chemie-Einheiten (L, atm/kPa/bar, °C) —
 *                   gerechnet von solveIdealGas (thermo-solver), nur die
 *                   Einheiten sind hier
 *
 * Alles bei 25 °C (K_w = 10⁻¹⁴). Atommassen: IUPAC-Standardatomgewichte
 * (konventionelle Werte, 4–5 signifikante Stellen wie im Periodensystem
 * der Schulbücher).
 */
import { z } from "zod";
import { R_MOLAR, solveIdealGas, ThermoFormulaError } from "../thermo-solver";
import { isNum, parseQuantity, sig, type UnitTable } from "./quantity";

export class ChemistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChemistryError";
  }
}
const fail = (m: string) => new ChemistryError(m);

/** Ionenprodukt des Wassers bei 25 °C. */
export const KW = 1e-14;

/* -------------------------------------------------------------------------- */
/* Atommassen (g/mol) — IUPAC, konventionelle Standardatomgewichte            */
/* -------------------------------------------------------------------------- */

export const ATOMIC_MASS: Record<string, number> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.18,
  Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078,
  Sc: 44.956, Ti: 47.867, V: 50.942, Cr: 51.996, Mn: 54.938, Fe: 55.845, Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38,
  Ga: 69.723, Ge: 72.63, As: 74.922, Se: 78.971, Br: 79.904, Kr: 83.798, Rb: 85.468, Sr: 87.62, Y: 88.906, Zr: 91.224,
  Mo: 95.95, Ag: 107.87, Cd: 112.41, Sn: 118.71, Sb: 121.76, I: 126.9, Xe: 131.29, Cs: 132.91, Ba: 137.33,
  W: 183.84, Pt: 195.08, Au: 196.97, Hg: 200.59, Pb: 207.2, Bi: 208.98, U: 238.03,
};

/* -------------------------------------------------------------------------- */
/* Summenformeln                                                              */
/* -------------------------------------------------------------------------- */

export interface Species {
  formel: string;
  atome: Record<string, number>;
  ladung: number;
}

function parseGroup(src: string, whole: string): Record<string, number> {
  const atoms: Record<string, number> = {};
  const stack: Record<string, number>[] = [atoms];
  const re = /([A-Z][a-z]?)|(\d+)|([([])|([)\]])/g;
  let pos = 0;
  let last: Record<string, number> | string | null = null;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index !== pos) throw fail(`Formel "${whole}" nicht lesbar bei "${src.slice(pos)}".`);
    pos = re.lastIndex;
    const top = stack[stack.length - 1];
    if (m[1]) {
      if (!(m[1] in ATOMIC_MASS)) throw fail(`Unbekanntes Element "${m[1]}" in "${whole}" (Groß-/Kleinschreibung: Co = Cobalt, CO = Kohlenmonoxid).`);
      top[m[1]] = (top[m[1]] ?? 0) + 1;
      last = m[1];
    } else if (m[2]) {
      const k = Number(m[2]);
      if (typeof last === "string") stack[stack.length - 1][last] += k - 1;
      else if (last && typeof last === "object") for (const [el, c] of Object.entries(last)) stack[stack.length - 1][el] += c * (k - 1);
      else throw fail(`Zahl ohne Element in "${whole}".`);
      last = null;
    } else if (m[3]) {
      stack.push({});
      last = null;
    } else {
      if (stack.length === 1) throw fail(`Klammer ohne Gegenstück in "${whole}".`);
      const inner = stack.pop()!;
      const outer = stack[stack.length - 1];
      for (const [el, c] of Object.entries(inner)) outer[el] = (outer[el] ?? 0) + c;
      last = inner;
    }
  }
  if (pos !== src.length) throw fail(`Formel "${whole}" nicht lesbar bei "${src.slice(pos)}".`);
  if (stack.length !== 1) throw fail(`Klammer nicht geschlossen in "${whole}".`);
  return atoms;
}

/**
 * "H2SO4", "Ca(OH)2", "CuSO4·5H2O", "Fe^3+", "SO4^2-", "OH-", "NaCl(aq)".
 * Ladungen mit ^ ("Fe^3+"); ein einzelnes + oder − am Ende = ±1.
 */
export function parseFormula(input: string): Species {
  let s = String(input ?? "").trim().replace(/\s+/g, "");
  if (!s) throw fail("Leere Formel.");
  s = s.replace(/\((aq|s|l|g)\)$/i, "");
  let ladung = 0;
  const caret = /\^(\d*)([+-])$/.exec(s);
  if (caret) {
    ladung = (caret[2] === "+" ? 1 : -1) * (caret[1] ? Number(caret[1]) : 1);
    s = s.slice(0, caret.index);
  } else if (/[+-]$/.test(s)) {
    ladung = s.endsWith("+") ? 1 : -1;
    s = s.slice(0, -1);
  }
  // Elektron in Redox-Teilgleichungen: "e-" bzw. "2 e-".
  if (s === "e" && ladung === -1) return { formel: String(input).trim(), atome: {}, ladung };
  const atome: Record<string, number> = {};
  for (const part of s.split(/[·*•.]/)) {
    if (!part) throw fail(`Formel "${input}" nicht lesbar (leerer Teil um "·").`);
    const m = /^(\d+)?(.*)$/.exec(part)!;
    const k = m[1] ? Number(m[1]) : 1;
    for (const [el, c] of Object.entries(parseGroup(m[2], input))) atome[el] = (atome[el] ?? 0) + c * k;
  }
  if (Object.keys(atome).length === 0) throw fail(`Formel "${input}" enthält kein Element.`);
  return { formel: String(input).trim(), atome, ladung };
}

const massOf = (atome: Record<string, number>) => Object.entries(atome).reduce((sum, [el, n]) => sum + n * ATOMIC_MASS[el], 0);

export interface MolarMassResult {
  formel: string;
  M: number;
  zusammensetzung: { element: string; anzahl: number; masse: number; anteil_prozent: number }[];
  rechnung: string;
}

export function molarMass(formula: string): MolarMassResult {
  const sp = parseFormula(formula);
  const rows = Object.entries(sp.atome).map(([element, anzahl]) => ({ element, anzahl, masse: anzahl * ATOMIC_MASS[element] }));
  const M = rows.reduce((s, r) => s + r.masse, 0);
  return {
    formel: sp.formel,
    M,
    zusammensetzung: rows.map((r) => ({ ...r, masse: sig(r.masse, 8), anteil_prozent: sig((100 * r.masse) / M, 5) })),
    rechnung: `M = ${rows.map((r) => `${r.anzahl > 1 ? `${r.anzahl}·` : ""}${ATOMIC_MASS[r.element]}`).join(" + ")} = ${sig(M, 8)} g/mol`,
  };
}

/* -------------------------------------------------------------------------- */
/* Reaktionsgleichungen                                                       */
/* -------------------------------------------------------------------------- */

export interface EquationTerm extends Species {
  koeffizient: number;
}

export interface Equation {
  links: EquationTerm[];
  rechts: EquationTerm[];
  ausgeglichen: boolean;
  /** z. B. "H: links 4, rechts 2". */
  fehler: string[];
}

function parseTerm(raw: string): EquationTerm {
  const t = raw.trim();
  const m = /^(\d+\/\d+|\d+(?:[.,]\d+)?)?\s*(.+)$/.exec(t);
  if (!m) throw fail(`Term "${raw}" nicht lesbar.`);
  let k = 1;
  if (m[1]) {
    const [a, b] = m[1].split("/");
    k = b ? Number(a) / Number(b) : Number(m[1].replace(",", "."));
  }
  if (!(k > 0)) throw fail(`Koeffizient in "${raw}" muss positiv sein.`);
  return { koeffizient: k, ...parseFormula(m[2]) };
}

/** "2 H2 + O2 -> 2 H2O" ; Pfeile -> → => ⟶ = ⇌ <=> <->. Stoffe mit " + " (Leerzeichen) trennen. */
export function parseEquation(eq: string): Equation {
  const sides = String(eq ?? "").split(/\s*(?:<=>|<->|⇌|->|=>|→|⟶|=)\s*/);
  if (sides.length !== 2 || !sides[0].trim() || !sides[1].trim()) {
    throw fail('Reaktionsgleichung braucht genau einen Pfeil, z. B. "2 H2 + O2 -> 2 H2O".');
  }
  const side = (s: string) => s.split(/\s+\+\s+/).map(parseTerm);
  const links = side(sides[0]);
  const rechts = side(sides[1]);
  const count = (terms: EquationTerm[]) => {
    const c: Record<string, number> = {};
    for (const t of terms) for (const [el, n] of Object.entries(t.atome)) c[el] = (c[el] ?? 0) + n * t.koeffizient;
    return c;
  };
  const L = count(links);
  const R = count(rechts);
  const fehler: string[] = [];
  for (const el of new Set([...Object.keys(L), ...Object.keys(R)])) {
    if (Math.abs((L[el] ?? 0) - (R[el] ?? 0)) > 1e-9) fehler.push(`${el}: links ${sig(L[el] ?? 0, 6)}, rechts ${sig(R[el] ?? 0, 6)}`);
  }
  const q = (terms: EquationTerm[]) => terms.reduce((s, t) => s + t.ladung * t.koeffizient, 0);
  if (Math.abs(q(links) - q(rechts)) > 1e-9) fehler.push(`Ladung: links ${sig(q(links), 6)}, rechts ${sig(q(rechts), 6)}`);
  return { links, rechts, ausgeglichen: fehler.length === 0, fehler };
}

/* -------------------------------------------------------------------------- */
/* Stoffmenge, Konzentration, Stöchiometrie                                   */
/* -------------------------------------------------------------------------- */

export interface MolarityResult {
  c: number;
  n: number;
  V: number;
  m?: number;
  M?: number;
  gesucht: "c" | "n" | "V";
  formeln: string[];
}

/** c = n/V (mol/L, mol, L). n darf aus m (g) und M (g/mol) kommen. */
export function solveMolarity(a: { c?: number; n?: number; V?: number; m?: number; M?: number }): MolarityResult {
  const formeln: string[] = [];
  let n = a.n;
  if (isNum(a.M) && !(a.M > 0)) throw fail("M muss positiv sein.");
  if (!isNum(n) && isNum(a.m) && isNum(a.M)) {
    n = a.m / a.M;
    formeln.push("n = m / M");
  }
  const vals = { c: a.c, n, V: a.V };
  const missing = (["c", "n", "V"] as const).filter((k) => !isNum(vals[k]));
  if (missing.length !== 1) throw fail(`Genau ZWEI von c, n (oder m mit M), V angeben (fehlend: ${missing.join(", ") || "keine"}).`);
  if (isNum(a.V) && !(a.V > 0)) throw fail("Das Volumen muss positiv sein.");
  const gesucht = missing[0];
  let c: number, V: number;
  if (gesucht === "c") {
    c = n! / a.V!;
    V = a.V!;
    formeln.push("c = n / V");
  } else if (gesucht === "n") {
    c = a.c!;
    V = a.V!;
    n = c * V;
    formeln.push("n = c · V");
  } else {
    if (!(a.c! > 0)) throw fail("Die Konzentration muss positiv sein.");
    c = a.c!;
    V = n! / c;
    formeln.push("V = n / c");
  }
  if (Math.abs(c * V - n!) > 1e-12 * Math.max(Math.abs(n!), 1e-300)) throw fail("Interne Probe c·V = n nicht erfüllt.");
  const out: MolarityResult = { c, n: n!, V, gesucht, formeln };
  if (isNum(a.M)) {
    out.M = a.M;
    out.m = n! * a.M;
    if (!isNum(a.m)) formeln.push("m = n · M");
  }
  return out;
}

export interface StoichiometryResult {
  gleichung?: string;
  gegeben: { formel?: string; koeffizient: number; n: number; m?: number; M?: number };
  gesucht: { formel?: string; koeffizient: number; n: number; m?: number; M?: number };
  verhaeltnis: string;
  formel: string;
}

/**
 * n_gesucht = n_gegeben · ν_gesucht / ν_gegeben. Mit Gleichung: Koeffizienten
 * und molare Massen kommen aus ihr — und nur aus einer AUSGEGLICHENEN.
 */
export function solveStoichiometry(a: {
  gleichung?: string;
  gegeben?: string;
  gesucht?: string;
  koeff_gegeben?: number;
  koeff_gesucht?: number;
  n_gegeben?: number;
  m_gegeben?: number;
  M_gegeben?: number;
  M_gesucht?: number;
}): StoichiometryResult {
  let nuA = a.koeff_gegeben;
  let nuB = a.koeff_gesucht;
  let MA = a.M_gegeben;
  let MB = a.M_gesucht;
  if (a.gleichung) {
    const eq = parseEquation(a.gleichung);
    if (!eq.ausgeglichen) {
      throw fail(`Die Reaktionsgleichung ist nicht ausgeglichen (${eq.fehler.join("; ")}). Erst ausgleichen, dann rechnen.`);
    }
    const all = [...eq.links, ...eq.rechts];
    const find = (f: string | undefined, role: string) => {
      if (!f) throw fail(`${role} fehlt: welcher Stoff aus der Gleichung?`);
      const key = parseFormula(f);
      const hit = all.find((t) => t.formel.replace(/\((aq|s|l|g)\)$/i, "") === f.trim().replace(/\((aq|s|l|g)\)$/i, "") ||
        (JSON.stringify(t.atome) === JSON.stringify(key.atome) && t.ladung === key.ladung));
      if (!hit) throw fail(`"${f}" kommt in der Gleichung nicht vor.`);
      return hit;
    };
    const A = find(a.gegeben, "gegeben");
    const B = find(a.gesucht, "gesucht");
    nuA = A.koeffizient;
    nuB = B.koeffizient;
    // Elektronenmasse vernachlässigt (wie im Periodensystem üblich).
    if (A.atome && Object.keys(A.atome).length) MA ??= massOf(A.atome);
    if (B.atome && Object.keys(B.atome).length) MB ??= massOf(B.atome);
  } else {
    if (!isNum(nuA) || !isNum(nuB)) throw fail("Ohne Gleichung: koeff_gegeben und koeff_gesucht angeben.");
    if (!a.gegeben && !isNum(MA) && isNum(a.m_gegeben)) throw fail("Für m_gegeben braucht es M_gegeben oder die Formel.");
    if (a.gegeben && !isNum(MA)) MA = molarMass(a.gegeben).M;
    if (a.gesucht && !isNum(MB)) MB = molarMass(a.gesucht).M;
  }
  if (!(nuA! > 0 && nuB! > 0)) throw fail("Stöchiometrische Koeffizienten müssen positiv sein.");
  let nA = a.n_gegeben;
  if (!isNum(nA)) {
    if (!isNum(a.m_gegeben) || !isNum(MA)) throw fail("Gegeben fehlt: n_gegeben (mol) oder m_gegeben (g).");
    nA = a.m_gegeben / MA;
  }
  const nB = (nA * nuB!) / nuA!;
  if (Math.abs((nB * nuA!) / nuB! - nA) > 1e-12 * Math.max(Math.abs(nA), 1e-300)) throw fail("Interne Probe nicht erfüllt.");
  return {
    ...(a.gleichung ? { gleichung: a.gleichung } : {}),
    gegeben: { formel: a.gegeben, koeffizient: nuA!, n: nA, ...(isNum(MA) ? { M: MA, m: nA * MA } : {}) },
    gesucht: { formel: a.gesucht, koeffizient: nuB!, n: nB, ...(isNum(MB) ? { M: MB, m: nB * MB } : {}) },
    verhaeltnis: `n(${a.gesucht ?? "B"}) : n(${a.gegeben ?? "A"}) = ${nuB} : ${nuA}`,
    formel: "n_gesucht = n_gegeben · ν_gesucht / ν_gegeben ; m = n · M",
  };
}

/* -------------------------------------------------------------------------- */
/* pH                                                                         */
/* -------------------------------------------------------------------------- */

export interface PhResult {
  pH: number;
  pOH: number;
  c_H3O: number;
  c_OH: number;
  modell: string;
  formel: string;
  /** Nur bei schwachen Säuren/Basen: Protolysegrad α. */
  protolysegrad?: number;
  naeherung?: string;
}

function phFrom(cH: number, modell: string, formel: string, extra: Partial<PhResult> = {}): PhResult {
  if (!(cH > 0)) throw fail("Die Oxoniumionen-Konzentration muss positiv sein.");
  const cOH = KW / cH;
  const pH = -Math.log10(cH);
  const r = { pH, pOH: 14 - pH, c_H3O: cH, c_OH: cOH, modell, formel, ...extra };
  if (Math.abs(r.c_H3O * r.c_OH - KW) > 1e-9 * KW) throw fail("Interne Probe K_w nicht erfüllt.");
  return r;
}

/** pH = −lg c(H₃O⁺). */
export function solvePH(cH3O: number): PhResult {
  return phFrom(cH3O, "c(H₃O⁺) gegeben", "pH = −lg c(H₃O⁺)");
}

/** pOH = −lg c(OH⁻), pH = 14 − pOH (25 °C). */
export function solvePOH(cOH: number): PhResult {
  if (!(cOH > 0)) throw fail("Die Hydroxidionen-Konzentration muss positiv sein.");
  return phFrom(KW / cOH, "c(OH⁻) gegeben", "pOH = −lg c(OH⁻), pH = 14 − pOH");
}

/**
 * Starke Säure, vollständig protolysiert: c(H₃O⁺) = z·c — exakt mit der
 * Eigenprotolyse des Wassers: x = z·c/2 + √((z·c/2)² + K_w). Für c ≫ 10⁻⁷
 * identisch mit −lg(z·c); bei 10⁻⁸ mol/L HCl ergibt sie 6,98 statt „8“.
 */
export function solveStrongAcid(c: number, z = 1): PhResult {
  if (!(c > 0) || !(z >= 1)) throw fail("c > 0 und Protonenzahl z ≥ 1 angeben.");
  const ca = z * c;
  const x = ca / 2 + Math.sqrt((ca / 2) ** 2 + KW);
  return phFrom(x, "starke Säure (vollständige Protolyse)", "c(H₃O⁺) = z·c (mit Eigenprotolyse des Wassers)", {
    naeherung: `pH ≈ −lg(${sig(ca, 6)}) = ${sig(-Math.log10(ca), 6)}`,
  });
}

export function solveStrongBase(c: number, z = 1): PhResult {
  if (!(c > 0) || !(z >= 1)) throw fail("c > 0 und Anzahl OH⁻ je Formeleinheit z ≥ 1 angeben.");
  const cb = z * c;
  const y = cb / 2 + Math.sqrt((cb / 2) ** 2 + KW);
  return phFrom(KW / y, "starke Base (vollständige Protolyse)", "c(OH⁻) = z·c, pH = 14 − pOH", {
    naeherung: `pOH ≈ −lg(${sig(cb, 6)}) = ${sig(-Math.log10(cb), 6)}`,
  });
}

/** Schwache Säure HA: K_s = x²/(c − x) → x = (−K_s + √(K_s² + 4·K_s·c)) / 2. */
export function solveWeakAcid(c: number, Ka: number): PhResult {
  if (!(c > 0) || !(Ka > 0)) throw fail("c > 0 und K_s > 0 (bzw. pK_s) angeben.");
  const x = (-Ka + Math.sqrt(Ka * Ka + 4 * Ka * c)) / 2;
  if (Math.abs((x * x) / (c - x) - Ka) > 1e-6 * Ka) throw fail("Interne Probe K_s = x²/(c − x) nicht erfüllt.");
  const pKa = -Math.log10(Ka);
  return phFrom(x, "schwache Säure (Protolysegleichgewicht, exakt)", "K_s = c(H₃O⁺)² / (c₀ − c(H₃O⁺))", {
    protolysegrad: x / c,
    naeherung: `pH ≈ ½·(pK_s − lg c₀) = ${sig(0.5 * (pKa - Math.log10(c)), 6)}`,
  });
}

export function solveWeakBase(c: number, Kb: number): PhResult {
  if (!(c > 0) || !(Kb > 0)) throw fail("c > 0 und K_b > 0 (bzw. pK_b) angeben.");
  const y = (-Kb + Math.sqrt(Kb * Kb + 4 * Kb * c)) / 2;
  if (Math.abs((y * y) / (c - y) - Kb) > 1e-6 * Kb) throw fail("Interne Probe K_b nicht erfüllt.");
  const pKb = -Math.log10(Kb);
  return phFrom(KW / y, "schwache Base (Protolysegleichgewicht, exakt)", "K_b = c(OH⁻)² / (c₀ − c(OH⁻)), pH = 14 − pOH", {
    protolysegrad: y / c,
    naeherung: `pOH ≈ ½·(pK_b − lg c₀) = ${sig(0.5 * (pKb - Math.log10(c)), 6)}`,
  });
}

/** Henderson-Hasselbalch: pH = pK_s + lg(c(A⁻)/c(HA)). */
export function solveBuffer(pKa: number, cHA: number, cA: number): PhResult & { hinweis: string } {
  if (!isNum(pKa) || !(cHA > 0) || !(cA > 0)) throw fail("pK_s, c(HA) > 0 und c(A⁻) > 0 angeben.");
  const ratio = cA / cHA;
  const pH = pKa + Math.log10(ratio);
  const r = phFrom(10 ** -pH, "Puffer (Henderson-Hasselbalch)", "pH = pK_s + lg(c(A⁻) / c(HA))");
  return {
    ...r,
    hinweis:
      ratio < 0.1 || ratio > 10
        ? "Verhältnis außerhalb 1:10 … 10:1 — die Pufferwirkung ist dort schwach, die Gleichung nur noch grob."
        : "Pufferbereich: pH = pK_s ± 1.",
  };
}

/* -------------------------------------------------------------------------- */
/* Ideales Gas in Chemie-Einheiten                                            */
/* -------------------------------------------------------------------------- */

export const R_LATM = 0.082057366; // L·atm/(mol·K)

export interface GasChemResult {
  p_kPa: number;
  p_atm: number;
  V_L: number;
  T_K: number;
  T_C: number;
  n_mol: number;
  gesucht: "p" | "V" | "T" | "n";
  formel: string;
}

/** SI hinein (Pa, m³, K, mol), solveIdealGas rechnet, Chemie-Einheiten heraus. */
export function solveIdealGasChem(a: { p?: number; V?: number; T?: number; n?: number }): GasChemResult {
  try {
    const r = solveIdealGas(a.p, a.V, a.T, a.n, R_MOLAR);
    return { p_kPa: r.p / 1e3, p_atm: r.p / 101325, V_L: r.V * 1e3, T_K: r.T, T_C: r.T - 273.15, n_mol: r.n, gesucht: r.gesucht, formel: r.formel };
  } catch (err) {
    if (err instanceof ThermoFormulaError) throw fail(err.message);
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Werkzeug                                                                   */
/* -------------------------------------------------------------------------- */

const MOL: UnitTable = { mol: 1, mmol: 1e-3, µmol: 1e-6, umol: 1e-6, kmol: 1e3 };
const VOL: UnitTable = { L: 1, l: 1, mL: 1e-3, ml: 1e-3, µL: 1e-6, dL: 0.1, "dm³": 1, dm3: 1, "cm³": 1e-3, cm3: 1e-3, "m³": 1e3, m3: 1e3 };
const CONC: UnitTable = { "mol/L": 1, "mol/l": 1, M: 1, mM: 1e-3, "mmol/L": 1e-3, "mmol/l": 1e-3, "µmol/L": 1e-6, "mol/dm³": 1, "mol/dm3": 1, "mol/m³": 1e-3 };
const MASS: UnitTable = { g: 1, mg: 1e-3, µg: 1e-6, kg: 1e3 };
const MOLAR: UnitTable = { "g/mol": 1, "kg/mol": 1e3 };
// Gas: SI
const P_SI: UnitTable = { Pa: 1, hPa: 100, kPa: 1e3, MPa: 1e6, bar: 1e5, mbar: 100, atm: 101325, Torr: 101325 / 760, mmHg: 133.322387415 };
const V_SI: UnitTable = { "m³": 1, m3: 1, L: 1e-3, l: 1e-3, mL: 1e-6, ml: 1e-6, "dm³": 1e-3, dm3: 1e-3, "cm³": 1e-6, cm3: 1e-6 };
const T_SI: UnitTable = { K: 1, "°C": (v) => v + 273.15 };

type Qty = number | string;
const q = (v: Qty | null | undefined, units: UnitTable, what: string): number | undefined =>
  v === undefined || v === null || v === "" ? undefined : parseQuantity(v, units, what, fail);
const qty = z.union([z.number(), z.string().max(40)]);

export const chemistryInputSchema = z.object({
  aufgabe: z.enum(["molare_masse", "konzentration", "stoechiometrie", "ph", "ideales_gas"]),
  formel: z.string().max(60).optional().describe('molare_masse, konzentration: Summenformel, z. B. "H2SO4", "Ca(OH)2", "CuSO4·5H2O"'),
  c: qty.optional().describe('Stoffmengenkonzentration, z. B. "0,1 mol/L"'),
  n: qty.optional().describe('Stoffmenge, z. B. "0,5 mol"'),
  V: qty.optional().describe('Volumen, z. B. "250 mL"'),
  m: qty.optional().describe('Masse, z. B. "5,844 g"'),
  M: qty.optional().describe("molare Masse (sonst aus formel)"),
  gleichung: z.string().max(200).optional().describe('stoechiometrie: z. B. "CH4 + 2 O2 -> CO2 + 2 H2O" (wird auf Ausgleich geprüft)'),
  gegeben: z.string().max(60).optional().describe("stoechiometrie: Formel des gegebenen Stoffs"),
  gesucht: z.string().max(60).optional().describe("stoechiometrie: Formel des gesuchten Stoffs"),
  koeff_gegeben: z.number().optional().describe("stoechiometrie ohne Gleichung: ν des gegebenen Stoffs"),
  koeff_gesucht: z.number().optional().describe("stoechiometrie ohne Gleichung: ν des gesuchten Stoffs"),
  modell: z
    .enum(["oxonium", "hydroxid", "starke_saeure", "starke_base", "schwache_saeure", "schwache_base", "puffer", "aus_ph"])
    .optional()
    .describe("ph: oxonium (c = c(H₃O⁺)), hydroxid (c = c(OH⁻)), starke_saeure/-base (c, optional z), schwache_saeure/-base (c, Ks/pKs bzw. Kb/pKb), puffer (pKs, c_saeure, c_base), aus_ph (pH)"),
  z: z.number().int().min(1).max(4).optional().describe("ph: Protonen bzw. OH⁻ je Formeleinheit (z. B. Ba(OH)2 → 2), nur starke"),
  Ks: z.number().optional(),
  pKs: z.number().optional(),
  Kb: z.number().optional(),
  pKb: z.number().optional(),
  c_saeure: qty.optional().describe("puffer: c(HA)"),
  c_base: qty.optional().describe("puffer: c(A⁻)"),
  pH: z.number().optional().describe("aus_ph"),
  p: qty.optional().describe('ideales_gas: Druck, z. B. "1 atm", "101,3 kPa", "1 bar"'),
  T: qty.optional().describe('ideales_gas: Temperatur, z. B. "25 °C" oder "298 K"'),
});
export type ChemistryInput = z.infer<typeof chemistryInputSchema>;

const LIMITS =
  "Abgedeckt: molare Masse aus der Summenformel, c = n/V, Stöchiometrie über eine ausgeglichene Gleichung, pH/pOH " +
  "(starke und schwache einprotonige Säuren/Basen exakt, Puffer nach Henderson-Hasselbalch), ideales Gas, alles bei " +
  "25 °C. NICHT abgedeckt: Ausgleichen von Gleichungen (prüft nur), mehrprotonige schwache Säuren, Titrationskurven, " +
  "Aktivitäten, Thermochemie. Stoffwerte (pK_s …) aus dem Skript übernehmen.";

export type ChemistryResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

function phOut(r: PhResult & { hinweis?: string }) {
  return {
    ok: true as const,
    pH: sig(r.pH, 6),
    pOH: sig(r.pOH, 6),
    c_H3O_mol_L: sig(r.c_H3O, 6),
    c_OH_mol_L: sig(r.c_OH, 6),
    modell: r.modell,
    formel: r.formel,
    ...(r.protolysegrad !== undefined ? { protolysegrad: sig(r.protolysegrad, 6) } : {}),
    ...(r.naeherung ? { naeherung: r.naeherung } : {}),
    ...(r.hinweis ? { hinweis: r.hinweis } : {}),
    bedingung: "25 °C, K_w = 10⁻¹⁴, Konzentrationen statt Aktivitäten",
  };
}

export function solveChemistry(raw: ChemistryInput): ChemistryResult {
  try {
    const input = chemistryInputSchema.parse(raw);
    switch (input.aufgabe) {
      case "molare_masse": {
        if (!input.formel) throw fail("formel fehlt.");
        const r = molarMass(input.formel);
        return { ok: true, formel: r.formel, M_g_mol: sig(r.M, 6), zusammensetzung: r.zusammensetzung, rechnung: r.rechnung };
      }
      case "konzentration": {
        const M = q(input.M, MOLAR, "M") ?? (input.formel ? molarMass(input.formel).M : undefined);
        const r = solveMolarity({ c: q(input.c, CONC, "c"), n: q(input.n, MOL, "n"), V: q(input.V, VOL, "V"), m: q(input.m, MASS, "m"), M });
        return {
          ok: true,
          gesucht: r.gesucht,
          c_mol_L: sig(r.c),
          n_mol: sig(r.n),
          V_L: sig(r.V),
          ...(r.m !== undefined ? { m_g: sig(r.m), M_g_mol: sig(r.M!, 6) } : {}),
          formeln: r.formeln,
        };
      }
      case "stoechiometrie": {
        const r = solveStoichiometry({
          gleichung: input.gleichung,
          gegeben: input.gegeben,
          gesucht: input.gesucht,
          koeff_gegeben: input.koeff_gegeben,
          koeff_gesucht: input.koeff_gesucht,
          n_gegeben: q(input.n, MOL, "n"),
          m_gegeben: q(input.m, MASS, "m"),
          M_gegeben: q(input.M, MOLAR, "M"),
        });
        const side = (s: StoichiometryResult["gegeben"]) => ({
          formel: s.formel,
          koeffizient: s.koeffizient,
          n_mol: sig(s.n),
          ...(s.M !== undefined ? { M_g_mol: sig(s.M, 6), m_g: sig(s.m!) } : {}),
        });
        return {
          ok: true,
          ...(r.gleichung ? { gleichung: r.gleichung, ausgeglichen: true } : {}),
          gegeben: side(r.gegeben),
          gesucht: side(r.gesucht),
          verhaeltnis: r.verhaeltnis,
          formel: r.formel,
        };
      }
      case "ph": {
        const c = q(input.c, CONC, "c");
        const Ka = input.Ks ?? (isNum(input.pKs) ? 10 ** -input.pKs : undefined);
        const Kb = input.Kb ?? (isNum(input.pKb) ? 10 ** -input.pKb : undefined);
        const need = (v: number | undefined, name: string) => {
          if (!isNum(v)) throw fail(`${name} fehlt.`);
          return v;
        };
        switch (input.modell ?? "oxonium") {
          case "oxonium":
            return phOut(solvePH(need(c, "c (= c(H₃O⁺))")));
          case "hydroxid":
            return phOut(solvePOH(need(c, "c (= c(OH⁻))")));
          case "starke_saeure":
            return phOut(solveStrongAcid(need(c, "c"), input.z ?? 1));
          case "starke_base":
            return phOut(solveStrongBase(need(c, "c"), input.z ?? 1));
          case "schwache_saeure":
            return phOut(solveWeakAcid(need(c, "c"), need(Ka, "Ks bzw. pKs")));
          case "schwache_base":
            return phOut(solveWeakBase(need(c, "c"), need(Kb, "Kb bzw. pKb")));
          case "puffer":
            return phOut(
              solveBuffer(
                need(input.pKs ?? (isNum(input.Ks) ? -Math.log10(input.Ks) : undefined), "pKs"),
                need(q(input.c_saeure, CONC, "c_saeure"), "c_saeure"),
                need(q(input.c_base, CONC, "c_base"), "c_base"),
              ),
            );
          case "aus_ph":
            return phOut(phFrom(10 ** -need(input.pH, "pH"), "pH gegeben", "c(H₃O⁺) = 10^(−pH)"));
        }
        break;
      }
      case "ideales_gas": {
        const M = q(input.M, MOLAR, "M") ?? (input.formel ? molarMass(input.formel).M : undefined);
        const m = q(input.m, MASS, "m");
        const n = q(input.n, MOL, "n") ?? (isNum(m) && isNum(M) ? m / M : undefined);
        const r = solveIdealGasChem({ p: q(input.p, P_SI, "p"), V: q(input.V, V_SI, "V"), T: q(input.T, T_SI, "T"), n });
        return {
          ok: true,
          gesucht: r.gesucht,
          p_kPa: sig(r.p_kPa),
          p_atm: sig(r.p_atm),
          V_L: sig(r.V_L),
          T_K: sig(r.T_K),
          T_C: sig(r.T_C),
          n_mol: sig(r.n_mol),
          ...(isNum(M) ? { m_g: sig(r.n_mol * M) } : {}),
          formel: r.formel,
          R: "R = 8,314 J/(mol·K) = 0,08206 L·atm/(mol·K)",
        };
      }
    }
    throw fail("Unbekannte Aufgabe.");
  } catch (err) {
    if (err instanceof ChemistryError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    throw err;
  }
}
