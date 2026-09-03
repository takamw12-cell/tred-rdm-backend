import { describe, expect, test } from "bun:test";
import { detectDocumentDenial } from "../src/api/lib/denial-guard";

/**
 * Le garde-fou doit attraper la panne du 3 septembre — et RIEN d'autre.
 *
 * Un garde qui signale des réponses correctes finit non lu, et un garde non lu
 * ne garde rien. La moitié de ces tests sert donc à prouver qu'il se tait.
 */

/** La phrase exacte que le tuteur a produite ce jour-là. */
const PANNE =
  "Du hast recht, Rached — ich entschuldige mich! Ich kann leider in diesem " +
  "Moment keine Dateien aus früheren Gesprächen sehen. Jede neue Unterhaltung " +
  "startet für mich bei null, ich habe keinen Zugriff auf vorherige Sessions.";

describe("ce qu'il doit attraper", () => {
  test("la phrase de l'incident", () => {
    const r = detectDocumentDenial(PANNE, 9);
    expect(r).not.toBeNull();
    expect(r?.excerpt).toContain("Dateien");
  });

  test("« tu n'as rien téléversé », alors que si", () => {
    expect(
      detectDocumentDenial("Du hast noch keine Unterlagen hochgeladen.", 9),
    ).not.toBeNull();
  });

  test("le même déni en français", () => {
    expect(
      detectDocumentDenial("Désolé, je n'ai pas accès à tes documents.", 3),
    ).not.toBeNull();
  });

  test("et en anglais", () => {
    expect(
      detectDocumentDenial("Sorry, I cannot see any files in this chat.", 3),
    ).not.toBeNull();
  });

  test("« je repars de zéro »", () => {
    expect(detectDocumentDenial("Chaque session, je repars de zéro.", 2)).not.toBeNull();
  });
});

describe("ce qu'il doit laisser passer", () => {
  // Ces formulations sont DEMANDÉES par le prompt. Les signaler rendrait le
  // garde inutilisable.
  test("dire qu'une information ne figure pas dans les documents", () => {
    expect(
      detectDocumentDenial(
        "Diese Information steht nicht in deinen Unterlagen. Soll ich dir mit " +
          "meinem allgemeinen Fachwissen antworten?",
        9,
      ),
    ).toBeNull();
  });

  test("dire que le passage retenu ne contient pas la réponse", () => {
    expect(
      detectDocumentDenial(
        "In den Abschnitten, die ich für diese Frage vor mir habe, steht das nicht.",
        9,
      ),
    ).toBeNull();
  });

  test("une explication normale sur les condensateurs", () => {
    expect(
      detectDocumentDenial(
        "Ein Kondensator speichert Ladung. → Skript Kapitel 1, Seite 12.",
        9,
      ),
    ).toBeNull();
  });

  test("la même phrase est VRAIE quand il n'y a aucun document", () => {
    // Le garde ne juge pas des mots, il juge un écart avec la réalité.
    expect(detectDocumentDenial(PANNE, 0)).toBeNull();
  });

  test("une réponse vide ne déclenche rien", () => {
    expect(detectDocumentDenial("", 9)).toBeNull();
  });
});
