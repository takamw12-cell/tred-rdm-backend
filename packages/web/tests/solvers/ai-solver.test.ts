import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  gradientDescentStep,
  linearRegression,
  matrixMultiply,
  perceptronForwardPass,
  relu,
  sigmoid,
  softmax,
  solveAi,
  vectorDotProduct,
} from "../../src/api/lib/solvers/ai-solver";
import { detectDomain, domainHint } from "../../src/api/lib/solvers/domain";
import { domainPack } from "../../src/api/prompts";
import { solverChartBlockFromPart } from "../../src/web/lib/solver-charts";

/** Fiabilité : au moins trois cas de référence par fonction. */
const close = (a: number, b: number, eps = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);

describe("Lineare Algebra", () => {
  test("matrixMultiply : 2×2, 2×3·3×2, Einheitsmatrix", () => {
    expect(matrixMultiply([[1, 2], [3, 4]], [[5, 6], [7, 8]])).toEqual([[19, 22], [43, 50]]);
    expect(matrixMultiply([[1, 2, 3], [4, 5, 6]], [[7, 8], [9, 10], [11, 12]])).toEqual([[58, 64], [139, 154]]);
    expect(matrixMultiply([[1, 0], [0, 1]], [[3, -2], [0.5, 4]])).toEqual([[3, -2], [0.5, 4]]);
    expect(() => matrixMultiply([[1, 2]], [[1, 2]])).toThrow("nicht definiert");
    expect(() => matrixMultiply([[1, 2], [3]], [[1], [2]])).toThrow("rechteckig");
  });

  test("vectorDotProduct : 32, orthogonal, negativ", () => {
    expect(vectorDotProduct([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(vectorDotProduct([1, 0], [0, 1])).toBe(0);
    expect(vectorDotProduct([-1, 2], [3, 0.5])).toBe(-2);
    expect(() => vectorDotProduct([1, 2], [1])).toThrow("Längen");
  });
});

describe("Lineare Regression", () => {
  test("exakte Gerade y = 2x : a = 2, b = 0, R² = 1", () => {
    const r = linearRegression([1, 2, 3, 4, 5], [2, 4, 6, 8, 10]);
    close(r.a, 2);
    close(r.b, 0);
    close(r.r2, 1);
  });

  test("y = 2x + 1", () => {
    const r = linearRegression([1, 2, 3, 4, 5], [3, 5, 7, 9, 11]);
    close(r.a, 2);
    close(r.b, 1);
  });

  test("Lehrbuchbeispiel mit Streuung : a = 0,6 ; b = 2,2 ; R² = 0,6", () => {
    const r = linearRegression([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    close(r.a, 0.6);
    close(r.b, 2.2);
    close(r.r2, 0.6);
    close(r.residuen.reduce((s, v) => s + v, 0), 0, 1e-9);
    expect(() => linearRegression([2, 2, 2], [1, 2, 3])).toThrow("gleich");
  });
});

describe("Gradientenabstieg", () => {
  test.each([
    [[1, 2], [0.5, -1], 0.1, [0.95, 2.1]],
    [[0], [2], 0.5, [-1]],
    [[3, 3, 3], [0, 0, 0], 1, [3, 3, 3]],
  ])("gradientDescentStep(%p, %p, %p) = %p", (w, g, eta, expected) => {
    gradientDescentStep(w, g, eta).forEach((v, i) => close(v, expected[i]));
  });

  test("Lernrate ≤ 0 : Fehler", () => {
    expect(() => gradientDescentStep([1], [1], 0)).toThrow("Lernrate");
  });
});

describe("Aktivierungen", () => {
  test("sigmoid : 0,5 ; σ(2) ; stabil bei ±1000", () => {
    expect(sigmoid(0)).toBe(0.5);
    close(sigmoid(2), 0.8807970779778823);
    expect(sigmoid(-1000)).toBe(0);
    expect(sigmoid(1000)).toBe(1);
    close(sigmoid(-2), 1 - sigmoid(2));
  });

  test("relu", () => {
    expect(relu(-3)).toBe(0);
    expect(relu(0)).toBe(0);
    expect(relu(2.5)).toBe(2.5);
  });

  test("softmax : Referenz, Gleichverteilung, Überlaufschutz", () => {
    const s = softmax([1, 2, 3]);
    close(s[0], 0.09003057317038046);
    close(s[1], 0.24472847105479764);
    close(s[2], 0.6652409557748219);
    expect(softmax([0, 0])).toEqual([0.5, 0.5]);
    expect(softmax([1000, 1000])).toEqual([0.5, 0.5]);
  });
});

describe("Perzeptron", () => {
  test("UND-Gatter (w = [1, 1], b = −1,5, Stufe)", () => {
    expect(perceptronForwardPass([1, 1], [1, 1], -1.5).ausgabe).toBe(1);
    expect(perceptronForwardPass([1, 0], [1, 1], -1.5).ausgabe).toBe(0);
    expect(perceptronForwardPass([0, 0], [1, 1], -1.5).ausgabe).toBe(0);
  });

  test("ODER-Gatter (b = −0,5)", () => {
    expect(perceptronForwardPass([0, 1], [1, 1], -0.5).ausgabe).toBe(1);
    expect(perceptronForwardPass([0, 0], [1, 1], -0.5).ausgabe).toBe(0);
  });

  test("Sigmoid-Neuron mit gegebenen Gewichten", () => {
    const r = perceptronForwardPass([1, 2], [0.5, -0.25], 0.1, "sigmoid");
    close(r.z, 0.1);
    close(r.ausgabe, 0.52497918747894);
    expect(r.rechnung).toBe("z = 0.5·1 + -0.25·2 + (0.1) = 0.1");
  });
});

describe("solve_ai (Werkzeug) und Routage", () => {
  test("Werkzeug : Ergebnisse, Diagramm, ehrliche Fehler", () => {
    expect(solveAi({ aufgabe: "matrix_produkt", A: [[1, 2], [3, 4]], B: [[5, 6], [7, 8]] })).toMatchObject({ ok: true, ergebnis: [[19, 22], [43, 50]] });
    const reg = solveAi({ aufgabe: "regression", x: [1, 2, 3, 4, 5], y: [2, 4, 5, 4, 5] });
    expect(reg).toMatchObject({ ok: true, a_steigung: 0.6, b_achsenabschnitt: 2.2, r2: 0.6 });
    const block = solverChartBlockFromPart({ type: "tool-solve_ai", state: "output-available", output: reg });
    expect(block).toContain("```chart");
    expect(block).toContain('"line":true');
    expect(solveAi({ aufgabe: "aktivierung", funktion: "softmax", werte: [0, 0] })).toMatchObject({ ok: true, ergebnis: [0.5, 0.5] });
    expect(solveAi({ aufgabe: "perzeptron", eingaben: [1, 1], gewichte: [1, 1], bias: -1.5 })).toMatchObject({ ok: true, ausgabe: 1 });
    expect(solveAi({ aufgabe: "skalarprodukt", v1: [1, 2], v2: [3] })).toMatchObject({ ok: false });
  });

  const cases: [string, string][] = [
    ["Verschlüssele HALLO mit der Caesar-Chiffre, Verschiebung 3", "informatik"],
    ["RSA mit p = 3, q = 11, e = 7: berechne d", "informatik"],
    ["Vereinfache die Funktion mit einem KV-Diagramm: Wahrheitstabelle gegeben", "informatik"],
    ["Bestimme Netzadresse und Broadcast von 192.168.1.130/26", "informatik"],
    ["Calcule la sortie d'un perceptron avec la fonction sigmoïde", "ki"],
    ["Berechne die lineare Regression und das Bestimmtheitsmaß", "ki"],
    ["Ein Schritt Gradientenabstieg mit Lernrate 0,1 für das neuronale Netz", "ki"],
  ];
  for (const [text, domain] of cases) {
    test(`${domain} ← « ${text.slice(0, 40)}… »`, () => {
      const g = detectDomain(text);
      expect(g.domain).toBe(domain as never);
      expect(g.covered).toBe(true);
    });
  }

  test("Hinweis, Fachmodule, Werkzeuge und Regel im Prompt", () => {
    expect(domainHint(detectDomain("Subnetzmaske für /20"))).toContain("solve_cyber");
    expect(domainHint(detectDomain("Softmax eines neuronalen Netzes"))).toContain("solve_ai");
    expect(domainPack("informatik")?.text).toContain("solve_cyber");
    expect(domainPack("ki")?.text).toContain("solve_ai");
    const agent = readFileSync(join(import.meta.dir, "../../src/api/agent/index.ts"), "utf8");
    expect(agent).toContain("solve_cyber: tool({");
    expect(agent).toContain("solve_ai: tool({");
    expect(agent).toContain('Sicherheit oder KI benutzt du IMMER "solve_cyber" bzw. "solve_ai"');
    expect(agent).toContain("Hashes, Chiffren, RSA-Schlüssel, Minimalformen, Subnetze,");
  });
});
