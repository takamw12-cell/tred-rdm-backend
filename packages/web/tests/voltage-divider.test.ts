import { describe, expect, test } from "bun:test";
import { DIVIDER_LIMITS, flowSpeed, ohmsToSlider, sig3, sliderToOhms, solveDivider, withPrefix } from "../src/web/lib/voltage-divider";

describe("diviseur de tension — les lois", () => {
  test("exemple du cours : 12 V, 100 Ω et 220 Ω", () => {
    const s = solveDivider({ u: 12, r1: 100, r2: 220 });
    expect(s.i).toBeCloseTo(0.0375, 6);
    expect(s.u1).toBeCloseTo(3.75, 6);
    expect(s.u2).toBeCloseTo(8.25, 6);
    expect(s.ratio).toBeCloseTo(0.6875, 6);
  });

  test("loi des mailles et bilan de puissance, sur toute la plage", () => {
    for (const u of [1, 5, 12, 24]) {
      for (const r1 of [10, 47, 1000, 10_000]) {
        for (const r2 of [10, 330, 4700, 10_000]) {
          const s = solveDivider({ u, r1, r2 });
          expect(s.u1 + s.u2).toBeCloseTo(u, 9);
          expect(s.p1 + s.p2).toBeCloseTo(u * s.i, 9);
        }
      }
    }
  });

  test("R1 monte : U2 baisse ; R2 monte : U2 monte ; R1 = R2 : la moitié", () => {
    const base = solveDivider({ u: 10, r1: 1000, r2: 1000 });
    expect(base.u2).toBeCloseTo(5, 9);
    expect(solveDivider({ u: 10, r1: 2000, r2: 1000 }).u2).toBeLessThan(base.u2);
    expect(solveDivider({ u: 10, r1: 1000, r2: 2000 }).u2).toBeGreaterThan(base.u2);
  });

  test("une valeur hors plage ou illisible est ramenée dans la plage (jamais de division par zéro)", () => {
    const s = solveDivider({ u: 999, r1: 0, r2: Number.NaN });
    expect(s.u).toBe(DIVIDER_LIMITS.u[1]);
    expect(s.r1).toBe(DIVIDER_LIMITS.r[0]);
    expect(Number.isFinite(s.i)).toBe(true);
  });
});

describe("diviseur de tension — curseurs et affichage", () => {
  test("curseur logarithmique : bornes, aller-retour, deux chiffres significatifs", () => {
    expect(sliderToOhms(0)).toBe(10);
    expect(sliderToOhms(1)).toBe(10_000);
    expect(sliderToOhms(1 / 3)).toBe(100);
    for (const ohms of [10, 47, 220, 1000, 4700, 10_000]) expect(sliderToOhms(ohmsToSlider(ohms))).toBe(ohms);
  });

  test("préfixes et virgule décimale", () => {
    expect(withPrefix(0.0375, "A", true)).toEqual({ value: "37,5", unit: "mA" });
    expect(withPrefix(4700, "Ω", false)).toEqual({ value: "4.7", unit: "kΩ" });
    expect(withPrefix(8.25, "V", true)).toEqual({ value: "8,25", unit: "V" });
    expect(withPrefix(0.00005, "A", false)).toEqual({ value: "50", unit: "µA" });
    expect(sig3(0, true)).toBe("0");
  });

  test("plus de courant : les charges vont plus vite, et bougent toujours", () => {
    const slow = flowSpeed(solveDivider({ u: 1, r1: 10_000, r2: 10_000 }).i);
    const fast = flowSpeed(solveDivider({ u: 24, r1: 10, r2: 10 }).i);
    expect(slow).toBeGreaterThan(0);
    expect(fast).toBeGreaterThan(slow);
    expect(flowSpeed(0.01)).toBeLessThan(flowSpeed(0.1));
  });
});
