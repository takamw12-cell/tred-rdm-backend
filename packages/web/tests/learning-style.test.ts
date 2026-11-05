import { describe, expect, test } from "bun:test";
import { buildTutorAgent } from "../src/api/agent/index";
import { LEARNING_STYLES, isLearningStyle } from "../src/api/lib/learning-style";
import { answerToSpeech } from "../src/web/lib/speech";

/**
 * Styles d'apprentissage (VARK) et lecture à voix haute.
 *
 * Comme tutor-prompt.test.ts : on vérifie ce que le prompt DIT, pas ce que le
 * modèle en fera.
 */

const prompt = (learningStyle?: (typeof LEARNING_STYLES)[number]) =>
  JSON.stringify(buildTutorAgent({ sources: [], locale: "de", learningStyle }));

describe("learning style — prompt NIVEAU 2b", () => {
  const signature: Record<(typeof LEARNING_STYLES)[number], string> = {
    visual: "Lernstil: VISUELL",
    auditory: "Lernstil: AUDITIV",
    text: "Lernstil: TEXT",
    interactive: "Lernstil: INTERAKTIV",
    balanced: "Lernstil: AUSGEWOGEN",
  };

  for (const style of LEARNING_STYLES) {
    test(`${style} : sa règle est dans NIVEAU 2b, et elle seule`, () => {
      const p = prompt(style);
      expect(p).toContain("NIVEAU 2b");
      expect(p).toContain(signature[style]);
      for (const other of LEARNING_STYLES.filter((s) => s !== style)) {
        expect(p).not.toContain(signature[other]);
      }
    });
  }

  test("sans style transmis → interactive (défaut fondateur : une question par étape)", () => {
    expect(prompt()).toContain("Lernstil: INTERAKTIV");
    expect(prompt()).not.toContain("Lernstil: AUSGEWOGEN");
  });

  test("le style ne prime jamais sur l'exactitude ni les outils", () => {
    expect(prompt("auditory")).toContain("Der Lernstil bestimmt die FORM, nie die Richtigkeit");
  });

  test("validation des valeurs", () => {
    expect(isLearningStyle("visual")).toBe(true);
    expect(isLearningStyle("kinesthetic")).toBe(false);
    expect(isLearningStyle(undefined)).toBe(false);
  });
});

describe("answerToSpeech — ce que la voix lit", () => {
  test("retire marqueurs, code, SVG et schémas", () => {
    const raw =
      "[[AEROSTUDY]]Die Lagerkraft ist **A = 12 kN**.[[/AEROSTUDY]]\n" +
      "```svg\n<svg viewBox=\"0 0 10 10\"><circle r=\"3\"/></svg>\n```\n" +
      "```balkendiagramm\n{\"v\":1}\n```\n" +
      "Danach folgt [die Formelsammlung](https://example.org).";
    const s = answerToSpeech(raw);
    expect(s).toContain("Die Lagerkraft ist A = 12 kN.");
    expect(s).toContain("Danach folgt die Formelsammlung.");
    expect(s).not.toMatch(/\[\[|svg|viewBox|balkendiagramm|https?:|\*\*/);
  });

  test("LaTeX inline rendu prononçable, LaTeX display omis", () => {
    const s = answerToSpeech("Es gilt $M = \\frac{q L^2}{8}$.\n\n$$\\int_0^L q\\,dx$$\nFertig.");
    expect(s).toContain("M = q L² / 8");
    expect(s).not.toContain("\\int");
    expect(s).toContain("Fertig.");
  });
});
