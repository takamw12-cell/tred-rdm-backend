import { describe, expect, test } from "bun:test";
import { all, create } from "mathjs";
import { buildSimulationPrompt, documentWindow, parseFormula, sameAsReference, simulateRequestSchema, toTex, unitsMatch, verifySimulation, type Prover, type SimulationDraft } from "../src/api/lib/simulation";
import { SIM_SCENES, clampInput, formatQuantity, sceneById, sceneForConcept, sliderToValue, valueToSlider } from "../src/web/lib/sim-catalog";

const math = create(all, { number: "number" });

const DOC = [
  "[[SEITE 1]]",
  "Grundlagen der Elektrotechnik – Übungsblatt 3",
  "Zwei Widerstände R1 und R2 liegen in Reihe an der Spannung U.",
  "[[SEITE 2]]",
  "Für den unbelasteten Spannungsteiler gilt: U2 = U · R2 / (R1 + R2).",
  "Der Strom durch beide Widerstände ist I = U / (R1 + R2).",
  "Beispiel: U = 12 V, R1 = 1 kΩ, R2 = 2 kΩ ergibt U2 = 8 V.",
].join("\n");

const SOURCE_U2 = "Für den unbelasteten Spannungsteiler gilt: U2 = U · R2 / (R1 + R2).";
const SOURCE_I = "Der Strom durch beide Widerstände ist I = U / (R1 + R2).";

const draft = (formulas: SimulationDraft["formulas"], scene: SimulationDraft["scene"] = "voltage_divider"): SimulationDraft => ({
  scene,
  values: [
    { symbol: "U", value: 12 },
    { symbol: "R1", value: 1000 },
    { symbol: "R2", value: 2000 },
  ],
  formulas,
});

const input = { concept: "Spannungsteiler", documentText: DOC };
const divider = sceneById("voltage_divider")!;
const dividerSymbols = new Set(divider.inputs.map((v) => v.symbol));

describe("catalogue des simulations", () => {
  test("compute et les lois de référence donnent les mêmes nombres", () => {
    for (const scene of SIM_SCENES) {
      const scope = Object.fromEntries(scene.inputs.map((v) => [v.symbol, v.value]));
      const computed = scene.compute(scope);
      expect(Object.keys(scene.laws).sort()).toEqual(scene.outputs.map((o) => o.symbol).sort());
      for (const [output, law] of Object.entries(scene.laws)) {
        const expected = math.evaluate(law, { ...scope }) as number;
        expect(Math.abs(computed[output]! - expected)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));
      }
    }
  });

  test("chaque loi de référence a la dimension de sa grandeur", () => {
    for (const scene of SIM_SCENES) for (const out of scene.outputs) expect(unitsMatch(math.parse(scene.laws[out.symbol]!), scene, out.unit)).toBe(true);
  });

  test("curseurs : aller-retour, bornes, affichage", () => {
    const r1 = divider.inputs[1]!;
    expect(sliderToValue(r1, 0)).toBe(10);
    expect(sliderToValue(r1, 1)).toBeCloseTo(10_000, 6);
    expect(sliderToValue(r1, valueToSlider(r1, 470))).toBeCloseTo(470, 6);
    expect(clampInput(r1, 1e9)).toBe(10_000);
    expect(clampInput(r1, Number.NaN)).toBe(1000);
    expect(formatQuantity(0.004, "A")).toBe("4 mA");
    expect(formatQuantity(2000, "Ω")).toBe("2 kΩ");
    expect(formatQuantity(0.5, "m")).toBe("0.5 m");
    expect(formatQuantity(0.5, "kg")).toBe("0.5 kg");
    expect(formatQuantity(50, "N·m")).toBe("50 N·m");
  });
});

