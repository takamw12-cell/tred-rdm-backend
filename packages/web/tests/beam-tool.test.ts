import { describe, expect, test } from "bun:test";

import { runBalkenstatik, payloadToProblem, type BalkenstatikInput } from "../src/api/lib/beam-tool";
import { solveMechanicsSafe, type Point } from "../src/api/lib/mechanics-solver";
import {
  BEAM_LANG,
  beamBlockFromPart,
  dropDuplicateBeamCharts,
  parseBeamPayload,
  renderBeamSvg,
} from "../src/web/lib/beam-svg";

/**
 * Module 1 — schémas de poutre.
 *
 * Le bug d'origine : `thin()` gardait un point sur quatre des courbes du
 * solveur. Sous une force ponctuelle, Q(x) a deux points de même abscisse
 * (avant / après le saut) ; l'échantillonnage en perdait un, et le saut
 * vertical devenait une pente. Ces tests empêchent son retour.
 */

const ok = (input: BalkenstatikInput) => {
  const r = runBalkenstatik(input);
  if (!r.ok) throw new Error(`Solveur en erreur : ${JSON.stringify(r)}`);
  return r;
};

const has = (pts: Point[], x: number, y: number) =>
  pts.some((p) => Math.abs(p.x - x) < 1e-4 && Math.abs(p.y - y) < 1e-6);

const reaction = (r: ReturnType<typeof ok>, name: string) =>
  r.auflagerkraefte.find((a) => a.name === name)!;

const EINFELD_F100: BalkenstatikInput = {
  laenge: 4,
  lager: [
    { x: 0, art: "festlager", name: "A" },
    { x: 4, art: "loslager", name: "B" },
  ],
  einzellasten: [{ x: 1, F: 100 }],
};

describe("balkenstatik — sauts conservés (non-régression thin())", () => {
  test("F = 100 N en x = 1 m : Q contient les DEUX côtés du saut", () => {
    const r = ok(EINFELD_F100);
    expect(has(r.kritischePunkte.querkraft, 1, 75)).toBe(true);
    expect(has(r.kritischePunkte.querkraft, 1, -25)).toBe(true);
    // Le point gauche précède le point droit : le tracé descend verticalement.
    const i = r.kritischePunkte.querkraft.findIndex((p) => has([p], 1, 75));
    expect(has([r.kritischePunkte.querkraft[i + 1]], 1, -25)).toBe(true);
  });

  test("moment ponctuel M0 = 20 N·m en x = 2 m : saut de M de 20 exactement", () => {
    const r = ok({
      laenge: 4,
      lager: [
        { x: 0, art: "festlager", name: "A" },
        { x: 4, art: "loslager", name: "B" },
      ],
      einzelmomente: [{ x: 2, M: 20 }],
    });
    const atTwo = r.kritischePunkte.moment.filter((p) => Math.abs(p.x - 2) < 1e-4);
    expect(atTwo.length).toBe(2);
    expect(Math.abs(atTwo[0].y - atTwo[1].y)).toBeCloseTo(20, 6);
  });

  test("l'ancienne sortie échantillonnée a disparu", () => {
    const r = ok(EINFELD_F100) as Record<string, unknown>;
    expect(r.querkraftverlauf).toBeUndefined();
    expect(r.momentenverlauf).toBeUndefined();
  });
});

describe("balkenstatik — le bloc reproduit le calcul", () => {
  test("re-résoudre `diagramm` redonne les mêmes réactions", () => {
    const r = ok(EINFELD_F100);
    const again = solveMechanicsSafe(payloadToProblem(r.diagramm.problem));
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.reactions).toEqual(r.auflagerkraefte);
  });

  test("unités : kN et mm en entrée → SI dans le bloc, unités d'origine conservées", () => {
    const r = ok({
      laenge: 4000,
      lager: [
        { x: 0, art: "festlager", name: "A" },
        { x: 4000, art: "loslager", name: "B" },
      ],
      einzellasten: [{ x: 1000, F: 100 }],
      einheiten: { laenge: "mm", kraft: "kN" },
    });
    expect(r.diagramm.problem.length).toBeCloseTo(4, 9);
    expect(r.diagramm.problem.pointLoads[0]).toEqual({ x: 1, F: 100_000 });
    expect(r.diagramm.units).toEqual({ length: "mm", force: "kN" });
    expect(reaction(r, "A").force).toBeCloseTo(75_000, 6);
  });
});

