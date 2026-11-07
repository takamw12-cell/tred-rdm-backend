import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { confidenceFor, guessExamYear, predictTopics, tagByKeywords } from "../src/api/lib/exam-predictor";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";

const now = new Date("2026-11-07T00:00:00Z");

describe("Klausur-Prognose — fondations", () => {
  test("lissage : jamais 0 % ni 100 %, l'ordre suit la fréquence", () => {
    const exams = [
      { documentId: "a", title: "WS 2025", year: 2025, topics: ["Struktogramme", "Schleifen"] },
      { documentId: "b", title: "SS 2025", year: 2025, topics: ["Struktogramme"] },
      { documentId: "c", title: "WS 2024", year: 2024, topics: ["Struktogramme", "Rekursion"] },
    ];
    const p = predictTopics(exams, ["Struktogramme", "Schleifen", "Rekursion", "Zeiger"], now);
    expect(p[0].topic).toBe("Struktogramme");
    expect(p[0].probability).toBeGreaterThan(0.6);
    expect(p[0].probability).toBeLessThan(1);
    expect(p.at(-1)!.topic).toBe("Zeiger");
    expect(p.at(-1)!.probability).toBeGreaterThan(0);
    expect(p[0].evidence).toEqual(["WS 2025", "SS 2025", "WS 2024"]);
    expect(p[0].lastSeenYear).toBe(2025);
  });

  test("récence : un thème récent pèse plus qu'un thème ancien", () => {
    const exams = [
      { documentId: "a", title: "2025", year: 2025, topics: ["Neu"] },
      { documentId: "b", title: "2016", year: 2016, topics: ["Alt"] },
    ];
    const [first] = predictTopics(exams, ["Alt", "Neu"], now);
    expect(first.topic).toBe("Neu");
  });

  test("étiquetage par mots-clés (repli sans IA)", () => {
    const topics = [
      { topic: "Struktogramme", keywords: ["Struktogramm", "Nassi-Shneiderman"] },
      { topic: "Fachwerke", keywords: ["Fachwerk", "Ritterschnitt"] },
    ];
    expect(tagByKeywords("Aufgabe 3: Zeichnen Sie ein Nassi-Shneiderman-Diagramm", topics)).toEqual(["Struktogramme"]);
    expect(tagByKeywords("Berechnen Sie mit dem Ritterschnitt …", topics)).toEqual(["Fachwerke"]);
  });

  test("année et confiance", () => {
    expect(guessExamYear("Klausur WS 2023/24")).toBe(2023);
    expect(guessExamYear("TM1_2022.pdf")).toBe(2022);
    expect(guessExamYear("Probeklausur")).toBeUndefined();
    expect(confidenceFor(2)).toBe("low");
    expect(confidenceFor(6)).toBe("medium");
    expect(confidenceFor(10)).toBe("high");
  });

  test("câblage : route authentifiée, predict en 501, onglet traduit", () => {
    const route = readFileSync(join(import.meta.dir, "../src/api/routes/exam-predictor.ts"), "utf8");
    expect(route).toMatch(/status: authed/);
    expect(route).toMatch(/predict: authed/);
    expect(route).toContain("NOT_IMPLEMENTED");
    expect(route).toContain("visibleDocuments(uid");
    for (const pack of [de, en, fr, es]) {
      expect(pack.exercises.tabPredictions.length).toBeGreaterThan(0);
      expect(Object.keys(pack.examPrediction).sort()).toEqual(Object.keys(de.examPrediction).sort());
    }
  });
});
