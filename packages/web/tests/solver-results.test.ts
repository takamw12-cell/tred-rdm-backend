import { describe, expect, test } from "bun:test";
import { guardSolver } from "../src/api/lib/solver-guard";
import { collectNumbers, compact, isSolverResult, numberForms, serializeSolverRun } from "../src/api/lib/solver-results";
import { buildVideoPrompt, extractNumbers, solverSource, validateVideoScript, type VideoScene, type VideoSource } from "../src/api/lib/video-script";
import { langOf } from "../src/api/lib/languages";

const RUN = {
  solver: "balkenstatik",
  input: { length: 4, q: 2000 },
  output: { ok: true, A: 4166.6667, B: 3833.3333, Mmax: 4000, einheit: "N", text: "Maximales Moment 4000 Nm bei x = 2,08 m" },
};
const DOC: VideoSource = { title: "TM2_Skript.pdf", content: "Bei einer Gleichstreckenlast tragen beide Lager die Last zu gleichen Teilen. Zulässig sind 235 N/mm²." };

const voice = (n: number) => Array.from({ length: n }, () => "wort").join(" ");
const scene = (over: Partial<VideoScene> = {}): VideoScene => ({
  heading: "Lagerkräfte",
  bullets: [],
  formula: "",
  sourceIndex: 1,
  quote: "tragen beide Lager die Last zu gleichen Teilen",
  voiceover: voice(30),
  ...over,
});

describe("guardSolver — l'observateur", () => {
  test("reçoit l'entrée et la sortie d'un calcul réussi", async () => {
    const seen: unknown[] = [];
    const run = guardSolver("thermo_berechnen", (x: { t: number }) => ({ ok: true, eta: x.t / 2 }), (r) => seen.push(r));
    expect(await run({ t: 0.8 })).toEqual({ ok: true, eta: 0.4 });
    expect(seen).toEqual([{ solver: "thermo_berechnen", input: { t: 0.8 }, output: { ok: true, eta: 0.4 } }]);
  });
  test("n'est pas appelé quand le solveur plante", async () => {
    const seen: unknown[] = [];
    const run = guardSolver("x", () => { throw new Error("boom"); }, (r) => seen.push(r));
    expect(await run({})).toMatchObject({ ok: false });
    expect(seen).toEqual([]);
  });
  test("une erreur de l'observateur ne change pas la réponse du solveur", async () => {
    const run = guardSolver("x", () => ({ ok: true, v: 1 }), () => { throw new Error("base indisponible"); });
    expect(await run({})).toEqual({ ok: true, v: 1 });
  });
});

describe("serializeSolverRun", () => {
  test("garde un calcul réussi, en JSON", () => {
    const row = serializeSolverRun(RUN)!;
    expect(row.solver).toBe("balkenstatik");
    expect(JSON.parse(row.output).Mmax).toBe(4000);
    expect(JSON.parse(row.input)).toEqual({ length: 4, q: 2000 });
  });
  test("ne garde pas un échec de solveur", () => {
    expect(isSolverResult({ ok: false, fehler: "solver_ausgefallen" })).toBe(false);
    expect(serializeSolverRun({ solver: "x", input: {}, output: { ok: false } })).toBeNull();
    expect(serializeSolverRun({ solver: "x", input: {}, output: undefined })).toBeNull();
  });
  test("retire les longues séries de points et les SVG, garde les valeurs", () => {
    const out = compact({ Mmax: 4000, kurve: Array.from({ length: 500 }, (_, i) => i), svg: "<svg>…</svg>", punkte: [1, 2] }) as Record<string, unknown>;
    expect(out).toEqual({ Mmax: 4000, punkte: [1, 2] });
  });
  test("refuse une sortie encore trop grosse après nettoyage", () => {
    const big = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, "wert wert wert"]));
    expect(serializeSolverRun({ solver: "x", input: {}, output: big })).toBeNull();
  });
});

