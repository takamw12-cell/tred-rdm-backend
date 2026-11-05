import { describe, expect, test } from "bun:test";

import {
  parseSi,
  solveCircuit,
  type CircuitInput,
  type CircuitResult,
} from "../src/api/lib/solvers/solveCircuit";

/**
 * solveCircuit — chaque cas est résolu À LA MAIN dans le commentaire, puis
 * comparé au solveur. Si un jour le solveur et la main divergent, c'est le
 * test qui le dit, pas un étudiant la veille de la Klausur.
 */

const solve = (input: CircuitInput): CircuitResult => {
  const r = solveCircuit(input);
  if (!r.ok) throw new Error(`Solveur en erreur : ${r.fehler}`);
  return r;
};
const el = (r: CircuitResult, name: string) => r.elemente.find((e) => e.name === name)!;
const node = (r: CircuitResult, name: string) => r.knoten.find((k) => k.name === name)!.potential;
const close = (actual: number, expected: number, rel = 1e-6) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel + 1e-12);

describe("parseSi", () => {
  test("Präfixe, Einheiten, Bauteil-Schreibweise, Dezimalkomma", () => {
    expect(parseSi("4.7k")).toBe(4700);
    expect(parseSi("4,7 kΩ")).toBe(4700);
    expect(parseSi("4k7")).toBe(4700);
    expect(parseSi("4R7")).toBeCloseTo(4.7, 12);
    expect(parseSi("100nF")).toBeCloseTo(100e-9, 20);
    expect(parseSi("10 mH")).toBeCloseTo(0.01, 15);
    expect(parseSi("2.2MΩ")).toBe(2.2e6);
    expect(parseSi("2.2meg")).toBe(2.2e6);
    expect(parseSi("1e3")).toBe(1000);
    expect(parseSi(12)).toBe(12);
  });
  test("m und M werden nicht verwechselt", () => {
    expect(parseSi("1m")).toBe(0.001);
    expect(parseSi("1M")).toBe(1e6);
  });
  test("Unlesbares wird abgelehnt statt geraten", () => {
    expect(() => parseSi("viel")).toThrow();
    expect(() => parseSi("1x")).toThrow();
  });
});

describe("C1 — Spannungsteiler (DC)", () => {
  // U0 = 12 V, R1 = 1 kΩ oben, R2 = 2 kΩ unten.
  // I = 12 / 3000 = 4 mA ; U2 = 12 · 2/3 = 8 V ; P_R1 = 16 mW ; P_R2 = 32 mW ;
  // die Quelle gibt 48 mW ab (VZS: −48 mW).
  const r = solve({
    elemente: [
      { typ: "V", name: "U0", a: "1", b: "0", wert: 12 },
      { typ: "R", name: "R1", a: "1", b: "2", wert: "1k" },
      { typ: "R", name: "R2", a: "2", b: "0", wert: "2k" },
    ],
  });
  test("Teilerspannung und Strom", () => {
    close(node(r, "2").re, 8);
    close(el(r, "R1").strom.re, 0.004);
    close(el(r, "R2").spannung.re, 8);
  });
  test("Leistungen und Bilanz", () => {
    close(el(r, "R1").wirkleistung, 0.016);
    close(el(r, "R2").wirkleistung, 0.032);
    close(el(r, "U0").wirkleistung, -0.048);
    expect(r.kontrolle.bestanden).toBe(true);
  });
});

describe("C2 — Kirchhoff, zwei Quellen (Knotenpotentialverfahren)", () => {
  // V1 = 10 V an A1, V2 = 5 V an A2. R1 = 2 Ω (A1–N), R2 = 4 Ω (N–A2), R3 = 4 Ω (N–0).
  // Knoten N : (10 − φ)/2 + (5 − φ)/4 = φ/4  →  25 = 4φ  →  φ = 6,25 V.
  // I_R1 = 1,875 A (A1→N) ; I_R2 = 0,3125 A (N→A2) ; I_R3 = 1,5625 A.
  // V2 wird GELADEN : 0,3125 A in den Pluspol → +1,5625 W aufgenommen.
  const r = solve({
    elemente: [
      { typ: "V", name: "V1", a: "A1", b: "0", wert: 10 },
      { typ: "V", name: "V2", a: "A2", b: "0", wert: 5 },
      { typ: "R", name: "R1", a: "A1", b: "N", wert: 2 },
      { typ: "R", name: "R2", a: "N", b: "A2", wert: 4 },
      { typ: "R", name: "R3", a: "N", b: "0", wert: 4 },
    ],
  });
  test("Knotenpotential und Zweigströme", () => {
    close(node(r, "N").re, 6.25);
    close(el(r, "R1").strom.re, 1.875);
    close(el(r, "R2").strom.re, 0.3125);
    close(el(r, "R3").strom.re, 1.5625);
  });
  test("Quelle V2 nimmt Leistung auf, V1 gibt ab", () => {
    close(el(r, "V2").wirkleistung, 1.5625);
    close(el(r, "V1").wirkleistung, -18.75);
    expect(r.kontrolle.knotenregelMaxFehler).toBeLessThan(1e-12);
  });
});

