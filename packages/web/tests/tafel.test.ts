import { describe, expect, test } from "bun:test";
import { isFinalStep, splitTafel } from "../src/web/lib/tafel";

const ANSWER = [
  "Schau zuerst auf den Knoten K.",
  '[[TAFEL schritt="Beobachtung"]]Zwei Maschen, ein Knoten.[[/TAFEL]]',
  '[[TAFEL schritt="Physik"]]$\\sum I = 0$[[/TAFEL]]',
  "Welche Richtung wählst du für I₃?",
].join("\n");

describe("splitTafel", () => {
  test("deux voix : étapes au tableau, commentaire au Professeur", () => {
    const { steps, commentary } = splitTafel(ANSWER);
    expect(steps.map((s) => s.label)).toEqual(["Beobachtung", "Physik"]);
    expect(steps[1].body).toBe("$\\sum I = 0$");
    expect(steps.every((s) => s.complete)).toBe(true);
    expect(commentary).toBe("Schau zuerst auf den Knoten K.\n\n\nWelche Richtung wählst du für I₃?".replace(/\n{3,}/g, "\n\n"));
    expect(commentary).not.toContain("TAFEL");
  });

  test("réponse sans bloc : rien au tableau, tout au Professeur", () => {
    const { steps, commentary } = splitTafel("Ein Newton ist kg·m/s².");
    expect(steps).toEqual([]);
    expect(commentary).toBe("Ein Newton ist kg·m/s².");
  });

  test("streaming : bloc ouvert = étape en cours d'écriture", () => {
    const partial = 'Los geht\'s.\n[[TAFEL schritt="Gleichung"]]$I_1 = I_2 +';
    const { steps, commentary } = splitTafel(partial);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ label: "Gleichung", body: "$I_1 = I_2 +", complete: false });
    expect(commentary).toBe("Los geht's.");
  });

  test("streaming : un marqueur à moitié écrit n'apparaît pas chez le Professeur", () => {
    for (const cut of ["[[", "[[TA", "[[TAFE", '[[TAFEL schritt="Phy']) {
      expect(splitTafel(`Okay.\n${cut}`).commentary).toBe("Okay.");
    }
  });

  test("libellé absent → « Schritt n » ; casse et espaces tolérés", () => {
    const { steps } = splitTafel("[[ tafel ]]a[[ / Tafel ]][[TAFEL]]b[[/TAFEL]]");
    expect(steps.map((s) => s.label)).toEqual(["Schritt 1", "Schritt 2"]);
  });

  test("carte finale reconnue", () => {
    expect(isFinalStep("Endgleichung")).toBe(true);
    expect(isFinalStep("Ergebnis")).toBe(true);
    expect(isFinalStep("Physik")).toBe(false);
  });
});

describe("splitTafel — format NIVEAU 7 ([[REASONING]] / @@STEP)", () => {
  const R = [
    "Ich schreibe die Schritte an die Tafel.",
    "[[REASONING]]",
    "@@STEP: Beobachtung",
    "Zwei Maschen.",
    "@@STEP: Endgleichung",
    "$$I_1 = \\frac{U_q}{R_1 + R_2 \\parallel R_3}$$",
    "[[/REASONING]]",
    "Was passiert, wenn R₃ → ∞?",
  ].join("\n");

  test("chaque @@STEP devient une étape, le reste va au Professeur", () => {
    const { steps, commentary } = splitTafel(R);
    expect(steps.map((s) => s.label)).toEqual(["Beobachtung", "Endgleichung"]);
    expect(steps[1].body).toContain("\\frac{U_q}");
    expect(steps.every((s) => s.complete)).toBe(true);
    expect(commentary).toBe("Ich schreibe die Schritte an die Tafel.\n\nWas passiert, wenn R₃ → ∞?");
  });

  test("streaming : dernière étape en cours, « @@STE » coupé masqué", () => {
    const partial = "Los.\n[[REASONING]]\n@@STEP: Physik\nKnotenregel\n@@STE";
    const { steps } = splitTafel(partial);
    expect(steps).toHaveLength(1);
    expect(steps[0]).toEqual({ label: "Physik", body: "Knotenregel", complete: false });
  });
});

import { moveFencedToBoard } from "../src/web/lib/tafel";

describe("moveFencedToBoard", () => {
  test("le schéma de poutre calculé passe en tête du tableau", () => {
    const split = splitTafel(
      'Ich rechne mit dem Löser.\n\n```balkendiagramm\n{"v":1}\n```\n\n[[REASONING]]\n@@STEP: Physik\nΣM = 0\n[[/REASONING]]',
    );
    const out = moveFencedToBoard(split, "balkendiagramm", "Skizze");
    expect(out.steps.map((s) => s.label)).toEqual(["Skizze", "Physik"]);
    expect(out.steps[0].body).toContain('{"v":1}');
    expect(out.commentary).toBe("Ich rechne mit dem Löser.");
  });

  test("sans bloc : inchangé", () => {
    const split = splitTafel("Hallo");
    expect(moveFencedToBoard(split, "balkendiagramm", "Skizze")).toBe(split);
  });
});
