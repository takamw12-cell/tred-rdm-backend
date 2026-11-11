import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUSY_TIMEOUT_MS, busyExpired, pausedFromStorage, shouldRotate } from "../src/web/lib/background-rotation";

const base = { now: 100_000, lastSwitch: 90_000, rotateMs: 10_000, hidden: false, paused: false, imageCount: 10 };

describe("rotation du fond — l'horloge décide", () => {
  test("change d'image quand 10 s sont passées, pas avant", () => {
    expect(shouldRotate(base)).toBe(true);
    expect(shouldRotate({ ...base, now: 99_999 })).toBe(false);
  });

  test("rattrape un minuteur suspendu : après 5 minutes en arrière-plan, le premier battement change l'image", () => {
    expect(shouldRotate({ ...base, now: base.lastSwitch + 5 * 60_000 })).toBe(true);
  });

  test("ne travaille pas quand l'onglet est masqué", () => {
    expect(shouldRotate({ ...base, hidden: true })).toBe(false);
  });

  test("respecte la pause et les filières à une seule image", () => {
    expect(shouldRotate({ ...base, paused: true })).toBe(false);
    expect(shouldRotate({ ...base, imageCount: 1 })).toBe(false);
  });
});

describe("pause du fond", () => {
  test("seulement si l'utilisateur l'a choisie sur l'appareil", () => {
    expect(pausedFromStorage("1")).toBe(true);
    expect(pausedFromStorage("0")).toBe(false);
    expect(pausedFromStorage(null)).toBe(false);
  });

  test("le réglage système « réduire les animations » ne fige plus le fond", () => {
    const src = readFileSync(join(import.meta.dir, "../src/web/components/dynamic-background.tsx"), "utf8");
    expect(src).not.toContain('matchMedia?.("(prefers-reduced-motion');
    expect(src).toContain("pausedFromStorage(localStorage.getItem(PAUSE_KEY))");
  });
});

describe("un chargement perdu ne bloque pas la rotation", () => {
  test("un fondu « en cours » expire", () => {
    expect(busyExpired(null, 1_000)).toBe(false);
    expect(busyExpired(1_000, 1_000 + BUSY_TIMEOUT_MS)).toBe(false);
    expect(busyExpired(1_000, 1_001 + BUSY_TIMEOUT_MS)).toBe(true);
  });

  test("le préchargement a un délai maximal et le retour d'app relance la vérification", () => {
    const src = readFileSync(join(import.meta.dir, "../src/web/components/dynamic-background.tsx"), "utf8");
    expect(src).toContain("PRELOAD_TIMEOUT_MS");
    for (const event of ['"visibilitychange"', '"pageshow"', '"focus"']) expect(src).toContain(event);
  });
});
