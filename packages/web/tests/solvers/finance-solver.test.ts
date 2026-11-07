import { describe, expect, test } from "bun:test";
import { npvAt, solveAnnuity, solveCompoundInterest, solveFinance, solveIRR, solveNPV } from "../../src/api/lib/solvers/finance-solver";

/** Fiabilité : au moins trois cas de référence (manuel) par fonction. */
const near = (a: number, b: number, abs = 0.005) => expect(Math.abs(a - b)).toBeLessThanOrEqual(abs);

describe("solveCompoundInterest", () => {
  test("1000 € zu 5 % über 10 Jahre → 1628,89 € ; monatlich 1647,01 € ; stetig 1648,72 €", () => {
    near(solveCompoundInterest({ K0: 1000, i: 0.05, n: 10 }).Kn, 1628.89);
    const monthly = solveCompoundInterest({ K0: 1000, i: 0.05, n: 10, m: 12 });
    near(monthly.Kn, 1647.01);
    near(monthly.effektivzins, 0.051162, 1e-6);
    near(solveCompoundInterest({ K0: 1000, i: 0.05, n: 10, m: null }).Kn, 1648.72);
  });
  test("Barwert : 10 000 € in 5 Jahren bei 4 % → 8219,27 €", () => {
    near(solveCompoundInterest({ Kn: 10000, i: 0.04, n: 5 }).K0, 8219.27);
  });
  test("Zins für Verdopplung in 10 Jahren → 7,177 % ; Laufzeit bei 7,2 % → 9,97 Jahre", () => {
    near(solveCompoundInterest({ K0: 1000, Kn: 2000, n: 10 }).i, 0.0717735, 1e-7);
    near(solveCompoundInterest({ K0: 1000, Kn: 2000, i: 0.072 }).n, 9.9696, 1e-4);
  });
  test("genau eine Größe gesucht ; 0 % → Laufzeit unbestimmt", () => {
    expect(() => solveCompoundInterest({ K0: 1000, i: 0.05 })).toThrow("Genau DREI");
    expect(() => solveCompoundInterest({ K0: 1000, Kn: 2000, i: 0 })).toThrow("0 % Zins");
  });
});

describe("solveNPV", () => {
  test("[−1000, 500, 400, 300] bei 10 % → C₀ = 10,52 > 0", () => {
    const r = solveNPV([-1000, 500, 400, 300], 0.1);
    near(r.kapitalwert, 10.518);
    expect(r.tabelle[1].barwert).toBeCloseTo(454.545, 3);
    expect(r.entscheidung).toContain("C₀ > 0");
  });
  test("[−100, 110] bei 10 % → C₀ = 0", () => {
    near(solveNPV([-100, 110], 0.1).kapitalwert, 0, 1e-9);
  });
  test("[−100, 60, 60] bei 15 % → C₀ = −2,46 < 0", () => {
    const r = solveNPV([-100, 60, 60], 0.15);
    near(r.kapitalwert, -2.457, 1e-3);
    expect(r.entscheidung).toContain("C₀ < 0");
  });
});

describe("solveIRR", () => {
  test("[−100, 110] → 10 %", () => {
    near(solveIRR([-100, 110]).irr[0], 0.1, 1e-12);
  });
  test("[−100, 60, 60] → 13,066 % (quadratisch nachgerechnet)", () => {
    const x = (-1 + Math.sqrt(1 + 20 / 3)) / 2;
    near(solveIRR([-100, 60, 60]).irr[0], 1 / x - 1, 1e-12);
  });
  test("[−1000, 500, 400, 300] → 10,65 % ; Probe C₀(IRR) = 0", () => {
    const r = solveIRR([-1000, 500, 400, 300]);
    near(r.irr[0], 0.10652, 1e-5);
    near(npvAt([-1000, 500, 400, 300], r.irr[0]), 0, 1e-8);
  });
  test("nicht-konventionell [−100, 230, −132] → ZWEI IRR (10 % und 20 %), mit Warnung", () => {
    const r = solveIRR([-100, 230, -132]);
    expect(r.irr).toHaveLength(2);
    near(r.irr[0], 0.1, 1e-12);
    near(r.irr[1], 0.2, 1e-12);
    expect(r.hinweis).toContain("NICHT eindeutig");
  });
  test("kein Vorzeichenwechsel → kein IRR", () => {
    expect(() => solveIRR([100, 50])).toThrow("keinen Vorzeichenwechsel");
  });
});

describe("solveAnnuity", () => {
  test("100 000 € zu 5 % über 10 Jahre → A = 12 950,46 € ; Zinsen gesamt 29 504,57 €", () => {
    const r = solveAnnuity(100000, 0.05, 10);
    near(r.annuitaet, 12950.46);
    near(r.zinsen_gesamt, 29504.57);
    near(r.tilgungsplan[0].zinsen, 5000);
    near(r.tilgungsplan[0].tilgung, 7950.46);
    expect(r.tilgungsplan.at(-1)!.restschuld_ende).toBe(0);
  });
  test("200 000 € zu 3 % über 20 Jahre → 13 443,14 €", () => {
    near(solveAnnuity(200000, 0.03, 20).annuitaet, 13443.14);
  });
  test("0 % → reine Tilgung K₀/n", () => {
    expect(solveAnnuity(10000, 0, 4).annuitaet).toBe(2500);
  });
});

describe("Werkzeug wirtschaft_berechnen", () => {
  test("Zinsangaben : \"5 %\", 5 und 0,05 sind dasselbe ; Monate", () => {
    for (const zins of ["5 %", 5, 0.05]) {
      expect(solveFinance({ aufgabe: "zinseszins", K0: 1000, zins, laufzeit: 10 })).toMatchObject({ ok: true, Kn: 1628.89 });
    }
    expect(solveFinance({ aufgabe: "zinseszins", K0: 1000, zins: "5 %", laufzeit: "120 Monate", perioden_pro_jahr: 12 })).toMatchObject({ Kn: 1647.01 });
  });
  test("Kapitalwert mit Kurve und IRR ; kein Anlagerat", () => {
    const r = solveFinance({ aufgabe: "kapitalwert", zahlungen: [-1000, 500, 400, 300], zins: "10 %" }) as Record<string, unknown>;
    expect(r).toMatchObject({ ok: true, kapitalwert: 10.52, interner_zinsfuss_prozent: [10.6517] });
    expect((r.diagramme as unknown[]).length).toBe(1);
    expect(r.hinweis).toContain("keine Anlage");
  });
  test("Fehler werden erklärt", () => {
    expect(solveFinance({ aufgabe: "irr", zahlungen: [100, 50] })).toMatchObject({ ok: false });
    expect(solveFinance({ aufgabe: "annuitaet", K0: 1000 })).toMatchObject({ ok: false });
  });
});
