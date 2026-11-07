import { describe, expect, test } from "bun:test";
import {
  rcChart,
  resonanceChart,
  solveElectrical,
  solveKirchhoff,
  solveOhmLaw,
  solveRCTransient,
  solveRLC,
  solveVoltageDivider,
} from "../../src/api/lib/solvers/electrical-solver";
import { solveCircuit } from "../../src/api/lib/solvers/solveCircuit";

/** Fiabilité : au moins trois cas de référence (manuel) par fonction. */
const near = (a: number, b: number, rel = 1e-4) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(1, Math.abs(b)));

describe("solveOhmLaw", () => {
  test("U, R → I, P : 12 V an 4 Ω → 3 A, 36 W", () => {
    expect(solveOhmLaw({ U: 12, R: 4 })).toMatchObject({ I: 3, P: 36 });
  });
  test("U, P → I, R : Wasserkocher 230 V, 2300 W → 10 A, 23 Ω", () => {
    const r = solveOhmLaw({ U: 230, P: 2300 });
    near(r.I, 10);
    near(r.R, 23);
  });
  test("I, R → U, P : 20 mA durch 470 Ω → 9,4 V, 0,188 W", () => {
    const r = solveOhmLaw({ I: 0.02, R: 470 });
    near(r.U, 9.4);
    near(r.P, 0.188);
  });
  test("P, R → I, U : 100 W an 25 Ω → 2 A, 50 V", () => {
    const r = solveOhmLaw({ P: 100, R: 25 });
    near(r.I, 2);
    near(r.U, 50);
  });
  test("genau zwei Größen, R > 0", () => {
    expect(() => solveOhmLaw({ U: 12 })).toThrow("Genau ZWEI");
    expect(() => solveOhmLaw({ U: 12, I: 1, R: 12 })).toThrow("Genau ZWEI");
    expect(() => solveOhmLaw({ U: 12, R: 0 })).toThrow("positiv");
  });
});

describe("solveRLC", () => {
  test("Reihenschwingkreis L = 10 mH, C = 1 µF → f₀ = 1591,5 Hz ; R = 10 Ω → Q = 10, B = 159,15 Hz", () => {
    const r = solveRLC({ R: 10, L: 10e-3, C: 1e-6 });
    near(r.f0, 1591.549, 1e-6);
    near(r.Q, 10, 1e-9);
    near(r.bandbreite, 159.1549, 1e-6);
    near(r.Z_resonanz, 10, 1e-9);
  });
  test("bei 1 kHz (unter f₀) : kapazitiv, |Z| = 96,84 Ω, φ = −84,07°", () => {
    const r = solveRLC({ R: 10, L: 10e-3, C: 1e-6, f: 1000, U: 10 });
    near(r.beiF!.XL, 62.832, 1e-4);
    near(r.beiF!.XC, 159.155, 1e-4);
    near(r.beiF!.Z, 96.84, 1e-4);
    near(r.beiF!.phi_grad, -84.07, 1e-4);
    expect(r.beiF!.charakter).toBe("kapazitiv");
    near(r.beiF!.I!, 10 / 96.84, 1e-4);
  });
  test("L = 100 mH, C = 10 µF → f₀ = 159,15 Hz ; über f₀ induktiv", () => {
    const r = solveRLC({ R: 50, L: 0.1, C: 10e-6, f: 500 });
    near(r.f0, 159.1549, 1e-6);
    expect(r.beiF!.charakter).toBe("induktiv");
    expect(r.beiF!.phi_grad).toBeGreaterThan(0);
  });
  test("Parallelschwingkreis R = 1 kΩ : Q = R·√(C/L) = 10, |Z(f₀)| = R (Maximum)", () => {
    const r = solveRLC({ R: 1000, L: 10e-3, C: 1e-6, schaltung: "parallel", f: 1000 });
    near(r.Q, 10, 1e-9);
    near(r.Z_resonanz, 1000, 1e-9);
    expect(r.beiF!.Z).toBeLessThan(1000);
    expect(r.beiF!.charakter).toBe("induktiv"); // unter f₀ überwiegt im Parallelkreis die Spule
  });
  test("Resonanzkurve : Minimum bei f₀ in Reihe", () => {
    const a = { R: 10, L: 10e-3, C: 1e-6 };
    const c = resonanceChart(a, solveRLC(a));
    const ys = c.series[0].data.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(10, 3);
    expect(c.series[0].data[20].x).toBeCloseTo(1592, 0);
  });
});