describe("vérification d'une formule", () => {
  test("syntaxe : rien d'autre que des opérations et les grandeurs d'entrée", () => {
    expect(parseFormula("U * R2 / (R1 + R2)", dividerSymbols)).not.toBeNull();
    expect(parseFormula("2 * pi * sqrt(U)", dividerSymbols)).not.toBeNull();
    for (const bad of ["U * R3", "import('fs')", "R1 = 5", "U; R1", "evaluate(U)", "U2 * 2", "[U, R1]", "R1 ? 1 : 2", "", "x".repeat(300)]) expect(parseFormula(bad, dividerSymbols)).toBeNull();
  });

  test("unités : une formule de mauvaise dimension est refusée", () => {
    const tree = (s: string) => parseFormula(s, dividerSymbols)!;
    expect(unitsMatch(tree("U * R2 / (R1 + R2)"), divider, "V")).toBe(true);
    expect(unitsMatch(tree("U * R2 * (R1 + R2)"), divider, "V")).toBe(false);
    expect(unitsMatch(tree("U / (R1 + R2)"), divider, "A")).toBe(true);
    expect(unitsMatch(tree("U + R1"), divider, "V")).toBe(false);
    expect(unitsMatch(tree("R2 / (R1 + R2)"), divider, "V")).toBe(false);
  });

  test("référence : des formes équivalentes passent, une formule fausse de bonne dimension ne passe pas", () => {
    const tree = (s: string) => parseFormula(s, dividerSymbols)!;
    expect(sameAsReference(tree("U * R2 / (R1 + R2)"), divider, "U2")).toBe(true);
    expect(sameAsReference(tree("U / (1 + R1 / R2)"), divider, "U2")).toBe(true);
    expect(sameAsReference(tree("U - U * R1 / (R1 + R2)"), divider, "U2")).toBe(true);
    expect(sameAsReference(tree("U * R1 / (R1 + R2)"), divider, "U2")).toBe(false);
    expect(sameAsReference(tree("U * R2 / R1"), divider, "U2")).toBe(false);
  });

  test("LaTeX écrit par le code", () => {
    const tex = (s: string) => toTex(parseFormula(s, dividerSymbols)!, (sym) => divider.inputs.find((v) => v.symbol === sym)!.tex);
    expect(tex("U * R2 / (R1 + R2)")).toBe("\\frac{U \\cdot R_2}{R_1 + R_2}");
    expect(tex("U * (R1 + R2)")).toBe("U \\cdot \\left(R_1 + R_2\\right)");
    expect(tex("U - (R1 - R2)")).toBe("U - \\left(R_1 - R_2\\right)");
    expect(tex("(R1 + R2)^2")).toBe("\\left(R_1 + R_2\\right)^{2}");
    expect(tex("2 * pi * sqrt(R1 / R2)")).toBe("2 \\cdot \\pi \\cdot \\sqrt{\\frac{R_1}{R_2}}");
  });
});

