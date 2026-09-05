import { describe, expect, test } from "bun:test";

import { chercherDansDocuments } from "../src/api/lib/document-search";
import { selectRelevantContext, type SourceDoc } from "../src/api/lib/retrieval";

/**
 * La panne de vocabulaire, et sa sortie.
 *
 * Ces tests ne mesurent pas la « qualité » de la recherche — un classement
 * lexical n'a pas de bonne réponse absolue. Ils mesurent UNE chose : le tuteur
 * peut-il atteindre un passage que la question ne nomme pas avec les mots du
 * document ?
 *
 * C'est exactement l'écart qui faisait répondre de mémoire générale sur un
 * cours pourtant présent.
 */

/** Un corpus de la forme et de la taille du sien : 9 documents, ~88 000 signes. */
function corpus(): SourceDoc[] {
  const remplissage = (sujet: string, n: number) =>
    Array.from({ length: n }, (_, i) => `${sujet} Abschnitt ${i + 1}. ` + "x".repeat(120)).join(
      "\n",
    );

  return [
    {
      title: "ET2_Skript_Kapitel3_final",
      kind: "vorlesung",
      content:
        remplissage("Gleichstrom", 40) +
        "\n\nDie Kirchhoffschen Regeln beschreiben Knoten und Maschen. " +
        "In einer geschlossenen Masche ist die Summe aller Teilspannungen null. " +
        "Die Maschenregel folgt aus der Energieerhaltung.\n\n" +
        remplissage("Netzwerke", 40),
    },
    {
      title: "TM_Uebung_Biegung",
      kind: "uebung",
      content:
        remplissage("Statik", 40) +
        "\n\nDas Biegemoment M(x) ergibt sich durch zweimalige Integration der " +
        "Streckenlast. Die Integrationskonstanten folgen aus den Randbedingungen " +
        "an der Einspannung.\n\n" +
        remplissage("Auflager", 40),
    },
    ...Array.from({ length: 7 }, (_, i) => ({
      title: `Altklausur_WS${i}`,
      kind: "klausur",
      content: remplissage("Aufgabe", 60),
    })),
  ];
}

describe("le trou que le tuteur ne pouvait pas franchir", () => {
  const docs = corpus();

  test("le corpus est bien plus gros que le budget de contexte", () => {
    const total = docs.reduce((n, d) => n + d.content.length, 0);
    // Sans cette taille, le test ne prouverait rien : en dessous du budget,
    // `selectRelevantContext` renvoie tout et il n'y a pas de sélection.
    expect(total).toBeGreaterThan(24_000);
  });

  test("BM25 sur la QUESTION rate le passage — la panne d'origine", () => {
    // L'étudiant écrit « Maschengleichung ». Le skript, lui, écrit
    // « Kirchhoffsche Regeln » et « Maschenregel ». Aucun mot commun.
    const { sources } = selectRelevantContext(docs, "erkläre mir die Maschengleichung", 24_000);
    const trouve = sources.some((s) => s.content.includes("Kirchhoffschen Regeln"));
    expect(trouve).toBe(false);
  });

  test("le tuteur, lui, cherche avec le bon mot et trouve", () => {
    // Ce que le modèle SAIT et que BM25 ignore : ces trois mots parlent de la
    // même chose. Il lui fallait seulement le droit de chercher.
    const r = chercherDansDocuments(docs, "Kirchhoffsche Regeln Masche Knoten");
    expect(r.length).toBeGreaterThan(0);
    expect(r.map((p) => p.extrait).join(" ")).toContain("Kirchhoffschen Regeln");
  });
});

describe("chercher dans un document précis", () => {
  const docs = corpus();

  test("un titre approximatif atteint le bon fichier", () => {
    // Le modèle écrira « Skript Kapitel 3 » ; le fichier s'appelle
    // « ET2_Skript_Kapitel3_final ». Une comparaison exacte ne trouverait rien.
    const r = chercherDansDocuments(docs, "Maschenregel Energieerhaltung", "Skript Kapitel 3");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].document).toBe("ET2_Skript_Kapitel3_final");
  });

  test("un titre inconnu cherche partout au lieu de ne rien rendre", () => {
    // Se rabattre sur le corpus entier donne une réponse imparfaite ; ne rien
    // rendre ferait dire au tuteur « je ne le trouve pas », ce qui est pire.
    const r = chercherDansDocuments(docs, "Biegemoment Integration", "Vorlesung 12");
    expect(r.length).toBeGreaterThan(0);
    expect(r.map((p) => p.extrait).join(" ")).toContain("Biegemoment");
  });
});

describe("ce qui ne doit pas casser", () => {
  test("un corpus vide ne jette pas", () => {
    expect(chercherDansDocuments([], "irgendwas")).toEqual([]);
  });

  test("une requête vide ne jette pas", () => {
    expect(() => chercherDansDocuments(corpus(), "")).not.toThrow();
  });

  test("la réponse reste bornée", () => {
    // Sans borne, une requête très générale renverrait tout le cours et
    // remplacerait le contexte au lieu de le compléter.
    const r = chercherDansDocuments(corpus(), "Abschnitt Aufgabe x");
    expect(r.length).toBeLessThanOrEqual(6);
    const total = r.reduce((n, p) => n + p.extrait.length, 0);
    expect(total).toBeLessThanOrEqual(12_000);
  });
});
