import { describe, expect, test } from "bun:test";
import { auditTrace, REACT_STEPS, reactPromptRule, reasoningKind } from "../src/api/lib/reasoning-engine";
import { buildTutorAgent } from "../src/api/agent/index";
import { SONNET } from "../src/api/lib/chat-routing";
import { runBalkenstatik } from "../src/api/lib/beam-tool";
import { tafelPage } from "../src/web/lib/tafel";

describe("reasoningKind — le titre d'une étape donne son post-it", () => {
  test("les cinq étapes, et leurs variantes", () => {
    expect(reasoningKind("Beobachtung")).toBe("beobachtung");
    expect(reasoningKind("Beobachtung (Observation)")).toBe("beobachtung");
    expect(reasoningKind("Gedanke 2")).toBe("gedanke");
    expect(reasoningKind("**Aktion**")).toBe("aktion");
    expect(reasoningKind("3. Ergebnis")).toBe("ergebnis");
    expect(reasoningKind("Reflexion — Plausibilität")).toBe("reflexion");
    expect(reasoningKind("Korrektur")).toBe("korrektur");
    expect(reasoningKind("Endgleichung")).toBe("ergebnis");
  });

  test("une feuille ordinaire n'est pas une étape ReAct", () => {
    expect(reasoningKind("Runde 1 — Netzwerk DC")).toBeNull();
    expect(reasoningKind("Rückmeldung")).toBeNull();
    expect(reasoningKind("Hinweis 1")).toBeNull();
  });
});

describe("auditTrace — la chaîne est-elle complète ?", () => {
  test("chaîne complète, terminée par une vérification", () => {
    const a = auditTrace(["Beobachtung", "Gedanke", "Aktion", "Ergebnis", "Reflexion"]);
    expect(a).toEqual({ complete: true, missing: [], corrections: 0, correctionResolved: true, endsWithReflexion: true });
  });

  test("réponse « toute faite » : il manque le raisonnement", () => {
    const a = auditTrace(["Ergebnis"]);
    expect(a.complete).toBe(false);
    expect(a.missing).toEqual(["beobachtung", "gedanke", "aktion", "reflexion"]);
    expect(a.endsWithReflexion).toBe(false);
  });

  test("un résultat posé AVANT la chaîne (réponse toute faite) est détecté", () => {
    const real = ["Ergebnis — Auflagerreaktionen & Einspannmoment", "Beobachtung", "Gedanke", "Aktion", "Ergebnis", "Reflexion", "Maximales Feldmoment", "Kontrollfrage"];
    expect(auditTrace(real).complete).toBe(false);
  });

  test("une correction doit être suivie d'un nouveau cycle", () => {
    const fixed = auditTrace(["Beobachtung", "Gedanke", "Aktion", "Ergebnis", "Reflexion", "Korrektur", "Gedanke 2", "Aktion 2", "Ergebnis 2", "Reflexion 2"]);
    expect(fixed.corrections).toBe(1);
    expect(fixed.correctionResolved).toBe(true);
    const broken = auditTrace(["Beobachtung", "Gedanke", "Aktion", "Ergebnis", "Reflexion", "Korrektur"]);
    expect(broken.correctionResolved).toBe(false);
  });
});

describe("Prompt NIVEAU 2 — la Denkspur est obligatoire", () => {
  const prompt = (
    buildTutorAgent({ sources: [], locale: "de", board: true, route: { modelId: SONNET, thinking: "off" } }) as unknown as {
      settings: { instructions: { content: string }[] };
    }
  ).settings.instructions[0].content;

  test("les cinq titres, la correction, l'honnêteté du doute", () => {
    for (const s of REACT_STEPS) expect(prompt).toContain(`@@STEP: ${s.label}`);
    expect(prompt).toContain("ERFINDE NIEMALS einen");
    expect(prompt).toContain("Die Kette endet IMMER mit einer Reflexion");
    // Test réel du 2026-11-09 : le modèle avait posé un bloc « Ergebnis » AVANT
    // sa chaîne. La règle d'ordre l'interdit, et l'audit le détecte.
    expect(prompt).toContain("Die Kette steht VOR jedem Ergebnis");
    expect(prompt).toContain("Ergebnis 2");
    // Le solveur reste la source de vérité.
    expect(prompt).toContain("Zahlen rechnet der Löser, nie du");
  });

  test("règle insérée proprement (indentation alignée, une seule source)", () => {
    expect(prompt).toContain(reactPromptRule().split("\n")[0]);
    expect(prompt).not.toContain("@@STEP: Freikörperbild");
  });
});

describe("Intégration — poutre hyperstatique : le solveur fait foi", () => {
  // Poutre encastrée en A, appui simple en B, L = 4 m, q = 10 kN/m :
  // R_A = 5qL/8 = 25 kN, R_B = 3qL/8 = 15 kN, M_A = qL²/8 = 20 kN·m.
  const r = runBalkenstatik({
    laenge: 4,
    lager: [
      { x: 0, art: "einspannung", name: "A" },
      { x: 4, art: "loslager", name: "B" },
    ],
    streckenlasten: [{ von: 0, bis: 4, q: 10000 }],
  } as Parameters<typeof runBalkenstatik>[0]);

  test("valeurs exactes du solveur (1 fois hyperstatique)", () => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.gradDerUnbestimmtheit).toBe(1);
    const byName = Object.fromEntries(
      (r.auflagerkraefte as { name: string; force: number; moment: number }[]).map((a) => [a.name, a]),
    );
    expect(byName.A.force).toBeCloseTo(25000, 0);
    expect(byName.B.force).toBeCloseTo(15000, 0);
    expect(byName.A.moment).toBeCloseTo(-20000, 0); // Einspannmoment qL²/8
    // Feldmoment max = 9qL²/128 = 11,25 kN·m bei x = 5L/8 = 2,5 m.
    expect(r.extremwerte.momentMax.y).toBeCloseTo(11250, 0);
    expect(r.extremwerte.momentMax.x).toBeCloseTo(2.5, 2);
  });

  test("la chaîne écrite au tableau donne cinq post-its, dans l'ordre", () => {
    const answer = [
      "[[REASONING]]",
      "@@STEP: Beobachtung",
      "Einspannung in A, Loslager in B, $L = 4\\,\\mathrm{m}$, $q = 10\\,\\mathrm{kN/m}$.",
      "@@STEP: Gedanke",
      "4 Unbekannte, 3 Gleichgewichtsbedingungen → 1-fach statisch unbestimmt.",
      "@@STEP: Aktion",
      "Ich rufe balkenstatik auf.",
      "@@STEP: Ergebnis",
      "$$A_y = 25\\,\\mathrm{kN},\\; B_y = 15\\,\\mathrm{kN},\\; M_A = 20\\,\\mathrm{kN\\,m}$$",
      "@@STEP: Reflexion",
      "Probe: $A_y + B_y = 40\\,\\mathrm{kN} = qL$ ✓",
      "[[/REASONING]]",
    ].join("\n");
    const steps = tafelPage(answer).filter((b) => b.kind === "step");
    expect(steps.map((s) => reasoningKind(s.kind === "step" ? s.label : ""))).toEqual([
      "beobachtung", "gedanke", "aktion", "ergebnis", "reflexion",
    ]);
    expect(auditTrace(steps.map((s) => (s.kind === "step" ? s.label : ""))).complete).toBe(true);
  });
});