describe("verifySimulation", () => {
  test("une simulation juste et sourcée est acceptée, avec la page retrouvée par le code", async () => {
    const res = await verifySimulation(
      draft([
        { output: "U2", expr: "U * R2 / (R1 + R2)", excerpt: SOURCE_U2 },
        { output: "I", expr: "U / (R1 + R2)", excerpt: SOURCE_I },
      ]),
      input,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.spec.scene).toBe("voltage_divider");
    expect(res.spec.values).toEqual({ U: 12, R1: 1000, R2: 2000 });
    expect(res.spec.formulas.map((f) => [f.output, f.tex, f.page])).toEqual([
      ["U2", "U_2 = \\frac{U \\cdot R_2}{R_1 + R_2}", 2],
      ["I", "I = \\frac{U}{R_1 + R_2}", 2],
    ]);
    expect(res.checks.every((c) => c.status === "ok" && c.level === "numeric" && c.sympy === "skipped")).toBe(true);
  });

  test("UNE FORMULE FAUSSE EST REJETÉE : U2 calculé avec R1 (bonne dimension, mauvais résultat)", async () => {
    const res = await verifySimulation(draft([{ output: "U2", expr: "U * R1 / (R1 + R2)", excerpt: SOURCE_U2 }]), input);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe("formula_rejected");
    expect(res.checks).toEqual([{ output: "U2", status: "not_reference", level: null, sympy: "skipped", page: null }]);
  });

  test("une formule fausse fait tomber TOUTE la simulation, même si les autres sont justes", async () => {
    const res = await verifySimulation(
      draft([
        { output: "I", expr: "U / (R1 + R2)", excerpt: SOURCE_I },
        { output: "U2", expr: "U * R2 * (R1 + R2)", excerpt: SOURCE_U2 },
      ]),
      input,
    );
    expect(res.ok).toBe(false);
    expect(res.checks.map((c) => c.status)).toEqual(["ok", "units"]);
    expect("spec" in res).toBe(false);
  });

  test("SymPy : « equal » prouve, « not_equal » rejette, « undecided » laisse le contrôle numérique décider", async () => {
    const asked: string[] = [];
    const prover =
      (reason: "equal" | "not_equal" | "undecided"): Prover =>
      async (latex) => {
        asked.push(latex);
        return { verified: reason === "equal", engine: "sympy", result: "", reason };
      };
    const good = draft([{ output: "U2", expr: "U / (1 + R1 / R2)", excerpt: SOURCE_U2 }]);

    const proved = await verifySimulation(good, input, prover("equal"));
    expect(proved.ok && proved.checks[0]!.level).toBe("proved");
    expect(asked[0]).toBe("\\frac{U}{1 + \\frac{R_1}{R_2}} = \\frac{U \\cdot R_2}{R_1 + R_2}");

    const undecided = await verifySimulation(good, input, prover("undecided"));
    expect(undecided.ok && undecided.checks[0]!.level).toBe("numeric");

    const disproved = await verifySimulation(good, input, prover("not_equal"));
    expect(disproved.ok).toBe(false);
    expect(disproved.checks[0]).toMatchObject({ status: "disproved", sympy: "not_equal" });
  });

  test("une formule juste mais absente du document est rejetée (aucune source)", async () => {
    const res = await verifySimulation(draft([{ output: "U1", expr: "U * R1 / (R1 + R2)", excerpt: "Die Spannung an R1 berechnet sich mit der Spannungsteilerregel für den ersten Widerstand." }]), input);
    expect(res.ok).toBe(false);
    expect(res.checks[0]!.status).toBe("no_source");
  });

  test("aucun modèle vérifié, aucune formule, grandeur inconnue ou en double", async () => {
    expect(await verifySimulation(draft([], "none"), input)).toEqual({ ok: false, reason: "no_model", checks: [] });
    expect(await verifySimulation(draft([]), input)).toEqual({ ok: false, reason: "no_formula", checks: [] });
    const res = await verifySimulation(
      draft([
        { output: "P", expr: "U * U / R1", excerpt: SOURCE_U2 },
        { output: "I", expr: "U / (R1 + R2)", excerpt: SOURCE_I },
        { output: "I", expr: "U / (R1 + R2)", excerpt: SOURCE_I },
      ]),
      input,
    );
    expect(res.checks.map((c) => c.status)).toEqual(["unknown_output", "ok", "unknown_output"]);
    expect(res.ok).toBe(false);
  });

  test("une simulation juste mais d'un AUTRE concept que celui demandé est refusée", async () => {
    const good = draft([{ output: "U2", expr: "U * R2 / (R1 + R2)", excerpt: SOURCE_U2 }]);
    expect((await verifySimulation(good, { ...input, scene: "voltage_divider" })).ok).toBe(true);
    expect(await verifySimulation(good, { ...input, concept: "Fadenpendel", scene: "pendulum" })).toEqual({ ok: false, reason: "no_model", checks: [] });
  });

  test("le concept désigne une simulation du catalogue, ou rien", () => {
    expect(sceneForConcept("Spannungsteiler")?.id).toBe("voltage_divider");
    expect(sceneForConcept("unbelasteter Spannungsteiler, Aufgabe 4.1")?.id).toBe("voltage_divider");
    expect(sceneForConcept("Diviseur de tension")?.id).toBe("voltage_divider");
    expect(sceneForConcept("Hebelgesetz")?.id).toBe("lever");
    expect(sceneForConcept("Fadenpendel")?.id).toBe("pendulum");
    expect(sceneForConcept("Zeitkonstante RC-Glied")?.id).toBe("rc_circuit");
    // Le mot-clé le plus long gagne : « Federpendel » contient « pendel ».
    expect(sceneForConcept("Federpendel")?.id).toBe("spring_mass");
    expect(sceneForConcept("Schwingungsdauer eines Federpendels")?.id).toBe("spring_mass");
    expect(sceneForConcept("Freier Fall")?.id).toBe("free_fall");
    expect(sceneForConcept("Fallhöhe und Fallzeit")?.id).toBe("free_fall");
    expect(sceneForConcept("Zentripetalkraft")?.id).toBe("circular_motion");
    expect(sceneForConcept("gleichförmige Kreisbewegung")?.id).toBe("circular_motion");
    expect(sceneForConcept("Transistor als Schalter")).toBeNull();
    expect(sceneForConcept("Herzzyklus")).toBeNull();
  });

  test("mécanique : la loi juste passe, la loi fausse de bonne dimension est rejetée", async () => {
    const doc = "[[SEITE 1]]\nMechanik.\n[[SEITE 2]]\nDie Periodendauer des Federpendels ist T gleich zwei Pi mal Wurzel aus m durch k.\nBeim freien Fall aus der Höhe h gilt für die Fallzeit t gleich Wurzel aus zwei h durch g.\nDie Zentripetalkraft ist F gleich m mal v Quadrat durch r.";
    const cases = [
      { scene: "spring_mass", concept: "Federpendel", output: "T", good: "2 * pi * sqrt(m / k)", bad: "2 * pi * sqrt(m / k) / 2", excerpt: "Die Periodendauer des Federpendels ist T gleich zwei Pi mal Wurzel aus m durch k." },
      { scene: "free_fall", concept: "Freier Fall", output: "t", good: "sqrt(2 * h / g)", bad: "sqrt(h / g)", excerpt: "Beim freien Fall aus der Höhe h gilt für die Fallzeit t gleich Wurzel aus zwei h durch g." },
      { scene: "circular_motion", concept: "Zentripetalkraft", output: "F", good: "m * v^2 / r", bad: "m * v^2 / (2 * r)", excerpt: "Die Zentripetalkraft ist F gleich m mal v Quadrat durch r." },
    ] as const;
    for (const c of cases) {
      const make = (expr: string) => ({ scene: c.scene, values: [], formulas: [{ output: c.output, expr, excerpt: c.excerpt }] });
      const ok = await verifySimulation(make(c.good), { concept: c.concept, documentText: doc, scene: c.scene });
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.spec.formulas[0]!.page).toBe(2);
      const ko = await verifySimulation(make(c.bad), { concept: c.concept, documentText: doc, scene: c.scene });
      expect(ko.ok).toBe(false);
      expect(ko.checks[0]!.status).toBe("not_reference");
    }
  });

  test("les valeurs du modèle sont bornées aux plages de la simulation", async () => {
    const d = draft([{ output: "I", expr: "U / (R1 + R2)", excerpt: SOURCE_I }]);
    d.values = [
      { symbol: "U", value: 5000 },
      { symbol: "R1", value: -3 },
      { symbol: "X", value: 1 },
    ];
    const res = await verifySimulation(d, input);
    expect(res.ok && res.spec.values).toEqual({ U: 24, R1: 10, R2: 2000 });
  });
});

