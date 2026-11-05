import { describe, expect, test } from "bun:test";

import { runBalkenstatik, type BalkenstatikInput } from "../src/api/lib/beam-tool";
import { renderBeamSvg } from "../src/web/lib/beam-svg";
import { solveRdmSafe } from "../src/api/lib/rdm-solver";

/**
 * Module 2 — charges triangulaires et trapézoïdales.
 *
 * Valeurs de référence calculées à la main (Gross/Hauger/Schröder/Wall,
 * Technische Mechanik 1). M_max est vérifié à sa position EXACTE, racine de
 * Q(x) = 0 — un échantillonnage de 200 points ne tombe jamais sur L/√3.
 */

const ok = (input: BalkenstatikInput) => {
  const r = runBalkenstatik(input);
  if (!r.ok) throw new Error(`Solveur en erreur : ${JSON.stringify(r)}`);
  return r;
};
const reaction = (r: ReturnType<typeof ok>, name: string) =>
  r.auflagerkraefte.find((a) => a.name === name)!;

const zweiLager = (L: number): BalkenstatikInput["lager"] => [
  { x: 0, art: "festlager", name: "A" },
  { x: L, art: "loslager", name: "B" },
];

describe("balkenstatik — Dreiecks- und Trapezlast (Module 2)", () => {
  test("Dreieckslast 0 → q₀ auf zwei Lagern : A = q₀L/6, B = q₀L/3, M_max = q₀L²/(9√3) bei L/√3", () => {
    const L = 6;
    const q0 = 12;
    const input: BalkenstatikInput = {
      laenge: L,
      lager: zweiLager(L),
      streckenlasten: [{ von: 0, bis: L, q: 0, qEnde: q0 }],
    };
    const r = ok(input);

    expect(reaction(r, "A").force).toBeCloseTo((q0 * L) / 6, 6); // 12
    expect(reaction(r, "B").force).toBeCloseTo((q0 * L) / 3, 6); // 24
    expect(r.extremwerte.momentMax.x).toBeCloseTo(L / Math.sqrt(3), 5); // 3,4641
    expect(r.extremwerte.momentMax.y).toBeCloseTo((q0 * L * L) / (9 * Math.sqrt(3)), 4); // 27,7128

    // Le dessin montre un triangle, pas un rectangle.
    const p = r.diagramm;
    const s = solveRdmSafe({ ...p.problem });
    if (!s.ok) throw new Error("solveur");
    const svg = renderBeamSvg(p, s);
    expect(svg).toContain("<polygon");
    expect(svg).toContain("q₀ = ");
  });

  test("Trapezlast q₁ = 2 → q₂ = 8 auf zwei Lagern, L = 6 : A = 12, B = 18, M_max exakt", () => {
    const L = 6;
    const [q1, q2] = [2, 8];
    const r = ok({
      laenge: L,
      lager: zweiLager(L),
      streckenlasten: [{ von: 0, bis: L, q: q1, qEnde: q2 }],
    });

    // A = L(2q₁ + q₂)/6, B = L(q₁ + 2q₂)/6
    expect(reaction(r, "A").force).toBeCloseTo((L * (2 * q1 + q2)) / 6, 6);
    expect(reaction(r, "B").force).toBeCloseTo((L * (q1 + 2 * q2)) / 6, 6);

    // Q(x) = 12 − 2x − x²/2 = 0  →  x = −2 + √28
    const k = (q2 - q1) / L;
    const xm = -2 + Math.sqrt(28);
    const Mm = 12 * xm - (q1 * xm * xm) / 2 - (k * xm ** 3) / 6;
    expect(r.extremwerte.momentMax.x).toBeCloseTo(xm, 5); // 3,2915
    expect(r.extremwerte.momentMax.y).toBeCloseTo(Mm, 4); // 22,72
  });

  test("Kragarm mit Dreieckslast, Maximum an der Einspannung : A = q₀L/2, M_A = −q₀L²/6", () => {
    const L = 3;
    const q0 = 10;
    const r = ok({
      laenge: L,
      lager: [{ x: 0, art: "einspannung", name: "A" }],
      streckenlasten: [{ von: 0, bis: L, q: q0, qEnde: 0 }],
    });

    expect(reaction(r, "A").force).toBeCloseTo((q0 * L) / 2, 6); // 15
    expect(reaction(r, "A").moment).toBeCloseTo(-(q0 * L * L) / 6, 6); // −15
    expect(r.extremwerte.momentMin.y).toBeCloseTo(-(q0 * L * L) / 6, 4);
  });
});

describe("balkenstatik — signe du moment d'encastrement à droite", () => {
  test("encastré-encastré, q = 10, L = 4 : M_A = M_B = −qL²/12 (même signe que M(x))", () => {
    const r = ok({
      laenge: 4,
      lager: [
        { x: 0, art: "einspannung", name: "A" },
        { x: 4, art: "einspannung", name: "B" },
      ],
      streckenlasten: [{ von: 0, bis: 4, q: 10 }],
    });
    expect(reaction(r, "A").moment).toBeCloseTo(-160 / 12, 4);
    expect(reaction(r, "B").moment).toBeCloseTo(-160 / 12, 4);
  });

  test("encastré-encastré, triangle 0 → 12, L = 6 : M_A = −q₀L²/30, M_B = −q₀L²/20", () => {
    const r = ok({
      laenge: 6,
      lager: [
        { x: 0, art: "einspannung", name: "A" },
        { x: 6, art: "einspannung", name: "B" },
      ],
      streckenlasten: [{ von: 0, bis: 6, q: 0, qEnde: 12 }],
    });
    expect(reaction(r, "A").moment).toBeCloseTo(-14.4, 4);
    expect(reaction(r, "B").moment).toBeCloseTo(-21.6, 4);
    // La valeur publiée coïncide avec la courbe juste avant l'appui.
    expect(r.extremwerte.momentMin.y).toBeCloseTo(-21.6, 4);
  });

  test("console encastrée à DROITE, F = 50 en x = 0, L = 2 : M_B = −100", () => {
    const r = ok({
      laenge: 2,
      lager: [{ x: 2, art: "einspannung", name: "B" }],
      einzellasten: [{ x: 0, F: 50 }],
    });
    expect(reaction(r, "B").force).toBeCloseTo(50, 6);
    expect(reaction(r, "B").moment).toBeCloseTo(-100, 6);
  });
});