describe("C3 — Stromteiler mit Stromquelle", () => {
  // I0 = 6 mA in N ; R1 = 1 kΩ ∥ R2 = 2 kΩ = 666,67 Ω → φN = 4 V ;
  // I_R1 = 4 mA, I_R2 = 2 mA (der kleinere Widerstand führt den größeren Strom).
  const r = solve({
    elemente: [
      { typ: "I", name: "I0", a: "N", b: "0", wert: "6m" },
      { typ: "R", name: "R1", a: "N", b: "0", wert: "1k" },
      { typ: "R", name: "R2", a: "N", b: "0", wert: "2k" },
    ],
  });
  test("Teilströme", () => {
    close(node(r, "N").re, 4);
    close(el(r, "R1").strom.re, 0.004);
    close(el(r, "R2").strom.re, 0.002);
    close(el(r, "I0").wirkleistung, -0.024);
  });
});

describe("C4 — RC-Tiefpass bei der Grenzfrequenz (AC)", () => {
  // R = 1 kΩ, C = 100 nF → f_g = 1/(2π·R·C) = 1591,55 Hz.
  // Bei f_g : U_C/U_e = 1/(1 + j) = 0,7071 ∠ −45° ; I = 0,7071 mA ∠ +45°.
  const fg = 1 / (2 * Math.PI * 1e3 * 100e-9);
  const r = solve({
    frequenz: fg,
    elemente: [
      { typ: "V", name: "Ue", a: "in", b: "0", wert: 1 },
      { typ: "R", name: "R", a: "in", b: "out", wert: "1k" },
      { typ: "C", name: "C", a: "out", b: "0", wert: "100n" },
    ],
  });
  test("Betrag und Phase der Ausgangsspannung", () => {
    close(node(r, "out").betrag, Math.SQRT1_2);
    close(node(r, "out").phaseGrad, -45);
    expect(r.modus).toBe("AC");
  });
  test("Strom eilt vor, Kondensator hat |Z| = R", () => {
    close(el(r, "R").strom.betrag, Math.SQRT1_2 * 1e-3);
    close(el(r, "R").strom.phaseGrad, 45);
    close(el(r, "C").impedanz!.betrag, 1000);
    close(el(r, "C").impedanz!.phaseGrad, -90);
  });
  test("Blindleistung nur im Kondensator (kapazitiv, < 0)", () => {
    close(el(r, "R").wirkleistung, 0.5e-3);
    close(el(r, "C").blindleistung, -0.5e-3);
    expect(r.kontrolle.bestanden).toBe(true);
  });
});

describe("C5 — Ersatzspannungsquelle (Thevenin/Norton)", () => {
  // U = 24 V, R1 = 4 Ω (Quelle → A), R2 = 12 Ω (A → 0), R3 = 3 Ω (A → B).
  // U_0 = 24 · 12/16 = 18 V ; R_i = 3 + 4∥12 = 6 Ω ; I_k = 3 A ;
  // Anpassung R_L = 6 Ω, P_max = 18² / (4·6) = 13,5 W.
  const r = solve({
    elemente: [
      { typ: "V", name: "U", a: "Q", b: "0", wert: 24 },
      { typ: "R", name: "R1", a: "Q", b: "A", wert: 4 },
      { typ: "R", name: "R2", a: "A", b: "0", wert: 12 },
      { typ: "R", name: "R3", a: "A", b: "B", wert: 3 },
    ],
    thevenin: { a: "B", b: "0" },
  });
  test("U0, Ri, Ik, Pmax", () => {
    const t = r.thevenin!;
    close(t.leerlaufspannung.re, 18);
    close(t.innenimpedanz!.re, 6);
    close(t.kurzschlussstrom!.re, 3);
    close(t.anpassung!.lastimpedanz.re, 6);
    close(t.anpassung!.maxLeistung, 13.5);
  });
});

