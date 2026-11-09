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

import {
  chosenKey,
  moveFencedToPageTop,
  parseChoiceLine,
  splitChoices,
  tafelPage,
  writingChunks,
} from "../src/web/lib/tafel";

describe("tafelPage — toute la réponse au tableau, dans l'ordre", () => {
  test("voix et feuilles gardent l'ordre d'écriture", () => {
    const page = tafelPage(ANSWER);
    expect(page.map((b) => (b.kind === "step" ? b.label : "voix"))).toEqual(["voix", "Beobachtung", "Physik", "voix"]);
    expect(page[0]).toEqual({ kind: "voice", body: "Schau zuerst auf den Knoten K." });
    expect(page[3]).toEqual({ kind: "voice", body: "Welche Richtung wählst du für I₃?" });
  });

  test("RUNDE 1 : la question d'examen est une feuille du tableau", () => {
    const exam = [
      '[[TAFEL schritt="Runde 1 — Netzwerk DC"]]',
      "Bestimme den Strom $I_1$ im Netzwerk.",
      "",
      "A) 1 A",
      "B) 3 A",
      "C) 6 A",
      "[[/TAFEL]]",
    ].join("\n");
    const page = tafelPage(exam);
    expect(page).toHaveLength(1);
    const sheet = page[0];
    expect(sheet.kind === "step" && sheet.label).toBe("Runde 1 — Netzwerk DC");
    expect(sheet.kind === "step" && sheet.complete).toBe(true);
    expect(sheet.body).toContain("A) 1 A");
  });

  test("réponse sans aucune balise : rien n'est perdu, tout est au tableau", () => {
    expect(tafelPage("Ein Newton ist kg·m/s².")).toEqual([{ kind: "voice", body: "Ein Newton ist kg·m/s²." }]);
  });

  test("[[REASONING]] dans un [[TAFEL]] : chaque @@STEP reste une feuille", () => {
    const page = tafelPage('[[TAFEL schritt="Lösung"]]Los.\n[[REASONING]]\n@@STEP: Physik\nΣF = 0\n@@STEP: Ergebnis\nF = 2 N\n[[/REASONING]][[/TAFEL]]');
    expect(page.map((b) => b.kind === "step" && b.label)).toEqual(["Lösung", "Physik", "Ergebnis"]);
    expect(page.every((b) => b.kind === "step" && b.complete)).toBe(true);
  });

  test("streaming : feuille ouverte en cours, marqueur coupé masqué", () => {
    const page = tafelPage('Gut gemacht!\n[[TAFEL schritt="Frage 2"]]Welche Einheit hat $P$? [[/TAF');
    expect(page).toEqual([
      { kind: "voice", body: "Gut gemacht!" },
      { kind: "step", label: "Frage 2", body: "Welche Einheit hat $P$?", complete: false },
    ]);
    // Feuille tout juste ouverte : elle apparaît déjà, vide, « en cours ».
    expect(tafelPage('[[TAFEL schritt="Hinweis 1"]]')).toEqual([
      { kind: "step", label: "Hinweis 1", body: "", complete: false },
    ]);
    for (const cut of ["[[", "[[RE", "[[TAFE", '[[TAFEL schritt="Fr']) {
      expect(tafelPage(`Okay.\n${cut}`)).toEqual([{ kind: "voice", body: "Okay." }]);
    }
  });
});

describe("moveFencedToPageTop", () => {
  test("le schéma de poutre calculé passe en tête du tableau", () => {
    const page = tafelPage(
      'Ich rechne mit dem Löser.\n\n```balkendiagramm\n{"v":1}\n```\n\n[[REASONING]]\n@@STEP: Physik\nΣM = 0\n[[/REASONING]]',
    );
    const out = moveFencedToPageTop(page, "balkendiagramm", "Skizze");
    expect(out.map((b) => (b.kind === "step" ? b.label : "voix"))).toEqual(["Skizze", "voix", "Physik"]);
    expect(out[0].body).toContain('{"v":1}');
    expect(out[1]).toEqual({ kind: "voice", body: "Ich rechne mit dem Löser." });
  });

  test("sans bloc : inchangé", () => {
    const page = tafelPage("Hallo");
    expect(moveFencedToPageTop(page, "balkendiagramm", "Skizze")).toBe(page);
  });
});

describe("writingChunks — le texte apparaît paragraphe par paragraphe", () => {
  test("coupe aux lignes vides", () => {
    expect(writingChunks("Erst.\n\nDann.\nNoch.\n\n\nZuletzt.")).toEqual(["Erst.", "Dann.\nNoch.", "Zuletzt."]);
  });

  test("ne coupe jamais un bloc de code, une formule ou une suite de liste", () => {
    const code = "```python\nx = 1\n\ny = 2\n```";
    const math = "$$\na = b\n\nc = d\n$$";
    const list = "1. Erstens\n\n    mit Fortsetzung\n2. Zweitens";
    expect(writingChunks(`Vorher.\n\n${code}\n\nNachher.`)).toEqual(["Vorher.", code, "Nachher."]);
    expect(writingChunks(math)).toEqual([math]);
    expect(writingChunks(list)).toEqual([list]);
  });

  test("bloc de code encore ouvert (streaming) : il reste entier", () => {
    expect(writingChunks("Text.\n\n```svg\n<svg>\n\n<path")).toEqual(["Text.", "```svg\n<svg>\n\n<path"]);
  });
});

describe("Choix multiple : les options A), B), C) deviennent des boutons", () => {
  test("formes reconnues", () => {
    expect(parseChoiceLine("A) 2 V")).toEqual({ key: "A", text: "2 V" });
    expect(parseChoiceLine("**B)** 4 V")).toEqual({ key: "B", text: "4 V" });
    expect(parseChoiceLine("**C) 6 V**")).toEqual({ key: "C", text: "6 V" });
    expect(parseChoiceLine("- (d) $I = 0$")).toEqual({ key: "D", text: "$I = 0$" });
    expect(parseChoiceLine("Also) nichts")).toBeNull();
    expect(parseChoiceLine("A)")).toBeNull();
  });

  test("question puis options, lignes vides permises", () => {
    const parts = splitChoices("**Frage 1:** Wie groß ist $I_1$?\n\nA) 1 A\n\nB) 3 A\nC) 6 A\n\nDenk an $R_2 \\parallel R_3$.");
    expect(parts).toEqual([
      { kind: "md", text: "**Frage 1:** Wie groß ist $I_1$?" },
      { kind: "choices", options: [
        { key: "A", text: "1 A" },
        { key: "B", text: "3 A" },
        { key: "C", text: "6 A" },
      ] },
      { kind: "md", text: "Denk an $R_2 \\parallel R_3$." },
    ]);
  });

  test("pas de faux positif : une seule option, désordre, ou bloc de code", () => {
    expect(splitChoices("A) nur eine")).toEqual([{ kind: "md", text: "A) nur eine" }]);
    expect(splitChoices("B) zwei\nC) drei")).toEqual([{ kind: "md", text: "B) zwei\nC) drei" }]);
    expect(splitChoices("A) eins\nC) drei")).toEqual([{ kind: "md", text: "A) eins\nC) drei" }]);
    const code = "```\nA) x\nB) y\n```";
    expect(splitChoices(code)).toEqual([{ kind: "md", text: code }]);
  });

  test("le choix de l'étudiant se lit dans sa réponse suivante", () => {
    expect(chosenKey("B) 3 A")).toBe("B");
    expect(chosenKey("c")).toBe("C");
    expect(chosenKey("Bei mir kommt 3 A raus")).toBeNull();
    expect(chosenKey(undefined)).toBeNull();
  });
});
