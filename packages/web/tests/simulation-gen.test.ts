import { describe, expect, test } from "bun:test";
import { buildGeneratedPrompt, compileExpr, generatedModelSchema, parseShape, symbolTex, unitLabel, verifyGenerated, type GeneratedDraft } from "../src/api/lib/simulation-gen";
import { parseFormula, simulateRequestSchema } from "../src/api/lib/simulation";
import { computeGenerated, evalExpr, normalized, plotPoints } from "../src/web/lib/sim-generated";

const DOC = "[[SEITE 1]]\nTechnische Mechanik 2 — Kapitel 1\n[[SEITE 2]]\nDie Normalspannung im Zugstab ist der Quotient aus Normalkraft und Querschnittsfläche: sigma = F / A.\nSie wird in N/mm² angegeben.";
const QUOTE = "Die Normalspannung im Zugstab ist der Quotient aus Normalkraft und Querschnittsfläche: sigma = F / A.";

const draft = (over: Partial<GeneratedDraft> = {}): GeneratedDraft => ({
  title: "Normalspannung",
  summary: "Ein Zugstab unter der Kraft F.",
  explanation: "Die **Normalspannung** $\\sigma$ ist die Kraft pro Fläche. Sie wirkt senkrecht zur Schnittfläche.",
  quotes: [QUOTE],
  inputs: [
    { symbol: "F", label: "Normalkraft", unit: "kN", min: 1, max: 100, value: 20 },
    { symbol: "A", label: "Querschnittsfläche", unit: "mm^2", min: 50, max: 2000, value: 400 },
  ],
  outputs: [{ symbol: "sigma", label: "Normalspannung", unit: "MPa", expr: "F / A", excerpt: QUOTE }],
  shapes: ["cylinder x=0 y=0 w=0.6 h=2.4 color=slate growW=A glow=sigma", "arrow x=0 y=1.3 h=0.8 dir=-y color=amber growH=F"],
  plotX: "F",
  ...over,
});
const input = { concept: "Normalspannung", documentText: DOC };

