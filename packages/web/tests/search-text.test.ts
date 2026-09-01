/**
 * Tests du repliement et des extraits de recherche.
 *
 *   bun test
 *
 * Ce module est volontairement pur — aucune base, aucun réseau — pour que ces
 * tests tournent en une fraction de seconde et puissent bloquer un déploiement.
 */

import { describe, expect, test } from "bun:test";
import {
  escapeLike,
  fold,
  foldWithMap,
  likeVariants,
  matches,
  scoreHit,
  snippet,
} from "../src/api/lib/search-text";

describe("fold", () => {
  test("les trémas allemands se déplient", () => {
    expect(fold("Übung")).toBe("uebung");
    expect(fold("übung")).toBe("uebung");
    expect(fold("Uebung")).toBe("uebung");
    expect(fold("ÜBUNG")).toBe("uebung");
  });

  test("le ß devient ss", () => {
    expect(fold("Fußpunkt")).toBe("fusspunkt");
    expect(fold("Fusspunkt")).toBe("fusspunkt");
  });

  test("les accents français disparaissent", () => {
    expect(fold("Élément")).toBe("element");
    expect(fold("élément")).toBe("element");
  });

  test("un texte déjà simple n'est pas abîmé", () => {
    expect(fold("Biegemoment 3")).toBe("biegemoment 3");
  });
});

describe("foldWithMap", () => {
  test("la table renvoie vers les bonnes lettres d'origine", () => {
    const { folded, map } = foldWithMap("Übung");
    expect(folded).toBe("uebung");
    // « u » et « e » viennent tous deux du seul caractère « Ü », en position 0.
    expect(map[0]).toBe(0);
    expect(map[1]).toBe(0);
    expect(map[2]).toBe(1); // « b »
    expect(map.length).toBe(folded.length);
  });

  test("la table a toujours la longueur du texte replié", () => {
    for (const s of ["", "abc", "Straße", "Öl", "école", "aä ö ü"]) {
      const { folded, map } = foldWithMap(s);
      expect(map.length).toBe(folded.length);
    }
  });
});

describe("matches", () => {
  test("trouve malgré la casse et les trémas", () => {
    expect(matches("Kapitel 4: Übungsaufgaben", "übung")).toBe(true);
    expect(matches("Kapitel 4: Übungsaufgaben", "UEBUNG")).toBe(true);
    expect(matches("Kapitel 4: Übungsaufgaben", "uebungsaufgaben")).toBe(true);
  });

  test("ne trouve pas ce qui n'y est pas", () => {
    expect(matches("Biegemoment", "torsion")).toBe(false);
  });

  test("une recherche vide ne trouve rien", () => {
    expect(matches("Biegemoment", "")).toBe(false);
    expect(matches("Biegemoment", "   ")).toBe(false);
  });
});

describe("snippet", () => {
  const text =
    "Das Biegemoment ist die wichtigste Schnittgröße im Balken. " +
    "Für die Übungsaufgabe 3 berechnen wir zunächst die Auflagerkräfte, " +
    "danach das maximale Biegemoment in Feldmitte.";

  test("renvoie null si le mot est absent", () => {
    expect(snippet(text, "Torsion")).toBeNull();
  });

  test("l'extrait contient bien le mot cherché", () => {
    const s = snippet(text, "übungsaufgabe");
    expect(s).not.toBeNull();
    expect(fold(s!.text)).toContain("uebungsaufgabe");
  });

  test("les positions de surlignage désignent le bon morceau", () => {
    const s = snippet(text, "auflagerkräfte");
    expect(s).not.toBeNull();
    const highlighted = s!.text.slice(s!.start, s!.end);
    expect(fold(highlighted)).toBe("auflagerkraefte");
  });

  test("le surlignage reste juste quand le mot contient un tréma", () => {
    const s = snippet("Der Wert von Schnittgröße Q ist null.", "größe");
    expect(s).not.toBeNull();
    expect(fold(s!.text.slice(s!.start, s!.end))).toBe("groesse");
  });

  test("un texte court n'est pas décoré d'ellipses", () => {
    const s = snippet("Biegemoment", "biege");
    expect(s!.text).toBe("Biegemoment");
    expect(s!.start).toBe(0);
    expect(s!.end).toBe(5);
  });

  test("un texte long est coupé des deux côtés", () => {
    const long = "a".repeat(500) + " Biegemoment " + "b".repeat(500);
    const s = snippet(long, "biegemoment");
    expect(s!.text.startsWith("…")).toBe(true);
    expect(s!.text.endsWith("…")).toBe(true);
    expect(s!.text.length).toBeLessThan(250);
  });
});

describe("escapeLike", () => {
  test("les jokers SQL tapés par l'utilisateur restent littéraux", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("a_b")).toBe("a\\_b");
    expect(escapeLike("c:\\dev")).toBe("c:\\\\dev");
  });

  test("un texte ordinaire n'est pas modifié", () => {
    expect(escapeLike("Biegemoment")).toBe("Biegemoment");
  });
});

describe("likeVariants", () => {
  test("couvre les orthographes courantes, sans doublon", () => {
    const v = likeVariants("Übung");
    expect(v).toContain("Übung");
    expect(v).toContain("übung");
    expect(v).toContain("ÜBUNG");
    expect(new Set(v).size).toBe(v.length);
  });

  test("un mot déjà en minuscules ne produit pas quatre fois la même chose", () => {
    expect(likeVariants("abc").length).toBeLessThan(4);
  });

  test("une recherche vide ne produit aucune variante", () => {
    expect(likeVariants("   ")).toEqual([]);
  });
});

describe("scoreHit", () => {
  test("un titre exact bat un titre partiel, qui bat un corps de texte", () => {
    const exact = scoreHit({ title: true, exactTitle: true, body: false, ageDays: 0 });
    const partial = scoreHit({ title: true, exactTitle: false, body: false, ageDays: 0 });
    const body = scoreHit({ title: false, exactTitle: false, body: true, ageDays: 0 });
    expect(exact).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(body);
  });

  test("la fraîcheur départage mais ne renverse jamais un titre", () => {
    const vieuxTitre = scoreHit({ title: true, exactTitle: false, body: false, ageDays: 3650 });
    const corpsNeuf = scoreHit({ title: false, exactTitle: false, body: true, ageDays: 0 });
    expect(vieuxTitre).toBeGreaterThan(corpsNeuf);
  });

  test("à pertinence égale, le plus récent passe devant", () => {
    const neuf = scoreHit({ title: true, exactTitle: false, body: false, ageDays: 1 });
    const vieux = scoreHit({ title: true, exactTitle: false, body: false, ageDays: 90 });
    expect(neuf).toBeGreaterThan(vieux);
  });
});
