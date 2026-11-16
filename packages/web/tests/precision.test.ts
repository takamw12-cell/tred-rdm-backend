import { describe, expect, test } from "bun:test";
import {
  SOLVER_TOOLS,
  calcKeywords,
  detectSolverSkip,
  isScienceDomain,
  needsSolver,
  samplingTemperature,
  solverDutyNote,
} from "../src/api/lib/precision";

/**
 * Rigueur en sciences (brief fondateur du 17 nov. 2026, après un test réel où
 * le tuteur a confondu r(t) et r(φ)).
 *
 * Ce module ne fait pas obéir le modèle : il fixe ce que le serveur lui
 * demande (température, consigne de solveur pour CETTE question) et lit ce
 * qu'il a réellement produit (garde après réponse).
 */

describe("température", () => {
  test("0 en maths, physique et mécanique quand le raisonnement est coupé", () => {
    for (const domain of ["mathematik", "physik", "mechanik", "elektrotechnik", "thermodynamik"] as const) {
      expect(samplingTemperature({ domain, thinking: "off", text: "Was ist das?" })).toBe(0);
    }
  });

  test("0 aussi sans matière reconnue quand la question parle de calcul", () => {
    expect(samplingTemperature({ domain: "unbekannt", thinking: "off", text: "Was ist eine Ableitung?" })).toBe(0);
  });

  test("rien quand le raisonnement est actif : l'API Anthropic n'accepte pas d'autre température avec lui", () => {
    expect(samplingTemperature({ domain: "mathematik", thinking: "adaptive", text: "Berechne die Ableitung" })).toBeUndefined();
  });

  test("rien hors sciences : droit, langues, salutations gardent la valeur par défaut", () => {
    expect(samplingTemperature({ domain: "recht", thinking: "off", text: "Was ist ein Gutachten?" })).toBeUndefined();
    expect(samplingTemperature({ domain: "unbekannt", thinking: "off", text: "Hallo" })).toBeUndefined();
  });

  test("les matières scientifiques, et elles seules", () => {
    expect(isScienceDomain("mathematik")).toBe(true);
    expect(isScienceDomain("stroemungslehre")).toBe(true);
    expect(isScienceDomain("geschichte")).toBe(false);
    expect(isScienceDomain("unbekannt")).toBe(false);
  });
});

describe("mots-clés de calcul", () => {
  test("de, fr, en, es", () => {
    expect(calcKeywords("Wie lautet die Ableitung von r(φ)?")).toContain("Ableitung");
    expect(calcKeywords("Calcule la dérivée de r(t)")).toContain("Ableitung");
    expect(calcKeywords("intégrale de 0 à 1")).toContain("Integral");
    expect(calcKeywords("Determinante der Matrix A")).toEqual(expect.arrayContaining(["Matrix", "Determinante"]));
    expect(calcKeywords("the bending moment at B")).toContain("Moment");
    expect(calcKeywords("Welche Kraft wirkt im Lager?")).toContain("Kraft");
    expect(calcKeywords("la fuerza resultante")).toContain("Kraft");
  });

  test("pas de faux positif sur un mot qui contient le mot-clé", () => {
    expect(calcKeywords("Im Moment habe ich keine Zeit")).toEqual([]);
    expect(calcKeywords("Kraftwerk Besichtigung morgen")).toEqual([]);
    expect(calcKeywords("Erkläre mir den Gutachtenstil")).toEqual([]);
  });

  test("un verbe de calcul, une formule ou des grandeurs suffisent aussi", () => {
    expect(needsSolver("Berechne die Auflagerkräfte")).toBe(true);
    expect(needsSolver("F = 20 kN, l = 3 m")).toBe(true);
    expect(needsSolver("Was ist ein Gutachten?")).toBe(false);
  });
});

describe("consigne du solveur pour cette question", () => {
  test("nomme le solveur de la matière et interdit de calculer dans le texte", () => {
    const note = solverDutyNote({ text: "Berechne das Moment im Lager B", domain: "mechanik" });
    expect(note).not.toBeNull();
    expect(note!).toContain("statik_berechnen");
    expect(note!).toContain("balkenstatik");
    expect(note!).toMatch(/NICHT im Text/);
  });

  test("dérivée, intégrale, matrice → mathe_berechnen, quelle que soit la matière", () => {
    expect(solverDutyNote({ text: "Ableitung von r(φ) nach t", domain: "physik" })!).toContain("mathe_berechnen");
  });

  test("question sans calcul : aucune consigne", () => {
    expect(solverDutyNote({ text: "Was ist ein Gutachten?", domain: "recht" })).toBeNull();
  });

  test("laisse passer une question de cours sans chiffre", () => {
    expect(solverDutyNote({ text: "Was ist eine Kraft?", domain: "mechanik" })!).toMatch(/rein begrifflich/);
  });
});

describe("garde : un résultat chiffré sans aucun solveur", () => {
  const calc = "Berechne die Ableitung von r(t) = 3t^2";

  test("signale un résultat écrit à la main", () => {
    const hit = detectSolverSkip({ question: calc, toolNames: [], answer: "Also gilt $\\dot r(t) = 6t$, bei t = 2 s also 12 m/s." });
    expect(hit).not.toBeNull();
    expect(hit!.label).toMatch(/sans solveur/);
    expect(hit!.excerpt.length).toBeLessThanOrEqual(240);
  });

  test("ne signale rien quand un solveur a tourné", () => {
    expect(detectSolverSkip({ question: calc, toolNames: ["suche_in_unterlagen", "mathe_berechnen"], answer: "r'(t) = 6t" })).toBeNull();
  });

  test("ne signale rien pour une question sans calcul", () => {
    expect(detectSolverSkip({ question: "Was ist ein Gutachten?", toolNames: [], answer: "Seit 2002 gilt § 1 = Regel." })).toBeNull();
  });

  test("ne signale rien pour une réponse sans résultat chiffré (question de retour, formule littérale)", () => {
    expect(
      detectSolverSkip({ question: calc, toolNames: [], answer: "Ich bin nicht sicher: Zeig mir bitte die genaue Stelle. Allgemein gilt $F = m \\cdot a$." }),
    ).toBeNull();
  });

  test("tous les solveurs de l'agent sont connus du garde", () => {
    for (const t of ["rechnen", "mathe_berechnen", "statik_berechnen", "balkenstatik", "physik_berechnen", "schaltung_berechnen", "elektro_berechnen", "thermo_berechnen"]) {
      expect(SOLVER_TOOLS.has(t)).toBe(true);
    }
    expect(SOLVER_TOOLS.has("suche_in_unterlagen")).toBe(false);
  });
});
