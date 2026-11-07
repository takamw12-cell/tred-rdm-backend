import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkGoldbach,
  collatzChart,
  collatzRecord,
  collatzSequence,
  findPrimeGaps,
  goldbachPartitions,
  solveOpenMath,
} from "../../src/api/lib/solvers/open-math-solver";
import { detectDomain, domainHint } from "../../src/api/lib/solvers/domain";
import { solverChartBlockFromPart } from "../../src/web/lib/solver-charts";

describe("Collatz", () => {
  test("n = 27 : 111 étapes, pic 9232 (référence)", () => {
    const r = collatzSequence(27);
    expect(r.steps).toBe(111);
    expect(r.max).toBe("9232");
    expect(r.maxAt).toBe(77);
    expect(r.values.slice(0, 6)).toEqual([27, 82, 41, 124, 62, 31]);
    expect(r.values.at(-1)).toBe(1);
    expect(r.values).toHaveLength(112);
    expect(r.oddSteps + r.evenSteps).toBe(111);
    expect(r.oddSteps).toBe(41);
  });

  test.each([
    [1, 0, "1"],
    [6, 8, "16"],
    [7, 16, "52"],
    [97, 118, "9232"],
    [871, 178, "190996"], // record sous 1 000
    [837799, 524, "2974984576"], // record sous 1 000 000 (Projet Euler 14)
  ])("n = %p : %p étapes, pic %p", (n, steps, max) => {
    const r = collatzSequence(n);
    expect(r.steps).toBe(steps);
    expect(r.max).toBe(max);
  });

  test("chaque terme suit la règle (contre-épreuve)", () => {
    const v = collatzSequence(27).values as number[];
    for (let i = 1; i < v.length; i++) {
      expect(v[i]).toBe(v[i - 1] % 2 === 0 ? v[i - 1] / 2 : 3 * v[i - 1] + 1);
    }
  });

  test("grands nombres en BigInt, entrées invalides refusées", () => {
    const big = collatzSequence("9780657631"); // pic au-delà de 2^32
    expect(BigInt(big.max)).toBeGreaterThan(2n ** 32n);
    expect(() => collatzSequence(0)).toThrow();
    expect(() => collatzSequence(2.5)).toThrow();
    expect(() => collatzSequence("1" + "0".repeat(16))).toThrow("10^15");
  });

  test("record jusqu'à une borne", () => {
    expect(collatzRecord(1000)).toEqual({ n: 871, steps: 178 });
    expect(collatzRecord(10)).toEqual({ n: 9, steps: 19 });
    expect(collatzRecord(100)).toEqual({ n: 97, steps: 118 });
  });

  test("graphique : une valeur par étape, le pic conservé", () => {
    const c = collatzChart(collatzSequence(27));
    expect(c.series[0].data).toHaveLength(112);
    expect(Math.max(...c.series[0].data.map((p) => p.y))).toBe(9232);
    const long = collatzChart(collatzSequence(837799), 100);
    expect(long.series[0].data.length).toBeLessThanOrEqual(110);
    expect(Math.max(...long.series[0].data.map((p) => p.y))).toBe(2974984576);
  });
});

describe("Goldbach", () => {
  test("vérifié jusqu'à 100, 10 000 et 1 000 000", () => {
    for (const limit of [100, 10_000, 1_000_000]) {
      const r = checkGoldbach(limit);
      expect(r.verified).toBe(true);
      expect(r.counterexample).toBeNull();
      expect(r.checked).toBe(limit / 2 - 1);
    }
  });

  test("plus petite décomposition et cas le plus difficile", () => {
    const r = checkGoldbach(100);
    expect(r.examples.find((e) => e.even === 20)).toEqual({ even: 20, p: 3, q: 17 });
    expect(r.examples.at(-1)).toEqual({ even: 100, p: 3, q: 97 });
    expect(r.hardest).toEqual({ even: 98, p: 19, q: 79 });
  });

  test("décompositions de 100, 28 et 4", () => {
    expect(goldbachPartitions(100)).toEqual([
      { p: 3, q: 97 },
      { p: 11, q: 89 },
      { p: 17, q: 83 },
      { p: 29, q: 71 },
      { p: 41, q: 59 },
      { p: 47, q: 53 },
    ]);
    expect(goldbachPartitions(28)).toEqual([{ p: 5, q: 23 }, { p: 11, q: 17 }]);
    expect(goldbachPartitions(4)).toEqual([{ p: 2, q: 2 }]);
    expect(() => goldbachPartitions(7)).toThrow("gerade");
  });
});

