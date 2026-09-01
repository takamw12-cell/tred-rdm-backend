/**
 * Le regroupement des lacunes et l'affichage de l'ancienneté.
 *
 * Ce sont les deux fonctions pures de la mémoire du tuteur, et les deux
 * endroits où une erreur se voit tout de suite à l'écran : soit la même lacune
 * apparaît trois fois dans la liste, soit deux lacunes différentes fusionnent
 * et le compteur ment.
 */

import { describe, expect, test } from "bun:test";
import { ageLabel, sameGap } from "../src/api/lib/memory-text";

describe("sameGap — ce qui doit se regrouper", () => {
  test("la même phrase, à la casse près", () => {
    expect(sameGap("Verwechselt Spannung und Dehnung", "verwechselt spannung und dehnung")).toBe(true);
  });

  test("une reformulation avec les mêmes mots porteurs", () => {
    expect(
      sameGap("Verwechselt Spannung und Dehnung", "Verwechselt Spannung mit Dehnung"),
    ).toBe(true);
  });

  test("une formulation plus courte contenue dans la longue", () => {
    expect(
      sameGap(
        "Verwechselt beim Zugversuch Spannung und Dehnung",
        "verwechselt spannung und dehnung",
      ),
    ).toBe(true);
  });

  test("la ponctuation et les trémas ne séparent pas", () => {
    expect(sameGap("Größe der Querkraft falsch gedeutet", "groesse der querkraft falsch gedeutet")).toBe(true);
  });
});

describe("sameGap — ce qui doit rester distinct", () => {
  test("deux lacunes sans rapport", () => {
    expect(sameGap("Verwechselt Spannung und Dehnung", "Setzt Auflagerkräfte falsch an")).toBe(false);
  });

  test("un mot commun ne suffit pas", () => {
    expect(sameGap("Spannung falsch berechnet", "Spannungsteiler nicht verstanden")).toBe(false);
  });

  test("deux sujets voisins mais différents", () => {
    expect(
      sameGap("Verwechselt Querkraft und Biegemoment", "Verwechselt Spannung und Dehnung"),
    ).toBe(false);
  });

  test("une chaîne vide ne correspond à rien", () => {
    expect(sameGap("", "Verwechselt Spannung und Dehnung")).toBe(false);
    expect(sameGap("   ", "")).toBe(false);
  });

  test("deux mots très courts ne fusionnent pas par inclusion", () => {
    // « E-Modul » fait moins que le seuil : sans lui, toute lacune contenant
    // ces lettres serait avalée par n'importe quelle autre.
    expect(sameGap("E-Modul", "E-Modul und Streckgrenze verwechselt")).toBe(false);
  });
});

describe("ageLabel", () => {
  const now = new Date("2026-09-01T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  test("aujourd'hui", () => {
    expect(ageLabel(now, now)).toBe("heute");
  });

  test("hier", () => {
    expect(ageLabel(daysAgo(1), now)).toBe("gestern");
  });

  test("cette semaine", () => {
    expect(ageLabel(daysAgo(4), now)).toBe("vor 4 Tagen");
  });

  test("une semaine", () => {
    expect(ageLabel(daysAgo(9), now)).toBe("vor einer Woche");
  });

  test("plusieurs semaines", () => {
    expect(ageLabel(daysAgo(21), now)).toBe("vor 3 Wochen");
  });

  test("plusieurs mois", () => {
    expect(ageLabel(daysAgo(95), now)).toBe("vor 3 Monaten");
  });

  test("une date dans le futur ne produit pas de nombre négatif", () => {
    // Les horloges se désynchronisent ; « vor -1 Tagen » serait absurde.
    expect(ageLabel(new Date(now.getTime() + 86_400_000), now)).toBe("heute");
  });
});
