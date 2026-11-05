import { describe, expect, test } from "bun:test";

import { parseExpr, solveMath, type MathInput } from "../src/api/lib/solvers/solveMath";

/** solveMath — valeurs attendues calculées à la main (et vérifiées en Python). */

type Any = any;
const ok = (input: MathInput): Any => {
  const r = solveMath(input);
  if (!r.ok) throw new Error(`Solveur en erreur : ${(r as Any).fehler}`);
  return r;
};
const close = (actual: number, expected: number, rel = 1e-8) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel + 1e-10);

describe("M1 — Ableitung (Produktregel)", () => {
  // (x³·sin x)' = 3x²·sin x + x³·cos x ; bei x = 1 : 3·sin 1 + cos 1 = 3,0647153.
  const r = ok({ aufgabe: "ableitung", ausdruck: "x^3*sin(x)", stelle: 1 });
  test("Wert an der Stelle und Ausdruck", () => {
    close(r.wert_an_stelle, 3.064715260291829);
    expect(r.ableitung.ausdruck).toContain("cos");
    expect(r.ableitung.latex.length).toBeGreaterThan(0);
  });
  test("zweite Ableitung von sin(2x) = −4·sin(2x)", () => {
    const d2 = ok({ aufgabe: "ableitung", ausdruck: "sin(2x)", ordnung: 2, stelle: 0.5 });
    close(d2.wert_an_stelle, -4 * Math.sin(1));
  });
});

describe("M2 — Integrale", () => {
  test("∫₀^π sin x dx = 2", () => {
    const r = ok({ aufgabe: "integral", ausdruck: "sin(x)", von: 0, bis: Math.PI });
    close(r.bestimmtes_integral.wert, 2);
    expect(r.stammfunktion.quelle).toContain("bestätigt");
  });
  test("∫ (3x² + 2x) dx = x³ + x², ∫₀² = 12", () => {
    const r = ok({ aufgabe: "integral", ausdruck: "3*x^2 + 2*x", von: 0, bis: 2 });
    close(r.bestimmtes_integral.wert, 12);
    expect(r.bestimmtes_integral.verfahren).toContain("F(b)");
  });
  test("Falscher Kandidat des Modells wird erkannt", () => {
    const r = ok({ aufgabe: "integral", ausdruck: "3*x^2 + 2*x", stammfunktion_kandidat: "x^3 + 2*x" });
    // Der Kandidat ist falsch, die Regeltabelle findet die richtige.
    expect(r.stammfunktion.quelle).toContain("FALSCH");
    expect(r.stammfunktion.quelle).toContain("Regeltabelle");
  });
  test("Innere lineare Funktion : ∫ e^(−2t) dt von 0 bis 1 = (1 − e^−2)/2", () => {
    const r = ok({ aufgabe: "integral", ausdruck: "exp(-2*t)", variable: "t", von: 0, bis: 1 });
    close(r.bestimmtes_integral.wert, (1 - Math.exp(-2)) / 2);
  });
  test("Ohne geschlossene Form : numerisch, und das wird gesagt", () => {
    const r = ok({ aufgabe: "integral", ausdruck: "exp(-x^2)", von: 0, bis: 1 });
    expect(r.stammfunktion).toBeNull();
    close(r.bestimmtes_integral.wert, 0.7468241328124271, 1e-9);
  });
});

describe("M3 — DGL 2. Ordnung, ungedämpfte Schwingung", () => {
  // y'' + 4y = 0, y(0) = 1, y'(0) = 0 → y = cos(2x) ; y(1) = cos 2 = −0,4161468.
  const r = ok({ aufgabe: "dgl", dgl: { art: "linear_konstant", koeffizienten: [1, 0, 4], y0: 1, dy0: 0 }, stelle: 1 });
  test("Lösung, Wurzeln ±2i", () => {
    close(r.wert_an_stelle.y, -0.4161468365471424);
    expect(r.wurzeln[0].im).toBe(2);
    expect(r.fall).toContain("ungedämpft");
  });
  test("gedämpft : x'' + 2x' + 5x = 0 → e^(−t)(cos 2t + ½ sin 2t)", () => {
    const d = ok({
      aufgabe: "dgl",
      variable: "t",
      dgl: { art: "linear_konstant", koeffizienten: [1, 2, 5], y0: 1, dy0: 0 },
      stelle: 1,
    });
    close(d.wert_an_stelle.y, 0.01416404894540483);
    close(d.kennwerte.daempfungsgrad, 1 / Math.sqrt(5));
  });
});