describe("numberForms — arrondis et unités d'une valeur calculée", () => {
  test("autorise les arrondis usuels", () => {
    const f = numberForms(4166.6667);
    for (const n of ["4167", "4166.7", "4166.67", "4170", "4200"]) expect(f).toContain(n);
  });
  test("autorise le changement d'unité (N → kN, m → mm)", () => {
    expect(numberForms(4166.6667)).toContain("4.17");
    expect(numberForms(4000)).toContain("4");
    expect(numberForms(2.08)).toContain("2080");
  });
  test("n'autorise pas une autre valeur", () => {
    const f = numberForms(4166.6667);
    for (const n of ["5", "4.5", "4500", "43", "4.3"]) expect(f).not.toContain(n);
  });
  test("lit aussi les nombres écrits dans les textes de la sortie", () => {
    const set = collectNumbers(RUN.output, extractNumbers);
    expect(set.has("2.08")).toBe(true);
    expect(set.has("3833")).toBe(true);
  });
});

describe("validateVideoScript — documents ET solveurs", () => {
  const sources = [DOC, solverSource(RUN)];

  test("une scène appuyée sur un solveur n'a pas besoin de citation", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene(), scene({ sourceIndex: 2, quote: "", voiceover: `${voice(25)} A gleich 4,17 Kilonewton` })] }, sources);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scenes.map((s) => s.sourceKind)).toEqual(["document", "solver"]);
  });

  test("accepte un nombre calculé par le solveur, arrondi ou converti", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ sourceIndex: 2, quote: "", bullets: ["A = 4,17 kN", "B = 3833 N"], formula: String.raw`M_{max} = 4000\,\mathrm{Nm}` }), scene()] }, sources);
    expect(r.ok && r.dropped.length).toBe(0);
  });

  test("rejette un nombre qui n'est ni dans les documents ni dans les sorties des solveurs", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ sourceIndex: 2, quote: "", voiceover: `${voice(25)} A gleich 5,25 Kilonewton` }), scene(), scene()] }, sources);
    expect(r.dropped).toEqual([{ index: 0, reason: "number_not_in_sources", detail: "5.25" }]);
  });

  test("un nombre du solveur vaut aussi pour une scène appuyée sur le cours", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ voiceover: `${voice(25)} das Moment beträgt 4000 Newtonmeter` }), scene()] }, sources);
    expect(r.ok && r.dropped.length).toBe(0);
  });

  test("sans solveur, ce même nombre est rejeté", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ voiceover: `${voice(25)} das Moment beträgt 4000 Newtonmeter` }), scene(), scene()] }, [DOC]);
    expect(r.dropped[0]).toMatchObject({ reason: "number_not_in_sources", detail: "4000" });
  });

  test("les solveurs seuls suffisent, sans document", () => {
    const only = [solverSource(RUN)];
    const r = validateVideoScript({ title: "t", scenes: [scene({ sourceIndex: 1, quote: "" }), scene({ sourceIndex: 1, quote: "", voiceover: `${voice(25)} 4000` })] }, only);
    expect(r.ok).toBe(true);
  });

  test("une scène sur le cours exige toujours sa citation", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ quote: "" }), scene(), scene()] }, sources);
    expect(r.dropped[0]?.reason).toBe("quote_too_short");
  });
});

describe("buildVideoPrompt — les chiffres des solveurs", () => {
  test("injecte les calculs et la consigne d'exclusivité", () => {
    const p = buildVideoPrompt({ language: langOf("fr"), sources: [DOC, solverSource(RUN)], question: "Pourquoi ?", answer: "" });
    expect(p.system).toContain("Utilise EXCLUSIVEMENT ces chiffres calculés par nos solveurs");
    expect(p.prompt).toContain("[S2] Solver · balkenstatik (solver)");
    expect(p.prompt).toContain('"Mmax":4000');
  });
  test("sans solveur, la consigne n'apparaît pas", () => {
    const p = buildVideoPrompt({ language: langOf("fr"), sources: [DOC], question: "", answer: "" });
    expect(p.system).not.toContain("CHIFFRES CALCULÉS");
  });
});
