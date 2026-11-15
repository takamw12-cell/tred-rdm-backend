import { describe, expect, test } from "bun:test";
import { answer, BOARD, buildRounds, medalFor, multiplier, pointsFor, ROUND_COUNT, START, zoneAt, zoneCentre, ZONES } from "../src/web/lib/minigame";
import { EXPLORER_MODELS } from "../src/web/lib/explorer-models";

/** Mini-jeu « Triebwerk-Check » (2026-11-15) : les règles, sans le pinceau. */

const ids = ZONES.map((z) => z.id);

describe("la planche : six zones, celles de l'Explorateur", () => {
  test("mêmes pièces, même numérotation que les repères du modèle 3D", () => {
    expect(ids).toEqual(EXPLORER_MODELS.turbofan.hotspots.map((h) => h.id));
    expect(ZONES.map((z) => z.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test("toucher le centre d'une zone la trouve — elle, et pas sa voisine", () => {
    for (const z of ZONES) expect(zoneAt(...zoneCentre(z))?.id).toBe(z.id);
  });

  test("le flux secondaire se touche au-dessus ET en dessous du cœur", () => {
    expect(zoneAt(380, 150)?.id).toBe("bypass");
    expect(zoneAt(380, 450)?.id).toBe("bypass");
  });

  test("hors du moteur, ou entre deux zones : rien", () => {
    expect(zoneAt(20, 20)).toBeNull();
    expect(zoneAt(370, 300)).toBeNull();
    expect(zoneAt(BOARD.width + 10, 300)).toBeNull();
  });

  test("tout tient dans la planche, et chaque zone offre au moins 80 × 60 à toucher (≈ 39 × 29 px sur un téléphone de 390 px)", () => {
    for (const z of ZONES) {
      for (const s of z.shapes) {
        const xs = s.filter((_, i) => i % 2 === 0);
        const ys = s.filter((_, i) => i % 2 === 1);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...xs)).toBeLessThanOrEqual(BOARD.width);
        expect(Math.max(...ys)).toBeLessThanOrEqual(BOARD.height);
        expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(80);
        expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThanOrEqual(60);
      }
    }
  });
});

describe("les manches", () => {
  const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

  test("huit questions ; les six pièces passent toutes avant qu'une revienne", () => {
    for (let s = 1; s <= 40; s++) {
      const rounds = buildRounds(ids, ROUND_COUNT, seeded(s));
      expect(rounds).toHaveLength(8);
      expect(new Set(rounds.slice(0, 6)).size).toBe(6);
    }
  });

  test("jamais la même pièce deux fois de suite", () => {
    for (let s = 1; s <= 200; s++) {
      const rounds = buildRounds(ids, 18, seeded(s));
      for (let i = 1; i < rounds.length; i++) expect(rounds[i]).not.toBe(rounds[i - 1]);
    }
  });

  test("l'ordre change d'une partie à l'autre", () => {
    expect(new Set(Array.from({ length: 20 }, (_, s) => buildRounds(ids, 6, seeded(s + 1)).join())).size).toBeGreaterThan(5);
  });
});

describe("les points", () => {
  test("faux : 0 ; juste : 100 plus la rapidité (150 en moins d'une seconde, 100 après 8 s)", () => {
    expect(pointsFor(false, 500, 0)).toBe(0);
    expect(pointsFor(true, 600, 1)).toBe(150);
    expect(pointsFor(true, 4500, 1)).toBe(125);
    expect(pointsFor(true, 30000, 1)).toBe(100);
  });

  test("la série multiplie : ×1,5 à trois de suite, ×2 à cinq", () => {
    expect([1, 2, 3, 4, 5, 9].map(multiplier)).toEqual([1, 1, 1.5, 1.5, 2, 2]);
    expect(pointsFor(true, 30000, 3)).toBe(150);
    expect(pointsFor(true, 30000, 5)).toBe(200);
  });

  test("une partie : la série se compte, une erreur la remet à zéro", () => {
    let s = START;
    for (const ok of [true, true, true, false, true]) s = answer(s, ok, 30000);
    expect(s).toEqual({ round: 5, score: 100 + 100 + 150 + 0 + 100, streak: 1, correct: 4 });
    expect(START).toEqual({ round: 0, score: 0, streak: 0, correct: 0 });
  });

  test("médaille : or sans faute, argent dès 6 sur 8, bronze dès 4, sinon « revois le modèle »", () => {
    expect([8, 7, 6, 5, 4, 3, 0].map((c) => medalFor(c, 8))).toEqual(["gold", "silver", "silver", "bronze", "bronze", "retry", "retry"]);
    expect(medalFor(0, 0)).toBe("retry");
  });
});
