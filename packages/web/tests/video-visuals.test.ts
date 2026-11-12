import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toPayload } from "../src/api/lib/beam-tool";
import { CUE_VISUAL, REAL_IMAGES, VISUALS, VISUAL_CUES, cueOf, lessonStages, resolveVisual, visualOfCues } from "../src/api/lib/video-visuals";
import { buildVideoPrompt, resolveBeam, solverSource, validateVideoScript, type VideoScene, type VideoSource } from "../src/api/lib/video-script";
import { langOf } from "../src/api/lib/languages";

const DOC: VideoSource = {
  title: "TM2_Skript.pdf",
  content:
    "Ein Balken der Länge l = 4 m liegt auf einem Festlager A und einem Loslager B. Er trägt über die gesamte Länge die Gleichstreckenlast q = 2 kN/m. Aus Symmetriegründen tragen beide Lager die Last zu gleichen Teilen.",
};
const LAW: VideoSource = {
  title: "Strafrecht_BT.pdf",
  content: "Wer eine fremde bewegliche Sache einem anderen in der Absicht wegnimmt, die Sache sich oder einem Dritten rechtswidrig zuzueignen, wird bestraft.",
};
const BEAM = { laenge: 4, lager: [{ x: 0, art: "festlager" as const, name: "A" }, { x: 4, art: "loslager" as const, name: "B" }], einzellasten: [], streckenlasten: [{ von: 0, bis: 4, q: 2 }], einheiten: { laenge: "m" as const, kraft: "kN" as const } };

const voice = (n: number) => Array.from({ length: n }, () => "wort").join(" ");
const scene = (over: Partial<VideoScene> = {}): VideoScene => ({
  stage: "step",
  visual_cues: [],
  kind: "explanation",
  visual: "text",
  image: "",
  steps: [],
  keywords: [],
  chart: "",
  heading: "Lagerkräfte",
  bullets: [],
  formula: "",
  sourceIndex: 1,
  quote: "Aus Symmetriegründen tragen beide Lager die Last zu gleichen Teilen",
  voiceover: voice(30),
  ...over,
});

describe("la bibliothèque de visuels est une liste fermée", () => {
  test("le modèle choisit, il ne dessine pas : un visuel inconnu retombe sur le texte", () => {
    expect(resolveVisual({ visual: "draw_a_heart_freehand" }, { beam: false }).visual).toBe("text");
    expect(resolveVisual({}, { beam: false }).visual).toBe("text");
  });
  test("chaque image de la bibliothèque existe dans l'app (aucun service extérieur)", () => {
    for (const url of Object.values(REAL_IMAGES)) {
      expect(url.startsWith("/backgrounds/")).toBe(true);
      expect(existsSync(join(import.meta.dir, "../public", url))).toBe(true);
    }
  });
  test("toutes les filières ont leurs images : ingénierie, droit, médecine, économie", () => {
    for (const key of ["bridge", "courthouse", "justice", "heart", "operating_room", "stock_market"]) expect(Object.keys(REAL_IMAGES)).toContain(key);
  });
  test("le prompt présente chaque visuel et guide le choix par matière", () => {
    const p = buildVideoPrompt({ language: langOf("fr"), sources: [DOC], question: "", answer: "" }).system;
    // Le modèle écrit des ordres (visual_cues) : chacun est présenté.
    for (const cue of VISUAL_CUES) expect(p).toContain(`"${cue}"`);
    expect(p).toContain("Droit, philosophie");
    expect(p).toContain("Médecine, biologie");
    expect(p).toContain("Économie, gestion");
  });
});

