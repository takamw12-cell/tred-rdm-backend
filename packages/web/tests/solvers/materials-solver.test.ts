import { describe, expect, test } from "bun:test";
import {
  solveBeamBendingStress,
  solveHookesLaw,
  solveMaterials,
  solvePoissonRatio,
  solveStress,
  solveThermalExpansion,
} from "../../src/api/lib/solvers/materials-solver";

/** Fiabilité : au moins trois cas de référence (manuel) par fonction. */
const near = (a: number, b: number, rel = 1e-4) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(Math.abs(b), 1e-12));

describe("solveHookesLaw", () => {
  test("Stahl E = 210 GPa, ε = 0,1 % → σ = 210 MPa", () => {
    near(solveHookesLaw({ E: 210e9, epsilon: 0.001 }).sigma, 210e6, 1e-12);
  });
  test("Aluminium E = 70 GPa, σ = 100 MPa → ε = 1,4286 ‰", () => {
    near(solveHookesLaw({ E: 70e9, sigma: 100e6 }).epsilon, 1.428571e-3, 1e-6);
  });
  test("σ = 200 MPa bei ε = 0,1 % → E = 200 GPa ; Druck ebenso", () => {
    near(solveHookesLaw({ sigma: 200e6, epsilon: 0.001 }).E, 200e9, 1e-12);
    near(solveHookesLaw({ sigma: -200e6, epsilon: -0.001 }).E, 200e9, 1e-12);
  });
  test("Vorzeichen und Vollständigkeit", () => {
    expect(() => solveHookesLaw({ sigma: 200e6, epsilon: -0.001 })).toThrow("Vorzeichen");
    expect(() => solveHookesLaw({ E: 210e9 })).toThrow("Genau ZWEI");
  });
});

describe("solveStress", () => {
  test("F = 10 kN auf A = 100 mm² → 100 MPa", () => {
    near(solveStress({ F: 10e3, A: 100e-6 }).sigma, 100e6, 1e-12);
  });
  test("S235 : σ = 235 MPa, A = 50 mm² → F = 11,75 kN", () => {
    near(solveStress({ sigma: 235e6, A: 50e-6 }).F, 11750, 1e-12);
  });
  test("A_erf = F/σ_zul : 50 kN bei 160 MPa → 312,5 mm²", () => {
    near(solveStress({ F: 50e3, sigma: 160e6 }).A, 312.5e-6, 1e-12);
  });
  test("Rundstab d = 10 mm, F = 7,854 kN → 100 MPa (Werkzeug)", () => {
    const r = solveMaterials({ aufgabe: "spannung", F: "7,854 kN", d: "10 mm" });
    expect(r).toMatchObject({ ok: true, A_mm2: 78.53981634, A_aus_d: "A = π·d²/4" });
    near((r as { sigma_MPa: number }).sigma_MPa, 100, 1e-4);
  });
});

describe("solveThermalExpansion", () => {
  test("Stahl α = 12·10⁻⁶ /K, 1 m, ΔT = 100 K → ΔL = 1,2 mm", () => {
    near(solveThermalExpansion({ alpha: 12e-6, L0: 1, dT: 100 }).dL, 1.2e-3, 1e-12);
  });
  test("Aluminium α = 23·10⁻⁶ /K, 2 m, ΔT = 50 K → 2,3 mm", () => {
    near(solveThermalExpansion({ alpha: 23e-6, L0: 2, dT: 50 }).dL, 2.3e-3, 1e-12);
  });
  test("Abkühlung : ΔT = −40 K → Verkürzung", () => {
    expect(solveThermalExpansion({ alpha: 12e-6, L0: 5, dT: -40 }).dL).toBeCloseTo(-2.4e-3, 12);
  });
  test("eingespannt, E = 210 GPa, ΔT = 50 K → σ = −126 MPa (Druck)", () => {
    near(solveThermalExpansion({ alpha: 12e-6, L0: 1, dT: 50, E: 210e9 }).sigma_behindert!, -126e6, 1e-12);
  });
  test("Werkzeug : µm/(m·K), T1/T2 in °C und K gemischt ; α unplausibel → Fehler", () => {
    const r = solveMaterials({ aufgabe: "waermedehnung", alpha: "12 µm/(m·K)", L0: "1000 mm", T1: "293.15 K", T2: "120 °C" });
    expect(r).toMatchObject({ ok: true, delta_L_mm: 1.2 });
    expect(solveMaterials({ aufgabe: "waermedehnung", alpha: 12, L0: "1 m", delta_T: "100 K" })).toMatchObject({ ok: false });
  });
});

