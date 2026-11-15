import { describe, expect, test } from "bun:test";
import { ORBITALS, orbitalDensity, sampleOrbital } from "../src/web/lib/orbitals";
import { descend, surfaceGradient } from "../src/web/lib/explorer-more";

/**
 * Les nuages de l'atome sont tirés des fonctions d'onde de type hydrogène
 * (|ψ|²), pas dessinés à la main : on vérifie ici leurs propriétés connues.
 */
const radii = (p: Float32Array) => Array.from({ length: p.length / 3 }, (_, i) => Math.hypot(p[3 * i], p[3 * i + 1], p[3 * i + 2]));

describe("orbitales de type hydrogène", () => {
  test("carbone : 1s, 2s et deux orbitales 2p", () => {
    expect(ORBITALS.map((o) => o.kind)).toEqual(["1s", "2s", "2px", "2pz"]);
  });

  test("1s : le rayon moyen vaut 1,5 a", () => {
    const r = radii(sampleOrbital("1s", 6000, 1, 6, 7));
    expect(r.reduce((a, b) => a + b, 0) / r.length).toBeGreaterThan(1.42);
    expect(r.reduce((a, b) => a + b, 0) / r.length).toBeLessThan(1.58);
  });

  test("2s : un nœud radial à r = 2 a, et de la densité de part et d'autre", () => {
    expect(orbitalDensity("2s", 2, 0, 0)).toBe(0);
    expect(orbitalDensity("2s", 0.5, 0, 0)).toBeGreaterThan(0);
    expect(orbitalDensity("2s", 4, 0, 0)).toBeGreaterThan(0);
    const r = radii(sampleOrbital("2s", 6000, 1, 12, 3));
    // Presque aucun point dans la coquille du nœud.
    expect(r.filter((x) => Math.abs(x - 2) < 0.1).length / r.length).toBeLessThan(0.004);
  });

  test("2p : deux lobes le long de son axe, un plan nodal entre eux", () => {
    expect(orbitalDensity("2px", 0, 1.5, 1)).toBe(0);
    const p = sampleOrbital("2px", 6000, 1, 12, 5);
    let near = 0;
    let [left, right] = [0, 0];
    for (let i = 0; i < p.length; i += 3) {
      const r = Math.hypot(p[i], p[i + 1], p[i + 2]);
      if (Math.abs(p[i]) / r < 0.1) near += 1;
      if (p[i] < 0) left += 1;
      else right += 1;
    }
    expect(near / 6000).toBeLessThan(0.006);
    expect(Math.abs(left - right) / 6000).toBeLessThan(0.06);
  });

  test("même graine → même nuage ; les points restent dans la sphère demandée", () => {
    expect([...sampleOrbital("2pz", 300, 0.3, 8, 11)]).toEqual([...sampleOrbital("2pz", 300, 0.3, 8, 11)]);
    for (const r of radii(sampleOrbital("2pz", 300, 0.3, 8, 11))) expect(r).toBeLessThanOrEqual(0.3 * 8 + 1e-6);
  });
});

describe("surface : les billes suivent la plus grande pente", () => {
  test("le gradient de sin x + cos y est (cos x, −sin y)", () => {
    expect(surfaceGradient(0, Math.PI / 2)).toEqual([1, -1]);
    const [gx, gy] = surfaceGradient(Math.PI / 2, 0);
    expect(Math.abs(gx)).toBeLessThan(1e-12);
    expect(Math.abs(gy)).toBeLessThan(1e-12);
  });

  test("un pas de descente fait toujours baisser la hauteur ; la descente mène au minimum (−π/2, ±π)", () => {
    let [x, y] = [0.4, 1.2];
    for (let i = 0; i < 400; i++) {
      const before = Math.sin(x) + Math.cos(y);
      [x, y] = descend(x, y, 0.05);
      expect(Math.sin(x) + Math.cos(y)).toBeLessThanOrEqual(before + 1e-12);
    }
    expect(x).toBeCloseTo(-Math.PI / 2, 2);
    expect(Math.abs(y)).toBeCloseTo(Math.PI, 2);
  });
});