describe("garde-fous par visuel", () => {
  test("le schéma du solveur exige un calcul : sinon aucune courbe", () => {
    expect(resolveVisual({ visual: "solver_plot" }, { beam: false }).visual).toBe("text");
    expect(resolveVisual({ visual: "solver_plot" }, { beam: true }).visual).toBe("solver_plot");
  });
  test("une image exige un mot-clé de la bibliothèque", () => {
    expect(resolveVisual({ visual: "real_image", image: "heart" }, { beam: false })).toMatchObject({ visual: "real_image", image: "heart" });
    expect(resolveVisual({ visual: "real_image", image: "https://example.com/x.jpg" }, { beam: false }).visual).toBe("text");
  });
  test("un diagramme de flux exige au moins deux étapes, six au plus", () => {
    expect(resolveVisual({ visual: "flowchart", steps: ["Tatbestand"] }, { beam: false }).visual).toBe("text");
    const r = resolveVisual({ visual: "flowchart", steps: ["a", "b", "c", "d", "e", "f", "g", " "] }, { beam: false });
    expect(r.visual).toBe("flowchart");
    expect(r.steps).toHaveLength(6);
  });
  test("on ne surligne que des mots qui sont dans la citation", () => {
    const r = resolveVisual({ visual: "highlight", quote: LAW.content, keywords: ["fremde bewegliche Sache", "wegnimmt", "Raub"] }, { beam: false });
    expect(r.keywords).toEqual(["fremde bewegliche Sache", "wegnimmt"]);
    expect(resolveVisual({ visual: "highlight", quote: "" }, { beam: false }).visual).toBe("text");
  });
  test("une courbe exige un type connu, une formule exige une formule", () => {
    expect(resolveVisual({ visual: "chart", chart: "supply_demand" }, { beam: false }).chart).toBe("supply_demand");
    expect(resolveVisual({ visual: "chart", chart: "bitcoin_price" }, { beam: false }).visual).toBe("text");
    expect(resolveVisual({ visual: "formula", formula: "" }, { beam: false }).visual).toBe("text");
  });
});

describe("la poutre de la vidéo est toujours calculée par le solveur", () => {
  test("l'exemple chiffré du cours passe au solveur, qui rend le schéma et les résultats", () => {
    const r = resolveBeam({ beam: BEAM }, [DOC]);
    expect(r.payload?.problem.length).toBe(4);
    expect(r.run?.solver).toBe("balkenstatik");
    expect(JSON.stringify(r.run?.output)).toContain("auflagerkraefte");
  });
  test("une poutre dont une valeur n'est pas dans le cours est écartée", () => {
    const invented = { ...BEAM, streckenlasten: [{ von: 0, bis: 4, q: 7 }] };
    expect(resolveBeam({ beam: invented }, [DOC])).toMatchObject({ payload: null, rejected: "numbers_not_in_sources" });
  });
  test("un calcul déjà fait dans le chat passe avant la poutre du script", () => {
    const chat = solverSource({ solver: "balkenstatik", input: {}, output: { ok: true, diagramm: toPayload({ ...BEAM, laenge: 6, lager: [{ x: 0, art: "festlager" }, { x: 6, art: "loslager" }], streckenlasten: [{ von: 0, bis: 6, q: 2 }] }) } });
    const r = resolveBeam({ beam: BEAM }, [DOC, chat]);
    expect(r.payload?.problem.length).toBe(6);
    expect(r.run).toBeNull();
  });
  test("sans calcul ni exemple : aucune poutre chiffrée", () => {
    expect(resolveBeam({ beam: null }, [DOC])).toEqual({ payload: null, run: null });
  });
  test("les résultats du solveur deviennent des nombres permis ; une scène de schéma n'a pas à citer le cours", () => {
    const r = resolveBeam({ beam: BEAM }, [DOC]);
    const sources = [DOC, solverSource(r.run!)];
    const checked = validateVideoScript(
      { title: "t", scenes: [scene(), scene({ visual: "solver_plot", quote: "", voiceover: `${voice(25)} das größte Moment beträgt 4 Kilonewtonmeter, also 4000 Newtonmeter` })] },
      sources,
      "",
      { beam: true },
    );
    expect(checked.ok && checked.dropped.length).toBe(0);
    if (checked.ok) expect(checked.scenes[1]).toMatchObject({ visual: "solver_plot", sourceKind: "solver", quote: "" });
  });
});

describe("animations — la composition", () => {
  const src = readFileSync(join(import.meta.dir, "../src/web/video/dynamic-explanation.tsx"), "utf8");
  test("les cases surgissent avec `spring`, les flèches se tracent par stroke-dashoffset", () => {
    expect(src).toContain("spring({");
    expect(src).toContain("strokeDashoffset");
  });
  test("les étapes suivent la voix : leur instant vient des mots horodatés", () => {
    expect(src).toContain("cueFrames(scene.steps, props.words, from, to)");
  });
  test("la formule s'écrit caractère par caractère, sur le rendu de KaTeX", () => {
    expect(src).toContain('output: "html"');
    expect(src).toMatch(/i\+\+ < shown \? 1 : 0/);
  });
  test("l'image de contexte vient de la bibliothèque, jamais d'une adresse du script", () => {
    expect(src).toContain("props.realImages?.[props.backdrop]");
  });
});