describe("solveRCTransient", () => {
  test("τ = R·C = 1 ms ; bei t = τ : 63,2 % (laden), 36,8 % (entladen)", () => {
    const l = solveRCTransient({ U0: 10, R: 1000, C: 1e-6, t: 1e-3 });
    near(l.tau, 1e-3, 1e-12);
    near(l.beiT!.prozent, 63.212, 1e-4);
    near(l.beiT!.uC, 6.3212, 1e-4);
    const e = solveRCTransient({ U0: 10, R: 1000, C: 1e-6, t: 1e-3, modus: "entladen" });
    near(e.beiT!.prozent, 36.788, 1e-4);
    expect(e.i0).toBeCloseTo(-0.01, 12);
  });
  test("U₀ = 10 V, t = 2 ms → u_C = 8,647 V ; Anfangsstrom 10 mA", () => {
    const r = solveRCTransient({ U0: 10, R: 1000, C: 1e-6, t: 2e-3 });
    near(r.beiT!.uC, 8.6466, 1e-4);
    near(r.i0, 0.01, 1e-12);
  });
  test("Faustregel : nach 5τ zu 99,3 % geladen", () => {
    const r = solveRCTransient({ U0: 5, R: 10e3, C: 100e-6 });
    expect(r.tabelle.map((x) => x.prozent)).toEqual([63.21, 86.47, 95.02, 98.17, 99.33]);
    const c = rcChart({ U0: 5 }, r);
    expect(c.xLabel).toBe("t in s");
    expect(c.series[0].data.at(-1)!.y).toBeCloseTo(4.966, 3);
  });
});

describe("solveVoltageDivider", () => {
  test("12 V, R₁ = R₂ = 1 kΩ → 6 V", () => {
    expect(solveVoltageDivider({ Uin: 12, R1: 1000, R2: 1000 }).U_aus).toBeCloseTo(6, 12);
  });
  test("10 V, 1 kΩ / 4 kΩ → 8 V ; mit R_L = 4 kΩ → 6,667 V", () => {
    expect(solveVoltageDivider({ Uin: 10, R1: 1000, R2: 4000 }).U_aus).toBeCloseTo(8, 12);
    const b = solveVoltageDivider({ Uin: 10, R1: 1000, R2: 4000, RL: 4000 });
    near(b.U_aus, 20 / 3, 1e-12);
    near(b.R2_wirksam, 2000, 1e-12);
  });
  test("gegen schaltung_berechnen (MNA) : derselbe belastete Teiler", () => {
    const mna = solveCircuit({
      elemente: [
        { typ: "V", name: "U1", a: "ein", b: "0", wert: 10 },
        { typ: "R", name: "R1", a: "ein", b: "aus", wert: 1000 },
        { typ: "R", name: "R2", a: "aus", b: "0", wert: 4000 },
        { typ: "R", name: "RL", a: "aus", b: "0", wert: 4000 },
      ],
    });
    expect(mna.ok).toBe(true);
    const aus = (mna as { knoten: { name: string; potential: { re: number } }[] }).knoten.find((k) => k.name === "aus")!;
    near(aus.potential.re, solveVoltageDivider({ Uin: 10, R1: 1000, R2: 4000, RL: 4000 }).U_aus, 1e-3);
  });
});