describe("M4 — DGL 1. Ordnung (RC-Ladevorgang)", () => {
  // y' + 2y = 4, y(0) = 0 → y = 2·(1 − e^(−2x)) ; y(1) = 1,7293294 ; τ = 0,5.
  const r = ok({ aufgabe: "dgl", dgl: { art: "linear_konstant", koeffizienten: [1, 2], rechte_seite: 4, y0: 0 }, stelle: 1 });
  test("Wert, Zeitkonstante, Endwert", () => {
    close(r.wert_an_stelle.y, 1.7293294335267746);
    close(r.kennwerte.zeitkonstante, 0.5);
    close(r.kennwerte.endwert, 2);
  });
  test("numerisch : y' = −y, y(0) = 1 → y(1) = 1/e", () => {
    const n = ok({ aufgabe: "dgl", dgl: { art: "numerisch", gleichung: "-y", y0: 1, x_ende: 1 } });
    close(n.endwert.y, 0.36787944117144233, 1e-10);
  });
});

describe("M5 — Matrizen", () => {
  const A = [
    [2, 1],
    [1, 3],
  ];
  test("det, LGS, Eigenwerte", () => {
    close(ok({ aufgabe: "matrix", matrix: { operation: "determinante", A } }).determinante, 5);
    const l = ok({ aufgabe: "matrix", matrix: { operation: "lgs", A, b: [3, 5] } });
    close(l.loesung[0], 0.8);
    close(l.loesung[1], 1.4);
    const e = ok({ aufgabe: "matrix", matrix: { operation: "eigenwerte", A } });
    const vals = e.eigenwerte.map((z: Any) => z.re).sort((a: number, b: number) => a - b);
    close(vals[0], 1.381966011250105);
    close(vals[1], 3.618033988749895);
  });
  test("singuläres LGS : unendlich viele bzw. keine Lösung", () => {
    const S = [
      [1, 2],
      [2, 4],
    ];
    expect(ok({ aufgabe: "matrix", matrix: { operation: "lgs", A: S, b: [3, 6] } }).aussage).toContain("unendlich");
    expect(ok({ aufgabe: "matrix", matrix: { operation: "lgs", A: S, b: [3, 7] } }).aussage).toContain("keine Lösung");
  });
  test("Inverse mit Probe", () => {
    const r = ok({ aufgabe: "matrix", matrix: { operation: "inverse", A } });
    close(r.inverse[0][0], 0.6);
    close(r.inverse[0][1], -0.2);
  });
});

describe("Zusatz — Nullstellen und Sicherheit", () => {
  test("x² − 2 auf [0, 2] → √2", () => {
    const r = ok({ aufgabe: "nullstellen", ausdruck: "x^2 - 2", von: 0, bis: 2 });
    expect(r.nullstellen).toHaveLength(1);
    close(r.nullstellen[0], Math.SQRT2);
  });
  test("ln wird als natürlicher Logarithmus gelesen", () => {
    close(ok({ aufgabe: "auswerten", ausdruck: "ln(e^2)" }).wert, 2);
  });
  test("Gefährliche Konstrukte werden VOR der Auswertung abgelehnt", () => {
    for (const evil of ['import("fs")', "x.constructor", "f(x) = 2", "evaluate(\"1\")", "createUnit(\"foo\")", "[1,2]", "a = 3"]) {
      expect(() => parseExpr(evil, ["x"])).toThrow();
    }
    const r = solveMath({ aufgabe: "auswerten", ausdruck: 'import("fs")' });
    expect(r.ok).toBe(false);
  });
});
