import { describe, expect, test } from "bun:test";
import { buildTutorAgent } from "../src/api/agent/index";

/**
 * Le tuteur n'a pas le droit de nier les documents de l'étudiant.
 *
 * ── L'incident ────────────────────────────────────────────────────────────
 *
 * Le 3 septembre 2026, avec neuf documents affichés à l'écran, le tuteur a
 * répondu : « Je ne peux pas voir les fichiers des conversations précédentes.
 * Chaque nouvelle conversation démarre à zéro pour moi. » C'était faux : le
 * serveur lui avait bien passé neuf documents et 24 000 caractères.
 *
 * Deux causes, l'une dans le prompt, l'autre dans ce qu'on lui donnait :
 *
 *   1. Rien ne lui disait que ces documents APPARTIENNENT à l'étudiant et
 *      survivent d'une conversation à l'autre. Il a raisonné depuis son idée
 *      générale de modèle de langage plutôt que depuis ses entrées.
 *
 *   2. `sources` ne contient que les extraits retenus pour la question posée —
 *      cinq documents sur neuf, parfois. Il ne pouvait donc pas savoir que les
 *      autres existaient.
 *
 * ── Ce que ces tests garantissent, et ce qu'ils ne garantissent pas ───────
 *
 * `buildTutorAgent` est une fonction pure : elle assemble un texte. Ces tests
 * vérifient ce que ce texte DIT — ils ne peuvent pas vérifier ce que le modèle
 * en fera. C'est une garantie sur le contrat, pas sur l'obéissance.
 *
 * Elle vaut quand même : la panne du 3 septembre venait du contrat, pas de la
 * désobéissance. Le prompt affirmait « l'étudiant n'a rien téléversé » alors
 * qu'il avait téléversé. Aucune formulation habile ne rattrape ça.
 */

const INVENTAIRE = [
  { title: "Elektrotechnik-Vorlesung Kapitel 1.1", kind: "vorlesung", pageCount: 61 },
  { title: "Formelsammlung Elektrotechnik", kind: "vorlesung", pageCount: 4 },
  { title: "Probeklausur Elektrotechnik", kind: "klausur", pageCount: 14 },
];

const EXTRAITS = [
  { title: "Elektrotechnik-Vorlesung Kapitel 1.1", kind: "vorlesung", content: "Die Maschenregel …" },
];

/** Le prompt système, en texte brut. */
function prompt(opts: Parameters<typeof buildTutorAgent>[0]): string {
  return JSON.stringify(buildTutorAgent(opts));
}

/**
 * Les phrases par lesquelles le modèle a nié, ce jour-là.
 *
 * Elles sont testées sur le PROMPT, pas sur la réponse : aucune de ces
 * tournures ne doit être suggérée au modèle quand des documents existent.
 */
const DENIS = [
  "hat noch KEINE Kursunterlagen hochgeladen",
  "keine Kursunterlagen hochgeladen",
];

describe("des documents existent", () => {
  const p = prompt({ sources: EXTRAITS, inventory: INVENTAIRE, locale: "de" });

  test("les trois titres sont dans le prompt, pas seulement celui de l'extrait", () => {
    for (const doc of INVENTAIRE) {
      expect(p).toContain(doc.title);
    }
  });

  test("le nombre de pages accompagne chaque titre", () => {
    expect(p).toContain("61 Seiten");
    expect(p).toContain("4 Seiten");
  });

  test("le prompt dit que ces documents sont conservés d'une fois sur l'autre", () => {
    expect(p).toContain("dauerhaft");
    expect(p).toContain("JEDER Unterhaltung");
  });

  test("nier l'accès est explicitement interdit", () => {
    expect(p).toContain("VERBOTEN");
    expect(p).toContain("keine Dateien zu sehen");
  });

  test("aucune phrase du prompt n'affirme que l'étudiant n'a rien téléversé", () => {
    for (const deni of DENIS) {
      expect(p).not.toContain(deni);
    }
  });
});

describe("des documents existent mais aucun extrait n'a été retenu", () => {
  // C'est le cas exact de l'incident : la sélection ne garde que les passages
  // pertinents, et une question qui ne parle du contenu d'aucun document peut
  // n'en retenir aucun.
  const p = prompt({ sources: [], inventory: INVENTAIRE, locale: "de" });

  test("la liste complète est quand même là", () => {
    expect(p).toContain("VOLLSTÄNDIGE LISTE (3)");
    for (const doc of INVENTAIRE) {
      expect(p).toContain(doc.title);
    }
  });

  test("le prompt ne bascule pas sur « rien téléversé »", () => {
    for (const deni of DENIS) {
      expect(p).not.toContain(deni);
    }
  });

  test("il apprend à dire « pas dans ces passages », pas « ça n'existe pas »", () => {
    expect(p).toContain("die ich für diese Frage vor mir habe");
    expect(p).toContain("NIEMALS");
  });
});

describe("la portée est réellement vide", () => {
  // Un semestre sans document, par exemple. Le tuteur doit aider quand même,
  // et surtout ne pas conclure que l'étudiant n'a jamais rien déposé.
  const p = prompt({ sources: [], inventory: [], locale: "de" });

  test("il parle de CETTE sélection, pas du compte entier", () => {
    expect(p).toContain("In DIESER Auswahl");
    expect(p).toContain("Das heißt NICHT");
  });

  test("il propose de changer de portée", () => {
    expect(p).toContain("Semester");
    expect(p).toContain("Alle Materialien");
  });

  test("nier l'accès aux conversations précédentes reste interdit", () => {
    expect(p).toContain("frühere Unterhaltungen");
    expect(p).toContain("NIE");
  });

  test("il répond quand même à la question", () => {
    expect(p).toContain("verweigere die Antwort");
  });
});

describe("l'inventaire ne casse rien quand il est absent", () => {
  // Rétrocompatibilité : `inventory` est optionnel. Un appelant qui ne le
  // passe pas doit continuer de fonctionner avec ses seuls extraits.
  test("des extraits sans inventaire suffisent encore", () => {
    const p = prompt({ sources: EXTRAITS, locale: "de" });
    expect(p).toContain(EXTRAITS[0].title);
    for (const deni of DENIS) {
      expect(p).not.toContain(deni);
    }
  });
});
