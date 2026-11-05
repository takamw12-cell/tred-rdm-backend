import { describe, expect, test } from "bun:test";

import { parseQty, solveThermo, type ThermoInput } from "../src/api/lib/solvers/solveThermo";

/**
 * solveThermo — chaque valeur attendue est calculée à la main dans le
 * commentaire (air : R = 287 J/(kg·K), κ = 1,4 → c_v = 717,5, c_p = 1004,5).
 */

type Any = any;
const ok = (input: ThermoInput): Any => {
  const r = solveThermo(input);
  if (!r.ok) throw new Error(`Solveur en erreur : ${(r as Any).fehler}`);
  return r;
};
const close = (actual: number, expected: number, rel = 1e-6) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel + 1e-9);

describe("Einheiten", () => {
  test("bar, °C, Liter, kJ", () => {
    expect(parseQty("1 bar", "p")).toBe(1e5);
    expect(parseQty("20 °C", "T")).toBeCloseTo(293.15, 10);
    expect(parseQty("2 L", "V")).toBeCloseTo(0.002, 12);
    expect(parseQty("1,5 kJ", "E")).toBe(1500);
    expect(() => parseQty("3 bar", "T")).toThrow();
  });
});

describe("T1 — isochore Erwärmung", () => {
  // m = 1 kg Luft, 300 K → 600 K bei V = konst., p1 = 1 bar.
  // V = m·R·T/p = 287·300/1e5 = 0,861 m³ ; p2 = 2 bar ;
  // Q = m·c_v·ΔT = 717,5·300 = 215 250 J ; W_V = 0 ; ΔS = c_v·ln 2 = 497,333 J/K.
  const r = ok({
    modus: "zustandsaenderung",
    masse: 1,
    start: { p: "1 bar", T: 300 },
    schritte: [{ prozess: "isochor", ziel: { T: 600 } }],
  });
  test("Zustand 2 und Energien", () => {
    close(r.zustaende[0].V, 0.861);
    close(r.zustaende[1].p_bar, 2);
    close(r.schritte[0].Q, 215250);
    expect(r.schritte[0].W_V).toBe(0);
    close(r.schritte[0].dS, 497.3331020517608);
  });
});

describe("T2 — isotherme Verdichtung", () => {
  // 1 kg Luft, 300 K, 1 → 5 bar.
  // W_V = m·R·T·ln(p2/p1) = 86 100·ln 5 = 138 572,6 J (zugeführt) ; Q = −138 572,6 J.
  const r = ok({
    modus: "zustandsaenderung",
    masse: "1 kg",
    start: { p: "1 bar", T: 300 },
    schritte: [{ prozess: "isotherm", ziel: { p: "5 bar" } }],
  });
  test("Arbeit zugeführt, Wärme abgeführt, ΔU = 0", () => {
    close(r.schritte[0].W_V, 138572.60426057604);
    close(r.schritte[0].Q, -138572.60426057604);
    expect(Math.abs(r.schritte[0].dU)).toBeLessThan(1e-9);
  });
});

describe("T3 — isentrope Verdichtung, ε = 10", () => {
  // T2 = T1·ε^(κ−1) = 300·10^0,4 = 753,566 K ; p2 = p1·ε^κ = 25,1189 bar ;
  // W_V = m·c_v·(T2 − T1) = 325 433,6 J ; Q = 0.
  const r = ok({
    modus: "zustandsaenderung",
    masse: 1,
    start: { p: "1 bar", T: 300 },
    schritte: [{ prozess: "isentrop", ziel: { V_verhaeltnis: 0.1 } }],
  });
  test("Endzustand und Arbeit", () => {
    close(r.zustaende[1].T, 753.565929452874);
    close(r.zustaende[1].p_bar, 25.118864315095795);
    close(r.schritte[0].W_V, 325433.55438243714);
    expect(Math.abs(r.schritte[0].Q)).toBeLessThan(1e-6);
  });
  test("polytrop mit n = κ ist dasselbe", () => {
    const p = ok({
      modus: "zustandsaenderung",
      masse: 1,
      start: { p: "1 bar", T: 300 },
      schritte: [{ prozess: "polytrop", n: 1.4, ziel: { V_verhaeltnis: 0.1 } }],
    });
    close(p.zustaende[1].T, 753.565929452874);
  });
});