describe("solveKirchhoff", () => {
  test("2×2 : 3x − y = 5, −x + 2y = 0 → x = 2, y = 1", () => {
    const r = solveKirchhoff([[3, -1], [-1, 2]], [5, 0]);
    near(r.x[0], 2, 1e-12);
    near(r.x[1], 1, 1e-12);
    near(r.determinante, 5, 1e-12);
  });
  test("Zwei Maschen : 12 V, R₁ = 2 Ω, R₂ = 4 Ω, R₃ = 6 Ω (R₃ gemeinsam) → I₁ = 30/11 A, I₂ = 18/11 A", () => {
    // Masche 1: (R1+R3)·I1 − R3·I2 = 12 ; Masche 2: −R3·I1 + (R2+R3)·I2 = 0
    const r = solveKirchhoff([[8, -6], [-6, 10]], [12, 0], ["I1", "I2"]);
    near(r.x[0], 30 / 11, 1e-12);
    near(r.x[1], 18 / 11, 1e-12);
    expect(r.namen).toEqual(["I1", "I2"]);
  });
  test("3×3 mit Knotenregel I₁ = I₂ + I₃ — gegen schaltung_berechnen", () => {
    // 10 V – R1 = 100 Ω – Knoten k – (R2 = 200 Ω ∥ R3 = 300 Ω) – Masse
    const r = solveKirchhoff(
      [
        [1, -1, -1],
        [100, 200, 0],
        [0, 200, -300],
      ],
      [0, 10, 0],
      ["I1", "I2", "I3"],
    );
    const mna = solveCircuit({
      elemente: [
        { typ: "V", name: "U", a: "q", b: "0", wert: 10 },
        { typ: "R", name: "R1", a: "q", b: "k", wert: 100 },
        { typ: "R", name: "R2", a: "k", b: "0", wert: 200 },
        { typ: "R", name: "R3", a: "k", b: "0", wert: 300 },
      ],
    }) as { elemente: { name: string; strom: { re: number } }[] };
    const I = (n: string) => Math.abs(mna.elemente.find((e) => e.name === n)!.strom.re);
    near(r.x[0], I("R1"), 1e-6);
    near(r.x[1], I("R2"), 1e-6);
    near(r.x[2], I("R3"), 1e-6);
  });
  test("singulär (Gleichung doppelt) → klare Meldung", () => {
    expect(() => solveKirchhoff([[1, 1], [2, 2]], [1, 2])).toThrow("singulär");
    expect(() => solveKirchhoff([[1, 1]], [1])).toThrow("quadratisch");
  });
});

describe("Werkzeug elektro_berechnen", () => {
  test("Einheiten : kΩ, mA, µF, mH, ms — mΩ ≠ MΩ", () => {
    expect(solveElectrical({ aufgabe: "ohm", I: "20 mA", R: "4,7 kΩ" })).toMatchObject({ ok: true, U_V: 94 });
    expect(solveElectrical({ aufgabe: "ohm", U: "1 V", R: "1 MΩ" })).toMatchObject({ ok: true, I_A: 1e-6 });
    expect(solveElectrical({ aufgabe: "ohm", U: "1 V", R: "1 mΩ" })).toMatchObject({ ok: true, I_A: 1000 });
    const rlc = solveElectrical({ aufgabe: "rlc", R: "10 Ω", L: "10 mH", C: "1 µF" });
    expect(rlc).toMatchObject({ ok: true, f0_Hz: 1591.549431 });
    expect((rlc as { diagramme: unknown[] }).diagramme).toHaveLength(1);
    const rc = solveElectrical({ aufgabe: "rc_schaltvorgang", U0: "10 V", R: "1 kΩ", C: "1 µF", t: "1 ms" });
    expect(rc).toMatchObject({ ok: true, tau_s: 0.001, bei_t: { prozent_von_U0: 63.2121 } });
  });
  test("Fehler werden erklärt, nicht geworfen", () => {
    const r = solveElectrical({ aufgabe: "ohm", U: "12 Volt-Ampere", R: 4 });
    expect(r.ok).toBe(false);
    expect((r as { fehler: string }).fehler).toContain("Einheit");
    expect(solveElectrical({ aufgabe: "kirchhoff" })).toMatchObject({ ok: false });
  });
});