describe("Labo universel : contrôle d'une simulation générée", () => {
  test("σ = F / A : acceptée, facteur d'unités calculé par le code (kN, mm² → MPa), page retrouvée", () => {
    const v = verifyGenerated(draft(), input);
    if (!v.ok || v.kind !== "simulation") throw new Error("simulation attendue");
    const sigma = v.sim.outputs[0]!;
    expect(sigma.scale).toBe(1000);
    expect(sigma.unitLabel).toBe("MPa");
    expect(v.sim.formulas[0]).toEqual({ output: "sigma", tex: "\\sigma = \\frac{F}{A}", page: 2, excerpt: QUOTE });
    // 20 kN sur 400 mm² = 50 MPa.
    expect(computeGenerated(v.sim, { F: 20, A: 400 }).sigma).toBeCloseTo(50, 9);
    expect(v.sim.inputs.map((i) => i.unitLabel)).toEqual(["kN", "mm²"]);
    expect(v.sim.plot).toEqual({ x: "F", y: "sigma" });
  });

  test("une formule de mauvaise dimension est écartée : σ = F · A n'est pas une pression", () => {
    const v = verifyGenerated(draft({ outputs: [{ symbol: "sigma", label: "x", unit: "MPa", expr: "F * A", excerpt: "" }] }), input);
    // Plus aucune formule valable : il reste l'explication, jamais une simulation fausse.
    expect(v.ok && v.kind).toBe("explanation");
    expect(v.checks).toEqual([{ output: "sigma", status: "units", level: null, sympy: "skipped", page: null }]);
  });

  test("une formule juste en garde sa place quand une autre est refusée", () => {
    const v = verifyGenerated(draft({ outputs: [...draft().outputs, { symbol: "bad", label: "x", unit: "MPa", expr: "F * A", excerpt: "" }] }), input);
    if (!v.ok || v.kind !== "simulation") throw new Error("simulation attendue");
    expect(v.sim.outputs.map((o) => o.symbol)).toEqual(["sigma"]);
    expect(v.checks.map((c) => c.status)).toEqual(["ok", "units"]);
  });

  test("rien de ce que le modèle écrit n'est exécuté : appels, propriétés, symboles inconnus sont refusés", () => {
    for (const expr of ["alert(1)", "F.constructor", "import(\"x\")", "F / A; process.exit()", "F / B", "eval(F)", "F[0]", "(function(){})()"]) {
      const v = verifyGenerated(draft({ outputs: [{ symbol: "sigma", label: "x", unit: "MPa", expr, excerpt: "" }] }), input);
      expect(v.ok && v.kind).toBe("explanation");
      expect(v.checks[0]!.status).toBe("syntax");
    }
    // Symboles réservés ou mal formés : la grandeur disparaît.
    const v = verifyGenerated(draft({ inputs: [{ symbol: "constructor()", label: "x", unit: "N", min: 1, max: 2, value: 1 }, { symbol: "pi", label: "x", unit: "", min: 1, max: 2, value: 1 }] }), input);
    expect(v.ok && v.kind).toBe("explanation");
  });

  test("les formes sont des primitives bornées ; une ligne étrangère est ignorée", () => {
    const known = new Set(["F", "A", "sigma"]);
    expect(parseShape("box x=99 y=-99 w=1000 h=0 color=amber growH=F glow=hack", known)).toMatchObject({ kind: "box", x: 3, y: -1.6, w: 4, h: 0.05, growH: "F", glow: "", color: "amber" });
    expect(parseShape("arrow x=0 y=1 h=1 dir=+x color=purple", known)).toMatchObject({ kind: "arrow", dir: "+x", color: "slate" });
    expect(parseShape("<script>alert(1)</script>", known)).toBeNull();
    expect(parseShape("mesh onClick=steal", known)).toBeNull();
    const v = verifyGenerated(draft({ shapes: ["nonsense", ...Array.from({ length: 30 }, () => "sphere x=0 y=0 w=1")] }), input);
    if (!v.ok || v.kind !== "simulation") throw new Error("simulation attendue");
    expect(v.sim.shapes.length).toBe(9);
  });

  test("la citation : retrouvée → page ; inventée → la formule reste, marquée « pas dans le document »", () => {
    const v = verifyGenerated(draft({ outputs: [{ symbol: "sigma", label: "Normalspannung", unit: "MPa", expr: "F / A", excerpt: "Die Spannung ist immer Kraft durch Fläche, sagt der Professor." }] }), input);
    if (!v.ok || v.kind !== "simulation") throw new Error("simulation attendue");
    expect(v.sim.formulas[0]).toMatchObject({ page: null, excerpt: "" });
    const noDoc = verifyGenerated(draft(), { concept: "Normalspannung", documentText: null });
    expect(noDoc.ok && noDoc.kind === "simulation" && noDoc.sim.formulas[0]!.page).toBeNull();
  });

  test("un concept sans formule donne une explication, avec les seules citations retrouvées", () => {
    const v = verifyGenerated(draft({ inputs: [], outputs: [], shapes: [], quotes: [QUOTE, "Ein Satz, der nirgends im Dokument steht und erfunden ist."], explanation: "Die **DNA** speichert die Erbinformation. <img src=x onerror=alert(1)> Sie besteht aus zwei Strängen." }), { concept: "DNA", documentText: DOC });
    if (!v.ok || v.kind !== "explanation") throw new Error("explication attendue");
    expect(v.explanation.quotes).toEqual([{ text: QUOTE, page: 2 }]);
    expect(v.explanation.markdown).not.toContain("<");
    expect(verifyGenerated(draft({ inputs: [], outputs: [], explanation: "kurz" }), input).ok).toBe(false);
  });

  test("un facteur de conversion écrit dans la formule serait compté deux fois : refusé (vu à l'essai réel)", () => {
    const heart = (expr: string) => verifyGenerated(draft({ inputs: [{ symbol: "HF", label: "Herzfrequenz", unit: "1/min", min: 30, max: 200, value: 70 }, { symbol: "SV", label: "Schlagvolumen", unit: "ml", min: 20, max: 150, value: 70 }], outputs: [{ symbol: "HZV", label: "Herzzeitvolumen", unit: "l/min", expr, excerpt: "" }], plotX: "HF" }), { concept: "Herzzeitvolumen", documentText: null });
    const twice = heart("HF * SV / 1000");
    expect(twice.checks[0]!.status).toBe("conversion");
    expect(twice.ok && twice.kind).toBe("explanation");
    const good = heart("HF * SV");
    if (!good.ok || good.kind !== "simulation") throw new Error("simulation attendue");
    // 70 battements par minute × 70 ml = 4,9 l/min.
    expect(computeGenerated(good.sim, { HF: 70, SV: 70 }).HZV).toBeCloseTo(4.9, 9);
    // Quand le code ne convertit rien (facteur 1), un 100 dans la formule est celui du cours : accepté.
    const percent = verifyGenerated(draft({ inputs: [{ symbol: "a", label: "Anteil", unit: "", min: 0, max: 1, value: 0.25 }], outputs: [{ symbol: "P", label: "Prozent", unit: "", expr: "100 * a", excerpt: "" }], plotX: "a" }), { concept: "Prozent", documentText: null });
    expect(percent.ok && percent.kind).toBe("simulation");
  });

  test("grandeurs sans unité, plages vides, valeurs non finies", () => {
    const v = verifyGenerated(draft({ inputs: [{ symbol: "p", label: "paralleler Anteil", unit: "", min: 0.1, max: 0.99, value: 0.9 }, { symbol: "n", label: "Kerne", unit: "", min: 1, max: 64, value: 8 }, { symbol: "bad", label: "x", unit: "N", min: 5, max: 5, value: 5 }], outputs: [{ symbol: "S", label: "Speedup", unit: "", expr: "1 / ((1 - p) + p / n)", excerpt: "" }, { symbol: "inf", label: "x", unit: "", expr: "1 / (n - n)", excerpt: "" }], plotX: "n" }), { concept: "Amdahl", documentText: null });
    if (!v.ok || v.kind !== "simulation") throw new Error("simulation attendue");
    expect(v.sim.inputs.map((i) => i.symbol)).toEqual(["p", "n"]);
    expect(v.sim.outputs.map((o) => o.symbol)).toEqual(["S"]);
    expect(computeGenerated(v.sim, { p: 0.9, n: 8 }).S).toBeCloseTo(1 / (0.1 + 0.9 / 8), 12);
  });
});

