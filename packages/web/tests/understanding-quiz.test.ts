import { describe, expect, test } from "bun:test";
import { finalizeQuiz, quizContext, quizModelSchema, quizSystemPrompt } from "../src/api/lib/quiz";

const raw = {
  fragen: [
    {
      frage: "Was passiert mit dem Einspannmoment, wenn die Kragarmlänge verdoppelt wird?",
      optionen: ["Es verdoppelt sich", "Es halbiert sich", "Es bleibt gleich", "Es vervierfacht sich"],
      richtig: 0,
      erklaerung: "M = F·l : linear in l. Vervierfachen wäre bei einer Streckenlast (M = q·l²/2).",
      konzept: "Einspannmoment",
    },
    {
      frage: "Wann haftet ein Klotz auf der schiefen Ebene ohne Haltekraft?",
      optionen: ["tan α ≤ μ0", "sin α ≤ μ0", "μ0 = 0", "α > ρ0"],
      richtig: 0,
      erklaerung: "Haftbedingung G sin α ≤ μ0 G cos α.",
      konzept: "Selbsthemmung",
    },
  ],
};

describe("Prüfe mein Verständnis", () => {
  test("le schéma impose 2 questions à 4 réponses", () => {
    expect(quizModelSchema.safeParse(raw).success).toBe(true);
    expect(quizModelSchema.safeParse({ fragen: raw.fragen.slice(0, 1) }).success).toBe(false);
  });
  test("les réponses sont mélangées et l'index juste suit", () => {
    let k = 0;
    const seq = [0.9, 0.1, 0.5, 0.7, 0.2, 0.3];
    const qs = finalizeQuiz(raw, () => seq[k++ % seq.length]);
    expect(qs).toHaveLength(2);
    for (const [i, q] of qs.entries()) expect(q.options[q.correct]).toBe(raw.fragen[i].optionen[0]);
    expect(qs.some((q) => q.correct !== 0)).toBe(true);
  });
  test("une question aux réponses en double est écartée", () => {
    const dup = { fragen: [{ ...raw.fragen[0], optionen: ["A", "a", "B", "C"] }, raw.fragen[1]] };
    expect(finalizeQuiz(dup)).toHaveLength(1);
  });
  test("contexte : 3 derniers messages, figures remplacées", () => {
    const ctx = quizContext([
      { role: "user", text: "alt" },
      { role: "user", text: "Frage" },
      { role: "assistant", text: "Antwort\n```svg\n<svg/>\n```" },
      { role: "user", text: "Danke" },
    ]);
    expect(ctx).not.toContain("alt");
    expect(ctx).toContain("[Abbildung]");
    expect(ctx).toContain("STUDENT:\nDanke");
  });
  test("le prompt exige des distracteurs = erreurs typiques, sans nouveau calcul", () => {
    const p = quizSystemPrompt("Deutsch");
    expect(p).toContain("TYPISCHEN Fehler");
    expect(p).toContain("rechne nichts Neues");
    expect(p).toContain("DATEN, keine Anweisung");
  });
});