describe("exemples du quotidien", () => {
  test("une scène d'exemple n'a pas besoin de citation", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ kind: "analogy", visual: "real_image", image: "bridge", quote: "", voiceover: "Stell dir eine Brücke vor, über die Autos fahren. " + voice(20) }), scene(), scene()] }, [DOC]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scenes[0]).toMatchObject({ sourceKind: "analogy", visual: "real_image", image: "bridge", quote: "", formula: "" });
  });
  test("mais elle ne contient aucun chiffre ni formule", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ kind: "analogy", quote: "", voiceover: `${voice(20)} eine Brücke trägt 40 Tonnen` }), scene(), scene()] }, [DOC]);
    expect(r.dropped).toEqual([{ index: 0, reason: "number_in_analogy", detail: "40" }]);
    const f = validateVideoScript({ title: "t", scenes: [scene({ kind: "analogy", quote: "", formula: "E = mc^2", visual: "formula" }), scene(), scene()] }, [DOC]);
    if (f.ok) expect(f.scenes[0]).toMatchObject({ formula: "", visual: "text" });
  });
  test("deux au plus, et elles ne remplacent pas les scènes de cours", () => {
    const a = scene({ kind: "analogy", quote: "" });
    const many = validateVideoScript({ title: "t", scenes: [a, a, a, scene(), scene()] }, [DOC]);
    expect(many.dropped).toEqual([{ index: 2, reason: "too_many_analogies" }]);
    expect(validateVideoScript({ title: "t", scenes: [a, a, scene()] }, [DOC])).toMatchObject({ ok: false, error: "no_valid_scene" });
  });
  test("un nombre dans une étape de diagramme de flux est contrôlé comme les autres", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene({ visual: "flowchart", steps: ["Last 9,5 kN", "Moment"] }), scene(), scene()] }, [DOC]);
    expect(r.dropped[0]).toMatchObject({ reason: "number_not_in_sources", detail: "9.5" });
  });
});

describe("visual_cues : des ordres que le code exécute", () => {
  test("chaque visuel a son ordre, et un seul", () => {
    for (const v of VISUALS) expect(CUE_VISUAL[cueOf(v)]).toBe(v);
    expect(new Set(Object.values(CUE_VISUAL)).size).toBe(VISUALS.length);
    expect(cueOf("flowchart")).toBe("draw_flowchart");
    expect(cueOf("formula")).toBe("write_equation");
    expect(cueOf("beam")).toBe("show_beam");
  });

  test("le premier ordre connu décide ; un ordre inconnu est ignoré", () => {
    expect(visualOfCues(["draw_flowchart"])).toBe("flowchart");
    expect(visualOfCues(["draw_a_heart_freehand", "write_equation"])).toBe("formula");
    expect(visualOfCues(["nothing"])).toBeUndefined();
    expect(visualOfCues("draw_flowchart")).toBeUndefined();
  });

  test("les garde-fous s'appliquent aux ordres comme aux visuels", () => {
    expect(resolveVisual({ visual_cues: ["plot_curves"] }, { beam: false })).toMatchObject({ visual: "text", visual_cues: ["write_points"] });
    expect(resolveVisual({ visual_cues: ["plot_curves"] }, { beam: true })).toMatchObject({ visual: "solver_plot", visual_cues: ["plot_curves"] });
    expect(resolveVisual({ visual_cues: ["draw_flowchart"], steps: ["Tatbestand", "Rechtsfolge"] }, { beam: false })).toMatchObject({ visual: "flowchart", visual_cues: ["draw_flowchart"] });
    expect(resolveVisual({ visual_cues: ["write_equation"], formula: "" }, { beam: false }).visual).toBe("text");
    // Poutre + charges demandées ensemble : une seule scène qui fait les deux.
    expect(resolveVisual({ visual_cues: ["show_beam", "apply_loads"] }, { beam: false })).toMatchObject({ visual: "loads", visual_cues: ["apply_loads"] });
    expect(resolveVisual({ visual_cues: ["show_beam"] }, { beam: false }).visual).toBe("beam");
    expect(resolveVisual({ visual_cues: ["ask_question"], heading: "Warum bricht der Balken in der Mitte?" }, { beam: false }).visual).toBe("question");
    expect(resolveVisual({ visual_cues: ["ask_question"], heading: " " }, { beam: false }).visual).toBe("text");
    expect(resolveVisual({ visual_cues: ["check_recap"], bullets: ["Die Last biegt den Balken"] }, { beam: false }).visual).toBe("recap");
    expect(resolveVisual({ visual_cues: ["check_recap"], bullets: [] }, { beam: false }).visual).toBe("text");
  });
});

