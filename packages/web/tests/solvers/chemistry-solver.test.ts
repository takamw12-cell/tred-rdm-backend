import { describe, expect, test } from "bun:test";
import {
  molarMass,
  parseEquation,
  parseFormula,
  solveBuffer,
  solveChemistry,
  solveIdealGasChem,
  solveMolarity,
  solvePH,
  solvePOH,
  solveStoichiometry,
  solveStrongAcid,
  solveStrongBase,
  solveWeakAcid,
  solveWeakBase,
} from "../../src/api/lib/solvers/chemistry-solver";

/** Fiabilité : au moins trois cas de référence (manuel) par fonction. */
const near = (a: number, b: number, rel = 1e-4) => expect(Math.abs(a - b)).toBeLessThanOrEqual(rel * Math.max(Math.abs(b), 1e-12));

describe("Summenformel und molare Masse", () => {
  test.each([
    ["H2O", 18.015],
    ["NaCl", 58.44],
    ["H2SO4", 98.072],
    ["Ca(OH)2", 74.092],
    ["CuSO4·5H2O", 249.677],
    ["C6H12O6", 180.156],
    ["Fe2(SO4)3", 399.858],
    ["CH3COOH", 60.052],
  ])("M(%s) = %p g/mol", (f, M) => {
    near(molarMass(f).M, M, 1e-6);
  });

  test("Zusammensetzung, Ionen, Phasen, Fehler", () => {
    const r = molarMass("H2O");
    expect(r.zusammensetzung.find((z) => z.element === "O")?.anteil_prozent).toBeCloseTo(88.81, 2);
    expect(parseFormula("SO4^2-")).toMatchObject({ atome: { S: 1, O: 4 }, ladung: -2 });
    expect(parseFormula("NH4+")).toMatchObject({ atome: { N: 1, H: 4 }, ladung: 1 });
    expect(parseFormula("NaCl(aq)").atome).toEqual({ Na: 1, Cl: 1 });
    expect(() => parseFormula("Xy2")).toThrow("Unbekanntes Element");
    expect(() => parseFormula("Ca(OH2")).toThrow("Klammer");
  });
});

describe("Reaktionsgleichungen", () => {
  test("ausgeglichen : Verbrennung, Hochofen, Ionen, Elektronen", () => {
    expect(parseEquation("CH4 + 2 O2 -> CO2 + 2 H2O").ausgeglichen).toBe(true);
    expect(parseEquation("Fe2O3 + 3 CO → 2 Fe + 3 CO2").ausgeglichen).toBe(true);
    expect(parseEquation("Fe^3+ + 3 OH- -> Fe(OH)3").ausgeglichen).toBe(true);
    expect(parseEquation("Cu^2+ + 2 e- -> Cu").ausgeglichen).toBe(true);
    expect(parseEquation("H2 + 1/2 O2 -> H2O").ausgeglichen).toBe(true);
  });
  test("nicht ausgeglichen : Atome und Ladung werden benannt", () => {
    expect(parseEquation("H2 + O2 -> H2O").fehler).toEqual(["O: links 2, rechts 1"]);
    expect(parseEquation("Fe^3+ + e- -> Fe").fehler).toEqual(["Ladung: links 2, rechts 0"]);
  });
});

describe("solveMolarity", () => {
  test("0,5 mol in 250 mL → 2 mol/L", () => {
    near(solveMolarity({ n: 0.5, V: 0.25 }).c, 2, 1e-12);
  });
  test("5,844 g NaCl in 1 L → 0,1 mol/L", () => {
    near(solveMolarity({ m: 5.844, M: 58.44, V: 1 }).c, 0.1, 1e-12);
  });
  test("0,1 mol/L, 500 mL → 0,05 mol = 2,922 g NaCl (Werkzeug)", () => {
    expect(solveChemistry({ aufgabe: "konzentration", c: "0,1 mol/L", V: "500 mL", formel: "NaCl" })).toMatchObject({
      ok: true,
      n_mol: 0.05,
      m_g: 2.922,
    });
  });
  test("V gesucht : 0,2 mol bei 0,5 mol/L → 0,4 L ; unvollständig → Fehler", () => {
    near(solveMolarity({ n: 0.2, c: 0.5 }).V, 0.4, 1e-12);
    expect(() => solveMolarity({ n: 0.2 })).toThrow("Genau ZWEI");
  });
});