describe("requête et consigne", () => {
  test("le corps de la requête est borné", () => {
    expect(simulateRequestSchema.safeParse({ documentId: "d1", concept: "  Spannungsteiler " }).success).toBe(true);
    expect(simulateRequestSchema.safeParse({ documentId: "d1", concept: "x" }).success).toBe(false);
    expect(simulateRequestSchema.safeParse({ documentId: "", concept: "Pendel" }).success).toBe(false);
    expect(simulateRequestSchema.safeParse({ documentId: "d1", concept: "x".repeat(200) }).success).toBe(false);
  });

  test("la consigne nomme le catalogue et, au second essai, ce qui a été refusé", () => {
    const first = buildSimulationPrompt({ concept: "Spannungsteiler", title: "Blatt 3", documentText: DOC });
    for (const scene of SIM_SCENES) expect(first.system).toContain(scene.id);
    const fixed = buildSimulationPrompt({ concept: "Spannungsteiler", title: "Blatt 3", documentText: DOC, scene: "voltage_divider" });
    expect(fixed.system).toContain("voltage_divider");
    expect(fixed.system).not.toContain("pendulum");
    expect(first.prompt).toContain("Für den unbelasteten Spannungsteiler");
    expect(first.prompt).not.toContain("abgelehnt");
    const second = buildSimulationPrompt({ concept: "Spannungsteiler", title: "Blatt 3", documentText: DOC, rejected: [{ output: "U2", status: "not_reference", level: null, sympy: "skipped", page: null }] });
    expect(second.prompt).toContain("U2: Formel weicht vom geprüften Gesetz ab");
  });

  test("un long document est réduit à une fenêtre autour du concept, coupée sur une page", () => {
    const long = Array.from({ length: 60 }, (_, i) => `[[SEITE ${i + 1}]]\n${i === 40 ? "Der Spannungsteiler teilt die Spannung." : "Füllt die Seite."} ${"x".repeat(3000)}`).join("\n");
    const win = documentWindow(long, "Spannungsteiler", 20_000);
    expect(win.length).toBeLessThanOrEqual(20_000);
    expect(win.startsWith("[[SEITE")).toBe(true);
    expect(win).toContain("Der Spannungsteiler teilt die Spannung.");
    expect(documentWindow(DOC, "Spannungsteiler")).toBe(DOC);
  });
});