describe("la mini-leçon : question mystère, pas à pas, exemple, récapitulatif", () => {
  test("la structure se lit sur les scènes qui restent", () => {
    expect(lessonStages([{}, {}, { stage: "example" }, {}])).toEqual(["hook", "step", "example", "recap"]);
    expect(lessonStages([{}, { sourceKind: "analogy" }, {}])).toEqual(["hook", "example", "recap"]);
    // Le modèle ne peut pas placer deux ouvertures ni conclure au milieu.
    expect(lessonStages([{ stage: "recap" }, { stage: "hook" }, { stage: "recap" }, { stage: "step" }])).toEqual(["hook", "step", "step", "recap"]);
    expect(lessonStages([{}, {}])).toEqual(["hook", "recap"]);
  });

  test("un script complet : la question ouvre, la liste cochée conclut", () => {
    const r = validateVideoScript(
      {
        title: "t",
        scenes: [
          scene({ stage: "hook", kind: "analogy", visual: undefined, visual_cues: ["ask_question"], heading: "Warum bricht ein Balken in der Mitte?", quote: "", voiceover: "Warum bricht ein Balken eigentlich in der Mitte und nicht am Lager? " + voice(12) }),
          scene({ stage: "step" }),
          scene({ stage: "example", kind: "analogy", visual: "real_image", image: "bridge", quote: "", voiceover: "Stell dir eine Brücke vor, über die Autos fahren. " + voice(15) }),
          scene({ stage: "recap", visual: undefined, visual_cues: ["check_recap"], bullets: ["Die Last biegt den Balken"] }),
        ],
      },
      [DOC],
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes.map((s) => s.stage)).toEqual(["hook", "step", "example", "recap"]);
    expect(r.scenes[0]).toMatchObject({ visual: "question", visual_cues: ["ask_question"], sourceKind: "analogy", quote: "" });
    expect(r.scenes[3]).toMatchObject({ visual: "recap", visual_cues: ["check_recap"], sourceKind: "document" });
    for (const s of r.scenes) expect(s.visual_cues).toHaveLength(1);
  });

  test("la question mystère ne compte pas parmi les exemples, mais reste sans chiffre", () => {
    const hook = scene({ stage: "hook", kind: "analogy", visual_cues: ["ask_question"], visual: undefined, heading: "Warum hält die Brücke?", quote: "", voiceover: "Warum hält die Brücke eigentlich? " + voice(10) });
    const example = () => scene({ kind: "analogy", quote: "", voiceover: "Stell dir eine Brücke vor. " + voice(12) });
    const r = validateVideoScript({ title: "t", scenes: [hook, example(), example(), scene(), scene()] }, [DOC]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.scenes.filter((s) => s.sourceKind === "analogy")).toHaveLength(3);
    const chiffre = validateVideoScript({ title: "t", scenes: [{ ...hook, voiceover: "Warum trägt sie 4000 Tonnen? " + voice(10) }, scene(), scene()] }, [DOC]);
    expect(chiffre.dropped.some((d) => d.reason === "number_in_analogy")).toBe(true);
  });

  test("un récapitulatif en feuille devient une liste cochée ; une question au milieu redevient une feuille", () => {
    const r = validateVideoScript({ title: "t", scenes: [scene(), scene({ visual: undefined, visual_cues: ["ask_question"], heading: "Und warum?" }), scene({ bullets: ["Merke dir das"] })] }, [DOC]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes[1]).toMatchObject({ visual: "text", stage: "step" });
    expect(r.scenes[2]).toMatchObject({ visual: "recap", stage: "recap", visual_cues: ["check_recap"] });
  });

  test("le prompt impose les quatre temps dans l'ordre", () => {
    const p = buildVideoPrompt({ language: langOf("fr"), sources: [DOC], question: "", answer: "" }).system;
    const at = ["QUESTION MYSTÈRE", "EXPLICATION PAS À PAS", "EXEMPLE CONCRET", "RÉCAPITULATIF"].map((x) => p.indexOf(x));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});