describe("Labo universel : calcul côté navigateur", () => {
  const symbols = new Set(["F", "A", "x"]);
  const compile = (e: string) => compileExpr(parseFormula(e, symbols)!);

  test("l'évaluateur donne les mêmes nombres que l'expression, et NaN pour tout le reste", () => {
    expect(evalExpr(compile("2 * pi * sqrt(F / A) - x^2"), { F: 8, A: 2, x: 3 })).toBeCloseTo(2 * Math.PI * 2 - 9, 12);
    expect(evalExpr(compile("-(F + A) / exp(log(x))"), { F: 1, A: 2, x: 4 })).toBeCloseTo(-0.75, 12);
    expect(evalExpr(["alert", 1] as never, {})).toBeNaN();
    expect(evalExpr("constructor", {})).toBeNaN();
    expect(evalExpr(["+", "F"] as never, { F: 1 })).toBeNaN();
  });

  test("normalisation et courbe", () => {
    const v = verifyGenerated(draft(), input);
    if (!v.ok || v.kind !== "simulation") throw new Error("simulation attendue");
    expect(normalized(v.sim, "F", { F: 1, A: 400 }, {})).toBe(0);
    expect(normalized(v.sim, "F", { F: 100, A: 400 }, {})).toBe(1);
    expect(normalized(v.sim, "inconnu", {}, {})).toBe(0.5);
    const points = plotPoints(v.sim, { F: 20, A: 400 });
    expect(points.length).toBe(49);
    expect(points[0]!.y).toBeCloseTo(2.5, 9);
    expect(points.at(-1)!.y).toBeCloseTo(250, 9);
  });
});

describe("Labo universel : écriture et consigne", () => {
  test("symboles et unités affichés", () => {
    expect(symbolTex("sigma")).toBe("\\sigma");
    expect(symbolTex("sigmaN")).toBe("\\sigma_{N}");
    expect(symbolTex("F1")).toBe("F_{1}");
    expect(symbolTex("HZV")).toBe("\\mathit{HZV}");
    expect(unitLabel("N/mm^2")).toBe("N/mm²");
    expect(unitLabel("ohm")).toBe("Ω");
  });

  test("la consigne interdit le code, borne le concept, et dit s'il y a un document", () => {
    const withDoc = buildGeneratedPrompt({ concept: "Normalspannung", title: "TM2.pdf", documentText: DOC });
    expect(withDoc.system).toContain("KEINEN Code");
    expect(withDoc.prompt).toContain("<dokument>");
    const without = buildGeneratedPrompt({ concept: "x".repeat(500), title: null, documentText: null });
    expect(without.prompt).toContain("Es gibt kein Dokument");
    expect(without.prompt.length).toBeLessThan(400);
    expect(generatedModelSchema.safeParse(draft()).success).toBe(true);
  });

  test("la requête accepte l'absence de document", () => {
    expect(simulateRequestSchema.parse({ concept: "Normalspannung" })).toEqual({ documentId: "", concept: "Normalspannung" });
    expect(simulateRequestSchema.safeParse({ documentId: "d", concept: "x" }).success).toBe(false);
  });
});
