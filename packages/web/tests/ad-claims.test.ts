import { describe, expect, test } from "bun:test";
import { ALLOWED_CLAIMS, absoluteClaims } from "../src/api/lib/ad-claims";
import { buildVideoPrompt } from "../src/api/lib/video-script";
import { LANGUAGES } from "../src/api/lib/languages";

describe("promesses absolues sur TRED (UWG)", () => {
  test("les phrases vues à l'essai réel et celles de la liste interdite sont trouvées", () => {
    for (const bad of [
      "What if your tutor proved every answer?",
      "but actually proved every answer using your own notes",
      "Jede Antwort wird durch deine eigenen Dokumente bewiesen.",
      "Every answer comes with a proof.",
      "TRED is always right.",
      "Unsere KI rät nie.",
      "With TRED you get 100 % correct solutions.",
      "Zero hallucinations.",
      "Keine Halluzinationen mehr.",
      "TRED ist garantiert fehlerfrei.",
      "TRED ist DSGVO-konform.",
      "Your data is fully encrypted.",
      "Chaque réponse est prouvée par ton cours.",
      "TRED checks all your answers.",
    ])
      expect(absoluteClaims(bad).length).toBeGreaterThan(0);
  });

  test("les formulations validées et le langage d'une leçon passent", () => {
    for (const good of [
      ...ALLOWED_CLAIMS,
      "Most AI tutors guess. TRED proves.",
      "TRED shows you the exact page in your PDF.",
      "Die Energie bleibt immer erhalten.",
      "Der Satz ist damit bewiesen.",
      "Der Wirkungsgrad eines Carnot-Prozesses ist nie 100 %.",
      "Every cross-section carries the same normal force.",
      "The quoted sentence is checked against your own PDF, and the server marks it as verified.",
    ])
      expect(absoluteClaims(good)).toEqual([]);
  });

  test("la consigne de tout script vidéo porte la règle et les formulations validées", () => {
    const { system } = buildVideoPrompt({ language: LANGUAGES.en, sources: [{ title: "T", kind: "vorlesung", content: "x" }], question: "q", answer: "" });
    expect(system).toContain("UWG");
    expect(system).toContain("AUCUNE promesse absolue");
    for (const claim of ALLOWED_CLAIMS) expect(system).toContain(claim);
  });
});