describe("Zusatz — idealer OPV und Reihenschwingkreis", () => {
  test("Invertierender Verstärker : U_a = −R2/R1 · U_e = −4,7 V", () => {
    const r = solve({
      elemente: [
        { typ: "V", name: "Ue", a: "IN", b: "0", wert: 1 },
        { typ: "R", name: "R1", a: "IN", b: "M", wert: "10k" },
        { typ: "R", name: "R2", a: "M", b: "OUT", wert: "47k" },
        { typ: "OPV", name: "OP1", plus: "0", minus: "M", aus: "OUT" },
      ],
    });
    close(node(r, "OUT").re, -4.7);
    close(node(r, "M").re, 0);
    expect(r.warnungen).toHaveLength(0);
  });

  test("OPV übersteuert : Warnung statt stiller Fehlwert", () => {
    const r = solve({
      elemente: [
        { typ: "V", name: "Ue", a: "IN", b: "0", wert: 1 },
        { typ: "R", name: "R1", a: "IN", b: "M", wert: "1k" },
        { typ: "R", name: "R2", a: "M", b: "OUT", wert: "100k" },
        { typ: "OPV", name: "OP1", plus: "0", minus: "M", aus: "OUT", ub: 15 },
      ],
    });
    expect(r.warnungen[0]).toContain("übersteuert");
  });

  test("RLC-Reihe in Resonanz : I = U/R, |U_L| = √(L/C)·I", () => {
    // R = 10 Ω, L = 10 mH, C = 10 µF : f0 = 1/(2π√(LC)) = 503,29 Hz ;
    // I = 1 A ; |U_L| = |U_C| = √(L/C) = 31,62 V (Spannungsüberhöhung).
    const f0 = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 10e-6));
    const r = solve({
      frequenz: f0,
      elemente: [
        { typ: "V", name: "U", a: "1", b: "0", wert: 10 },
        { typ: "R", name: "R", a: "1", b: "2", wert: 10 },
        { typ: "L", name: "L", a: "2", b: "3", wert: "10mH" },
        { typ: "C", name: "C", a: "3", b: "0", wert: "10u" },
      ],
    });
    close(el(r, "R").strom.betrag, 1);
    close(el(r, "R").strom.phaseGrad, 0);
    close(el(r, "L").spannung.betrag, Math.sqrt(1000));
    close(el(r, "L").spannung.phaseGrad, 90);
  });
});

describe("Ehrliche Fehler statt falscher Zahlen", () => {
  test("Knoten ohne Verbindung zur Masse", () => {
    const r = solveCircuit({
      elemente: [
        { typ: "V", name: "U", a: "1", b: "0", wert: 5 },
        { typ: "R", name: "R1", a: "1", b: "0", wert: 100 },
        { typ: "R", name: "R2", a: "X", b: "Y", wert: 100 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler).toContain('"X"');
  });

  test("Masche aus idealen Spannungsquellen", () => {
    const r = solveCircuit({
      elemente: [
        { typ: "V", name: "U1", a: "1", b: "0", wert: 5 },
        { typ: "V", name: "U2", a: "1", b: "0", wert: 6 },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler).toContain("Masche");
  });

  test("Kondensator bei Gleichstrom = Leerlauf", () => {
    const r = solve({
      elemente: [
        { typ: "V", name: "U", a: "1", b: "0", wert: 10 },
        { typ: "R", name: "R", a: "1", b: "2", wert: 1000 },
        { typ: "C", name: "C", a: "2", b: "0", wert: "1u" },
      ],
    });
    // Stationär : kein Strom, volle Spannung am Kondensator.
    close(node(r, "2").re, 10);
    expect(el(r, "R").strom.re).toBe(0);
  });

  test("Negativer Widerstand wird abgelehnt", () => {
    const r = solveCircuit({
      elemente: [
        { typ: "V", name: "U", a: "1", b: "0", wert: 10 },
        { typ: "R", name: "R", a: "1", b: "0", wert: -5 },
      ],
    });
    expect(r.ok).toBe(false);
  });
});
