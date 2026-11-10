import { describe, expect, test } from "bun:test";
import { addFigureDescriptions, figurePages, lastTaskBefore } from "../src/api/lib/extract";

/**
 * Les schémas d'un PDF ne sont pas dans sa couche texte. L'import repère les
 * pages qui en portent et y ajoute la description de la vision (lignes
 * « [Abbildung …] »). Ici : le repérage et l'insertion, sans appel au modèle.
 */
describe("figurePages — quelles pages portent un schéma", () => {
  test("le décor répété (logo sur chaque page) ne compte pas", () => {
    // Chiffres relevés sur « Uebungsaufgaben Elektrotechnik V3 » (pages 1–6) + une page de logo seul.
    const stats = [
      { images: 2, paths: 196 },
      { images: 1, paths: 145 },
      { images: 2, paths: 184 },
      { images: 1, paths: 124 },
      { images: 0, paths: 191 },
      { images: 0, paths: 212 },
    ];
    expect(figurePages(stats)).toEqual([0, 1, 2, 3]);

    const logoEverywhere = stats.map((s) => ({ ...s, images: s.images + 1 }));
    expect(figurePages(logoEverywhere)).toEqual([0, 1, 2, 3]);
  });

  test("un schéma vectoriel : deux fois plus de tracés que la page médiane", () => {
    const stats = [
      { images: 0, paths: 180 },
      { images: 0, paths: 190 },
      { images: 0, paths: 414 },
      { images: 0, paths: 175 },
    ];
    expect(figurePages(stats)).toEqual([2]);
  });

  test("plafonné (coût de la vision)", () => {
    const stats = Array.from({ length: 50 }, (_, i) => ({ images: i % 2, paths: 10 }));
    expect(figurePages(stats, 5)).toHaveLength(5);
    expect(figurePages([])).toEqual([]);
  });
});

describe("addFigureDescriptions — chaque description à sa page", () => {
  const TEXT = "[[SEITE 1]]\nAufgabe 4\na) …\n\n[[SEITE 2]]\nAufgabe 5\ne) Gegeben ist folgende Schaltung.\n\n[[SEITE 3]]\nf) Gegeben ist die folgende Schaltung.";

  test("insère à la fin de la bonne page et passe l'Aufgabe en cours", async () => {
    const calls: [number, string | null][] = [];
    const out = await addFigureDescriptions(TEXT, [1, 2], async (i, aufgabe) => {
      calls.push([i, aufgabe]);
      return i === 1
        ? "[Abbildung — zu Aufgabe 5 e) — R1 = 20 Ω]"
        : "Hier ist die Beschreibung:\n[Abbildung — zu Aufgabe 5 f) — R1 = 100 Ω, R2 = 400 Ω]";
    });
    // La page 3 commence au milieu de l'Aufgabe 5 : la vision le sait.
    expect(calls.sort()).toEqual([
      [1, "4"],
      [2, "5"],
    ]);
    const pages = out.split(/(?=\[\[SEITE \d+\]\])/);
    expect(pages[0]).not.toContain("[Abbildung");
    expect(pages[1]).toContain("e) Gegeben ist folgende Schaltung.\n\n[Abbildung — zu Aufgabe 5 e) — R1 = 20 Ω]");
    // Seules les lignes « [Abbildung …] » entrent ; le bavardage du modèle, non.
    expect(pages[2]).toContain("[Abbildung — zu Aufgabe 5 f) — R1 = 100 Ω, R2 = 400 Ω]");
    expect(out).not.toContain("Hier ist die Beschreibung");
  });

  test("une vision en panne ne bloque pas l'import", async () => {
    const out = await addFigureDescriptions(TEXT, [0, 1], async () => {
      throw new Error("503");
    });
    expect(out).toBe(TEXT);
  });

  test("lastTaskBefore", () => {
    expect(lastTaskBefore("Aufgabe 1\nAufgabe 12\nb) …")).toBe("12");
    expect(lastTaskBefore("Exercise 3.2\n…")).toBe("3.2");
    expect(lastTaskBefore("Einleitung")).toBeNull();
  });
});