describe("balkenstatik — cas d'école (audit)", () => {
  const two = (q?: number): BalkenstatikInput["lager"] => [
    { x: 0, art: "festlager", name: "A" },
    { x: q ?? 4, art: "loslager", name: "B" },
  ];

  test("charge répartie q = 10 N/m, L = 4 : A = B = 20, Mmax = qL²/8 = 20", () => {
    const r = ok({ laenge: 4, lager: two(), streckenlasten: [{ von: 0, bis: 4, q: 10 }] });
    expect(reaction(r, "A").force).toBeCloseTo(20, 6);
    expect(reaction(r, "B").force).toBeCloseTo(20, 6);
    expect(r.extremwerte.momentMax.y).toBeCloseTo(20, 4);
  });

  test("force excentrée : A = 75, B = 25, Mmax = 75", () => {
    const r = ok(EINFELD_F100);
    expect(reaction(r, "A").force).toBeCloseTo(75, 6);
    expect(reaction(r, "B").force).toBeCloseTo(25, 6);
    expect(r.extremwerte.momentMax.y).toBeCloseTo(75, 6);
  });

  test("console : F = 50 en bout, L = 2 → A = 50, M_A = −100", () => {
    const r = ok({
      laenge: 2,
      lager: [{ x: 0, art: "einspannung", name: "A" }],
      einzellasten: [{ x: 2, F: 50 }],
    });
    expect(reaction(r, "A").force).toBeCloseTo(50, 6);
    expect(reaction(r, "A").moment).toBeCloseTo(-100, 6);
  });

  test("poutre continue 2 × 4 m, q = 10 : A = C = 15, B = 50, M_B = −20", () => {
    const r = ok({
      laenge: 8,
      lager: [
        { x: 0, art: "festlager", name: "A" },
        { x: 4, art: "loslager", name: "B" },
        { x: 8, art: "loslager", name: "C" },
      ],
      streckenlasten: [{ von: 0, bis: 8, q: 10 }],
    });
    expect(r.statischBestimmt).toBe(false);
    expect(reaction(r, "A").force).toBeCloseTo(15, 6);
    expect(reaction(r, "B").force).toBeCloseTo(50, 6);
    expect(reaction(r, "C").force).toBeCloseTo(15, 6);
    expect(r.extremwerte.momentMin.y).toBeCloseTo(-20, 4);
  });

  test("porte-à-faux : appuis 0 et 3, F = 30 en x = 4 → A = −10, B = 40", () => {
    const r = ok({ laenge: 4, lager: two(3), einzellasten: [{ x: 4, F: 30 }] });
    expect(reaction(r, "A").force).toBeCloseTo(-10, 6);
    expect(reaction(r, "B").force).toBeCloseTo(40, 6);
    expect(r.extremwerte.momentMin.y).toBeCloseTo(-30, 4);
  });

  test("encastré-appuyé, q = 10, L = 4 : A = 25, B = 15, M_A = −20", () => {
    const r = ok({
      laenge: 4,
      lager: [
        { x: 0, art: "einspannung", name: "A" },
        { x: 4, art: "loslager", name: "B" },
      ],
      streckenlasten: [{ von: 0, bis: 4, q: 10 }],
    });
    expect(reaction(r, "A").force).toBeCloseTo(25, 6);
    expect(reaction(r, "A").moment).toBeCloseTo(-20, 6);
    expect(reaction(r, "B").force).toBeCloseTo(15, 6);
  });

  test("système instable : erreur propre, pas d'exception", () => {
    const r = runBalkenstatik({
      laenge: 4,
      lager: [{ x: 0, art: "loslager", name: "A" }],
      einzellasten: [{ x: 2, F: 10 }],
    });
    expect(r.ok).toBe(false);
  });
});

describe("chaîne d'affichage", () => {
  const part = (output: unknown) => ({
    type: "tool-balkenstatik",
    toolCallId: "c1",
    state: "output-available",
    input: EINFELD_F100,
    output,
  });

  test("la partie d'outil devient un bloc ```balkendiagramm lisible", () => {
    const r = ok(EINFELD_F100);
    const block = beamBlockFromPart(part(r));
    expect(block).not.toBeNull();
    const raw = block!.split(`\`\`\`${BEAM_LANG}\n`)[1].split("\n```")[0];
    expect(parseBeamPayload(raw)).toEqual(r.diagramm);
  });

  test("pas de bloc tant que le résultat n'est pas arrivé, ni en cas d'erreur", () => {
    expect(beamBlockFromPart({ type: "tool-balkenstatik", state: "input-available" })).toBeNull();
    expect(beamBlockFromPart(part({ ok: false, error: "x" }))).toBeNull();
    expect(beamBlockFromPart({ type: "text", text: "hallo" })).toBeNull();
  });

  test("le SVG trace le saut de Q en vertical (même x, deux y)", () => {
    const r = ok(EINFELD_F100);
    const solved = solveMechanicsSafe(payloadToProblem(r.diagramm.problem));
    if (!solved.ok) throw new Error("solveur");
    const svg = renderBeamSvg(r.diagramm, solved);
    // Première polyline = Q(x). x = 1 m → px = 64 + 1/4 · 500 = 189.
    const q = /<polyline points="([^"]+)"/.exec(svg)![1].split(" ");
    const atJump = q.filter((pt) => pt.startsWith("189.0,"));
    expect(new Set(atJump).size).toBeGreaterThanOrEqual(2);
    expect(svg).toContain("F = 100 N");
    expect(svg).toContain(">75<");
    expect(svg).toContain(">-25<");
  });

  test("garde-fou : un chart Q(x) recopié est masqué, un autre chart reste", () => {
    const qChart = '```chart\n{"title":"Querkraftverlauf Q(x)","series":[]}\n```';
    const bode = '```chart\n{"title":"Bode-Diagramm","series":[]}\n```';
    const beam = `\`\`\`${BEAM_LANG}\n{}\n\`\`\``;
    const out = dropDuplicateBeamCharts(`${beam}\n${qChart}\n${bode}`);
    expect(out).not.toContain("Querkraftverlauf");
    expect(out).toContain("Bode-Diagramm");
    // Sans schéma calculé, on ne touche à rien.
    expect(dropDuplicateBeamCharts(qChart)).toBe(qChart);
  });
});