describe("T4 — Carnot zwischen 800 K und 300 K", () => {
  // η_C = 1 − 300/800 = 0,625 ; ε_K = 300/500 = 0,6 ; ε_WP = 800/500 = 1,6.
  // Mit |Q_warm| = 1000 J (reversibel) : W = 625 J, |Q_kalt| = 375 J, S_erz = 0.
  const r = ok({
    modus: "carnot",
    T_warm: 800,
    T_kalt: 300,
    maschine: { art: "kraft", Q_warm: 1000, W: 625 },
  });
  test("Kennzahlen", () => {
    close(r.eta_carnot, 0.625);
    close(r.epsilon_kaelte_carnot, 0.6);
    close(r.epsilon_waermepumpe_carnot, 1.6);
    close(r.maschine.Q_kalt, 375);
    expect(r.maschine.urteil).toContain("reversibel");
  });
});

describe("T5 — Otto-Kreisprozess, ε = 8", () => {
  // η_th = 1 − 1/ε^(κ−1) = 1 − 8^−0,4 = 0,564725 — unabhängig von T3.
  const r = ok({
    modus: "kreisprozess",
    masse: 1,
    start: { p: "1 bar", T: 300 },
    schritte: [
      { prozess: "isentrop", ziel: { V_verhaeltnis: 1 / 8 } },
      { prozess: "isochor", ziel: { T: 1800 } },
      { prozess: "isentrop", ziel: { V_verhaeltnis: 8 } },
      { prozess: "isochor", ziel: { zurueck_zum_start: true } },
    ],
  });
  test("Wirkungsgrad und Energiebilanz", () => {
    close(r.kreisprozess.eta_th, 0.5647247183519379);
    close(r.kreisprozess.Q_zu - r.kreisprozess.Q_ab_betrag, r.kreisprozess.W_netto_abgegeben);
    expect(r.kreisprozess.eta_th).toBeLessThan(r.kreisprozess.carnot_vergleich.eta_carnot);
    expect(r.zustaende).toHaveLength(4);
  });
});

describe("Zusatz — 2. Hauptsatz und Strömungsmaschine", () => {
  test("Behauptete Maschine mit η = 0,7 > η_C : unmöglich", () => {
    // S_erz = |Q_kalt|/T_kalt − |Q_warm|/T_warm = 300/300 − 1000/800 = −0,25 J/K.
    const r = ok({ modus: "carnot", T_warm: 800, T_kalt: 300, maschine: { art: "kraft", Q_warm: 1000, W: 700 } });
    close(r.maschine.entropieerzeugung, -0.25);
    expect(r.maschine.urteil).toContain("UNMÖGLICH");
  });

  test("Verdichter 1 → 6 bar, η_s = 0,8, T1 = 20 °C", () => {
    // T2s = T1·6^(0,4/1,4) = 489,124 K ; T2 = T1 + (T2s − T1)/0,8 = 538,117 K ;
    // w_t = c_p·(T2 − T1) = 246 069,6 J/kg ; Δs = 95,89 J/(kg·K) > 0.
    const r = ok({ modus: "stroemungsmaschine", typ: "verdichter", p1: "1 bar", T1: "20 °C", p2: "6 bar", eta_s: 0.8 });
    close(r.T2s, 489.1238357870137);
    close(r.T2, 538.1172947337672);
    close(r.w_t, 246069.64756006916);
    close(r.entropie.delta_s, 95.89042986968252, 1e-5);
  });

  test("Kreisprozess, der nicht schließt, wird abgelehnt", () => {
    const r = solveThermo({
      modus: "kreisprozess",
      masse: 1,
      start: { p: "1 bar", T: 300 },
      schritte: [
        { prozess: "isobar", ziel: { T: 600 } },
        // isochor zurück auf 300 K : V bleibt doppelt so groß → schließt nicht.
        { prozess: "isochor", ziel: { zurueck_zum_start: true } },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fehler).toContain("schließt");
  });

  test("Wasserdampf wird nicht geraten", () => {
    const r = solveThermo({ modus: "zustandsaenderung", gas: "wasserdampf" as never, start: { p: 1e5, T: 400 } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.hinweis).toContain("Dampftafel");
  });
});