describe("solveBeamBendingStress", () => {
  test("Rechteck 20 × 60 mm, M = 1 kNm → I = 360 000 mm⁴, W = 12 000 mm³, σ_b = 83,33 MPa", () => {
    const r = solveBeamBendingStress({ M: 1000, b: 0.02, h: 0.06 });
    near(r.I, 360000e-12, 1e-12);
    near(r.W, 12000e-9, 1e-12);
    near(r.sigma_b, 83.3333e6, 1e-6);
  });
  test("Vollkreis d = 40 mm, M = 500 Nm → W = 6283,2 mm³, σ_b = 79,58 MPa", () => {
    const r = solveBeamBendingStress({ M: 500, d: 0.04 });
    near(r.W, 6283.185e-9, 1e-6);
    near(r.sigma_b, 79.577e6, 1e-4);
  });
  test("IPE 160 (I_y = 869 cm⁴, h = 160 mm), M = 10 kNm → σ_b = 92,06 MPa", () => {
    const r = solveMaterials({ aufgabe: "biegespannung", M: "10 kNm", I: "869 cm⁴", e: "80 mm" });
    near((r as { sigma_b_MPa: number }).sigma_b_MPa, 92.06, 1e-4);
    const w = solveMaterials({ aufgabe: "biegespannung", M: "10 kNm", W: "109 cm³" });
    near((w as { sigma_b_MPa: number }).sigma_b_MPa, 91.74, 1e-3);
  });
  test("ohne Querschnitt → klare Meldung", () => {
    expect(() => solveBeamBendingStress({ M: 100 })).toThrow("Querschnitt fehlt");
  });
});

describe("solvePoissonRatio", () => {
  test("ε_quer = −0,0003, ε_längs = 0,001 → ν = 0,3 ; mit E = 210 GPa → G = 80,77 GPa", () => {
    const r = solvePoissonRatio({ eps_quer: -0.0003, eps_laengs: 0.001, E: 210e9 });
    near(r.nu, 0.3, 1e-12);
    near(r.G!, 80.769e9, 1e-4);
  });
  test("Aluminium : ε_quer = −0,33 ‰ bei 1 ‰ → ν = 0,33", () => {
    const r = solveMaterials({ aufgabe: "querkontraktion", eps_quer: "-0,33 ‰", eps_laengs: "1 ‰" });
    expect(r).toMatchObject({ ok: true, nu: 0.33 });
  });
  test("aus E und G : 210 GPa, 81 GPa → ν = 0,2963", () => {
    near(solvePoissonRatio({ E: 210e9, G: 81e9 }).nu, 0.296296, 1e-5);
  });
  test("Plausibilität : ν = 0,6 oder falsches Vorzeichen → abgelehnt ; 0,5 = inkompressibel", () => {
    expect(() => solvePoissonRatio({ nu: 0.6 })).toThrow("−1 < ν ≤ 0,5");
    expect(() => solvePoissonRatio({ eps_quer: 0.003, eps_laengs: 0.001 })).toThrow("Vorzeichen");
    expect(solvePoissonRatio({ nu: 0.5 }).bemerkung).toContain("inkompressibel");
  });
});

describe("Werkzeug werkstoff_berechnen", () => {
  test("Einheiten N/mm², GPa, % ; Gültigkeitshinweis", () => {
    const r = solveMaterials({ aufgabe: "hooke", E: "210000 N/mm²", epsilon: "0,1 %" });
    expect(r).toMatchObject({ ok: true, sigma_MPa: 210, E_GPa: 210, epsilon_promille: 1 });
    expect((r as { gueltigkeit: string }).gueltigkeit).toContain("linear-elastisch");
  });
});
