import { describe, expect, test } from "bun:test";
import { parabolaChart, simplifySqrt, solvePythagoras, solveQuadratic, solveSchoolMath } from "../../src/api/lib/solvers/highschool-solver";

/** Fiabilité : au moins trois cas de référence (manuel scolaire) par fonction. */
const near = (a: number, b: number, eps = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);

describe("solveQuadratic", () => {
  test("x² − 5x + 6 = 0 → D = 1, x₁ = 2, x₂ = 3, S(2,5 | −0,25)", () => {
    const r = solveQuadratic(1, -5, 6);
    expect(r.diskriminante).toBe(1);
    expect(r.loesungen).toEqual([2, 3]);
    expect(r.exakt).toBe("x₁ = 2, x₂ = 3");
    expect(r.scheitel).toEqual({ x: 2.5, y: -0.25 });
    expect(r.scheitelform).toBe("f(x) = (x − 2.5)² − 0.25");
    expect(r.linearfaktoren).toBe("f(x) = (x − 2)·(x − 3)");
  });
  test("2x² − 4x − 6 = 0 → x = −1 und 3 ; p-q-Formel mit p = −2, q = −3", () => {
    const r = solveQuadratic(2, -4, -6);
    expect(r.loesungen).toEqual([-1, 3]);
    expect(r.pq).toMatchObject({ p: -2, q: -3 });
    expect(r.linearfaktoren).toBe("f(x) = 2·(x + 1)·(x − 3)");
  });
  test("x² + 2x + 1 = 0 → D = 0, doppelte Lösung x = −1", () => {
    const r = solveQuadratic(1, 2, 1);
    expect(r.anzahl).toBe(1);
    expect(r.loesungen).toEqual([-1]);
    expect(r.exakt).toBe("x = -1");
    expect(r.scheitelform).toBe("f(x) = (x + 1)²");
  });
  test("x² − 2x − 1 = 0 → exakt x = 1 ± √2", () => {
    const r = solveQuadratic(1, -2, -1);
    expect(r.exakt).toBe("x₁,₂ = 1 ± √2");
    near(r.loesungen[0], 1 - Math.SQRT2);
    near(r.loesungen[1], 1 + Math.SQRT2);
  });
  test("2x² + 3x − 1 = 0 → (−3 ± √17)/4 ; Dezimalkoeffizienten 0,5x² − x − 1,5 → −1 und 3", () => {
    expect(solveQuadratic(2, 3, -1).exakt).toBe("x₁,₂ = (-3 ± √17)/4");
    const d = solveQuadratic(0.5, -1, -1.5);
    expect(d.exakt).toBe("x₁ = -1, x₂ = 3");
    near(d.loesungen[0], -1);
  });
  test("D < 0 : x² + 1 → ±i ; x² + 2x + 5 → −1 ± 2i", () => {
    const r = solveQuadratic(1, 0, 1);
    expect(r.anzahl).toBe(0);
    expect(r.loesungen).toEqual([]);
    expect(r.exakt).toBe("x₁,₂ = ±i");
    expect(r.scheitelform).toBe("f(x) = x² + 1");
    expect(solveQuadratic(1, 2, 5)).toMatchObject({ komplex: { re: -1, im: 2 }, exakt: "x₁,₂ = -1 ± 2i" });
  });
  test("a = 0 → lineare Gleichung ; numerisch stabil bei b² ≫ 4ac", () => {
    expect(solveQuadratic(0, 2, -4)).toMatchObject({ typ: "linear", loesungen: [2], exakt: "x = 2" });
    expect(solveQuadratic(0, 0, 3).anzahl).toBe(0);
    const r = solveQuadratic(1, -1e8, 1);
    near(r.loesungen[0], 1e-8, 1e-20);
  });
  test("Parabel-Diagramm : Kurve, Nullstellen, Scheitelpunkt", () => {
    const c = parabolaChart(solveQuadratic(1, -5, 6));
    expect(c.type).toBe("scatter");
    expect(c.series.map((s) => s.label)).toEqual(["f(x)", "Nullstellen", "Scheitelpunkt S"]);
    expect(c.series[0].line).toBe(true);
    expect(c.series[1].data).toEqual([{ x: 2, y: 0 }, { x: 3, y: 0 }]);
  });
});

describe("solvePythagoras", () => {
  test("3, 4 → 5 ; 5, 12 → 13", () => {
    expect(solvePythagoras({ a: 3, b: 4 })).toMatchObject({ c: 5, exakt: "c = 5" });
    expect(solvePythagoras({ a: 5, b: 12 }).c).toBe(13);
  });
  test("Kathete : c = 10, a = 6 → b = 8", () => {
    expect(solvePythagoras({ a: 6, c: 10 })).toMatchObject({ b: 8, gesucht: "b" });
  });
  test("exakt : 1, 1 → √2 ; 2, 4 → 2√5", () => {
    const r = solvePythagoras({ a: 1, b: 1 });
    expect(r.exakt).toBe("c = √2");
    near(r.c, Math.SQRT2);
    expect(solvePythagoras({ a: 2, b: 4 }).exakt).toBe("c = 2√5");
  });
  test("Umkehrung : 3-4-5 rechtwinklig, 4-5-6 nicht ; Hypotenuse zu kurz → Fehler", () => {
    expect(solvePythagoras({ a: 3, b: 4, c: 5 }).rechtwinklig).toBe(true);
    expect(solvePythagoras({ a: 4, b: 5, c: 6 }).rechtwinklig).toBe(false);
    expect(() => solvePythagoras({ a: 10, c: 6 })).toThrow("Hypotenuse");
  });
  test("simplifySqrt", () => {
    expect(simplifySqrt(8)).toEqual([2, 2]);
    expect(simplifySqrt(72)).toEqual([6, 2]);
    expect(simplifySqrt(13)).toEqual([1, 13]);
  });
});

describe("Werkzeug schule_berechnen", () => {
  test("quadratisch mit Diagramm ; fehlende Koeffizienten → Fehler", () => {
    const r = solveSchoolMath({ aufgabe: "quadratisch", a: 1, b: -5, c: 6 }) as Record<string, unknown>;
    expect(r).toMatchObject({ ok: true, diskriminante: 1, loesungen: [2, 3], exakt: "x₁ = 2, x₂ = 3" });
    expect((r.diagramme as unknown[]).length).toBe(1);
    expect(solveSchoolMath({ aufgabe: "quadratisch", a: 1 })).toMatchObject({ ok: false });
  });
  test("pythagoras", () => {
    expect(solveSchoolMath({ aufgabe: "pythagoras", a: 3, b: 4 })).toMatchObject({ ok: true, c: 5, gesucht: "c" });
  });
});