describe("Écarts entre premiers", () => {
  test("jusqu'à 100 : 25 premiers, 8 paires de jumeaux, plus grand écart 8 (89 → 97)", () => {
    const r = findPrimeGaps(100);
    expect(r.primeCount).toBe(25);
    expect(r.twinPrimePairs).toBe(8);
    expect(r.maxGap).toEqual({ gap: 8, after: 89, next: 97 });
  });

  test("écarts records jusqu'à 1 000", () => {
    expect(findPrimeGaps(1000).recordGaps.map((g) => [g.gap, g.after])).toEqual([
      [1, 2],
      [2, 3],
      [4, 7],
      [6, 23],
      [8, 89],
      [14, 113],
      [18, 523],
      [20, 887],
    ]);
  });

  test("jusqu'à 1 000 000 : 78 498 premiers, 8 169 jumeaux, écart record 114", () => {
    const r = findPrimeGaps(1_000_000);
    expect(r.primeCount).toBe(78498);
    expect(r.twinPrimePairs).toBe(8169);
    expect(r.maxGap).toEqual({ gap: 114, after: 492113, next: 492227 });
  });
});

describe("solve_open_math (outil) et intégration", () => {
  test("Collatz 27 par l'outil, avec diagramme", () => {
    const r = solveOpenMath({ aufgabe: "collatz", n: 27 });
    expect(r).toMatchObject({ ok: true, schritte: 111, maximum: "9232", maximum_bei_schritt: 77 });
    const block = solverChartBlockFromPart({ type: "tool-solve_open_math", state: "output-available", output: r });
    expect(block).toContain("```chart");
    expect(block).toContain("111 Schritte, Maximum 9232");
  });

  test("toujours : vérifier n'est pas démontrer ; erreurs honnêtes", () => {
    expect(solveOpenMath({ aufgabe: "goldbach", grenze: 1000 })).toMatchObject({ ok: true, bestaetigt: true, hinweis: expect.stringContaining("KEIN Beweis") });
    expect(solveOpenMath({ aufgabe: "collatz" })).toMatchObject({ ok: false });
    expect(solveOpenMath({ aufgabe: "primzahlluecken", grenze: 10 ** 9 })).toMatchObject({ ok: false });
  });

  test("détection, règle du prompt, outil enregistré", () => {
    expect(detectDomain("Berechne die Collatz-Folge für 27").domain).toBe("mathematik");
    expect(detectDomain("Vérifie la conjecture de Goldbach jusqu'à 1000").domain).toBe("mathematik");
    expect(domainHint(detectDomain("Collatz-Problem für n = 27"))).toContain("solve_open_math");
    const agent = readFileSync(join(import.meta.dir, "../../src/api/agent/index.ts"), "utf8");
    expect(agent).toContain("solve_open_math: tool({");
    expect(agent).toContain("berechnest du die\n            Folge oder die Prüfung NIEMALS selbst");
    expect(agent).toContain('Du rufst "solve_open_math" auf, um die\n            Genauigkeit zu garantieren');
    // Jamais de « preuve » ; tester ≠ démontrer ; Riemann sans outil
    expect(agent).toContain("behauptest NIEMALS, einen Beweis");
    expect(agent).toContain("Fälle prüfen (das tun wir");
    expect(agent).toContain("formalen mathematischen\n            Beweis für ALLE Zahlen (der noch aussteht)");
    expect(agent).toContain("erfinde\n            keine Nullstellen der Zetafunktion");
    expect(detectDomain("Beweise die Riemannsche Vermutung").domain).toBe("mathematik");
  });
});