describe("solveStoichiometry", () => {
  test("CH4 + 2 O2 → CO2 + 2 H2O : 16,043 g Methan → 44,009 g CO2", () => {
    const r = solveStoichiometry({ gleichung: "CH4 + 2 O2 -> CO2 + 2 H2O", gegeben: "CH4", gesucht: "CO2", m_gegeben: 16.043 });
    near(r.gesucht.n, 1, 1e-9);
    near(r.gesucht.m!, 44.009, 1e-6);
  });
  test("2 H2 + O2 → 2 H2O : 4 g H2 → 35,74 g Wasser", () => {
    const r = solveStoichiometry({ gleichung: "2 H2 + O2 -> 2 H2O", gegeben: "H2", gesucht: "H2O", m_gegeben: 4 });
    near(r.gesucht.m!, 35.744, 1e-4);
  });
  test("Hochofen : 1 kg Fe2O3 → 699,4 g Fe", () => {
    const r = solveStoichiometry({ gleichung: "Fe2O3 + 3 CO -> 2 Fe + 3 CO2", gegeben: "Fe2O3", gesucht: "Fe", m_gegeben: 1000 });
    near(r.gesucht.m!, 699.43, 1e-4);
  });
  test("nicht ausgeglichene Gleichung → KEINE Rechnung", () => {
    expect(() => solveStoichiometry({ gleichung: "H2 + O2 -> H2O", gegeben: "H2", gesucht: "H2O", n_gegeben: 1 })).toThrow("nicht ausgeglichen");
    const r = solveChemistry({ aufgabe: "stoechiometrie", gleichung: "N2 + H2 -> NH3", gegeben: "N2", gesucht: "NH3", n: "1 mol" });
    expect(r.ok).toBe(false);
  });
  test("ohne Gleichung : Verhältnis 1 : 3", () => {
    near(solveStoichiometry({ koeff_gegeben: 1, koeff_gesucht: 3, n_gegeben: 0.2 }).gesucht.n, 0.6, 1e-12);
  });
});

describe("pH", () => {
  test("c(H₃O⁺) = 0,01 mol/L → pH 2 ; pH 3 → 10⁻³ mol/L", () => {
    expect(solvePH(0.01).pH).toBeCloseTo(2, 12);
    expect(solveChemistry({ aufgabe: "ph", modell: "aus_ph", pH: 3 })).toMatchObject({ ok: true, c_H3O_mol_L: 0.001, pOH: 11 });
  });
  test("c(OH⁻) = 10⁻³ → pOH 3, pH 11 ; NaOH 0,001 mol/L ebenso ; Ba(OH)₂ 0,005 mol/L → pH 12", () => {
    expect(solvePOH(1e-3)).toMatchObject({ pOH: expect.closeTo(3, 12), pH: expect.closeTo(11, 12) });
    near(solveStrongBase(1e-3).pH, 11, 1e-6);
    near(solveStrongBase(0.005, 2).pH, 12, 1e-6);
  });
  test("starke Säure : HCl 0,1 → pH 1 ; 10⁻⁸ mol/L → 6,98 (nicht 8 : Eigenprotolyse)", () => {
    near(solveStrongAcid(0.1).pH, 1, 1e-9);
    near(solveStrongAcid(1e-8).pH, 6.9783, 1e-4);
  });
  test("Essigsäure 0,1 mol/L, pK_s = 4,76 → pH 2,88 ; Protolysegrad 1,3 %", () => {
    const r = solveWeakAcid(0.1, 10 ** -4.76);
    near(r.pH, 2.8827, 1e-4);
    near(r.protolysegrad!, 0.0131, 1e-2);
    expect(r.naeherung).toContain("2.88");
  });
  test("Ammoniak 0,1 mol/L, pK_b = 4,75 → pH 11,12", () => {
    near(solveWeakBase(0.1, 10 ** -4.75).pH, 11.122, 1e-4);
  });
  test("Puffer (Henderson-Hasselbalch) : 1:1 → pH = pK_s ; 10:1 → pK_s + 1", () => {
    near(solveBuffer(4.76, 0.1, 0.1).pH, 4.76, 1e-9);
    near(solveBuffer(4.76, 0.01, 0.1).pH, 5.76, 1e-9);
    expect(solveBuffer(4.76, 0.001, 0.1).hinweis).toContain("außerhalb");
  });
});

describe("Ideales Gas (Chemie)", () => {
  test("1 mol bei 0 °C und 1 atm → 22,41 L (molares Normvolumen)", () => {
    near(solveIdealGasChem({ n: 1, T: 273.15, p: 101325 }).V_L, 22.414, 1e-4);
  });
  test("2 mol, 25 °C, 100 kPa → 49,58 L", () => {
    near(solveIdealGasChem({ n: 2, T: 298.15, p: 1e5 }).V_L, 49.579, 1e-4);
  });
  test("0,5 mol in 10 L bei 300 K → 124,7 kPa", () => {
    near(solveIdealGasChem({ n: 0.5, V: 0.01, T: 300 }).p_kPa, 124.72, 1e-4);
  });
  test("Werkzeug : °C, atm, L ; Masse und Formel → n", () => {
    const r = solveChemistry({ aufgabe: "ideales_gas", n: "1 mol", T: "0 °C", p: "1 atm" });
    expect(r).toMatchObject({ ok: true, gesucht: "V" });
    near((r as { V_L: number }).V_L, 22.414, 1e-4);
    const co2 = solveChemistry({ aufgabe: "ideales_gas", m: "44,009 g", formel: "CO2", T: "0 °C", p: "1 atm" });
    near((co2 as { V_L: number }).V_L, 22.414, 1e-4);
  });
});
