import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { TAP_MAX_TRAVEL, travelTracker } from "../src/web/lib/tap-guard";

describe("clic ou glissé", () => {
  test("un appui sans mouvement est un clic", () => {
    const t = travelTracker();
    t.down(100, 100);
    t.move(101, 100);
    t.up();
    expect(t.dragged()).toBe(false);
  });

  test("un glissé qui REVIENT à son point de départ reste un glissé", () => {
    const t = travelTracker();
    t.down(100, 100);
    for (let i = 1; i <= 40; i++) t.move(100 + Math.sin((i / 40) * Math.PI * 2) * 90, 100);
    t.move(100, 100);
    t.up();
    expect(t.dragged()).toBe(true);
  });

  test("le geste suivant repart de zéro ; un mouvement sans appui ne compte pas", () => {
    const t = travelTracker();
    t.down(0, 0);
    t.move(50, 0);
    t.up();
    t.move(500, 500);
    expect(t.dragged()).toBe(true);
    t.down(10, 10);
    t.up();
    expect(t.dragged()).toBe(false);
    expect(TAP_MAX_TRAVEL).toBeLessThanOrEqual(10);
  });

  test("les deux endroits qui choisissent une pièce au clic s'en servent", () => {
    const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
    expect(read("../src/web/components/explorer-kit.tsx")).toContain("if (e.delta > 6 || draggedSinceDown()) return;");
    expect(read("../src/web/components/explorer-scenes.tsx")).toContain("if (e.delta > 6 || draggedSinceDown()) return;");
  });
});
