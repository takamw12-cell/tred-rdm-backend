import { describe, expect, test } from "bun:test";
import { edgeVoiceFor, EDGE_VOICES, enginePython, parseEdgeSegments, parseEngineLine, voiceProvider } from "../src/api/lib/video-engine";
import { videoJobView } from "../src/api/lib/queue";
import { videoRequestSchema, type VoiceWord } from "../src/api/lib/video-script";
import { buildSrt, buildStoryboard, buildVtt, CANVAS, cleanSketch, drawableTex, drawSeconds, fitSize, flowchartElements, layoutScene, sketchPromptBlock, type SketchElement } from "../src/api/lib/video-storyboard";

const el = (over: Partial<SketchElement>): SketchElement => ({ kind: "line", points: [[200, 400], [900, 400]], r: 0, ry: 0, text: "", color: "ink", fill: false, closed: false, word: 0, ...over });
const allowed = new Set(["12", "3.5"]);

/** Dix mots par seconde, à partir de `from` ms. */
const speak = (n: number, from = 0): VoiceWord[] => Array.from({ length: n }, (_, i) => ({ text: `w${i}`, startMs: from + i * 100, endMs: from + i * 100 + 80 }));

describe("croquis du modèle : contrôle", () => {
  test("garde les formes simples et bien placées", () => {
    const { placed, dropped } = cleanSketch(
      [
        el({}),
        el({ kind: "arrow", points: [[400, 300], [400, 500]], color: "red", word: 4 }),
        el({ kind: "circle", points: [[800, 500]], r: 80 }),
        el({ kind: "rect", points: [[900, 600], [600, 300]], fill: true }),
        el({ kind: "label", points: [[800, 700]], text: "  Kraft   F  " }),
        el({ kind: "symbol", points: [[500, 250]], text: "$F_1$" }),
      ],
      allowed,
    );
    expect(dropped).toEqual([]);
    expect(placed.map((p) => p.el.kind)).toEqual(["line", "arrow", "circle", "rect", "text", "formula"]);
    // Le rectangle donné par deux coins quelconques est remis dans l'ordre.
    expect(placed[3]!.el).toMatchObject({ corner: [600, 300], w: 300, h: 300, fill: true });
    expect(placed[4]!.el.text).toBe("Kraft F");
    expect(placed[5]!.el.tex).toBe("F_1");
    expect(placed[1]!.word).toBe(4);
  });

  test("retire un tracé qui porte un nombre absent des sources", () => {
    const { placed, dropped } = cleanSketch([el({ kind: "label", points: [[800, 500]], text: "F = 42 kN" }), el({ kind: "label", points: [[800, 600]], text: "q = 3,5" }), el({ kind: "symbol", points: [[800, 700]], text: "x^2" })], allowed);
    expect(dropped).toEqual(["number_not_in_sources"]);
    // « 3,5 » est dans les sources ; l'exposant 2 est structurel.
    expect(placed).toHaveLength(2);
  });

  test("retire les points hors de la toile, les formes dégénérées et le LaTeX douteux", () => {
    const { placed, dropped } = cleanSketch(
      [
        el({ points: [[200, 400], [9000, 400]] }),
        el({ points: [[200, 400], [203, 401]] }),
        el({ kind: "circle", points: [[800, 500]], r: 0 }),
        el({ kind: "symbol", points: [[800, 500]], text: "\\input{/etc/passwd}%" }),
        el({ kind: "label", points: [[800, 500]], text: "   " }),
        el({ kind: "curve", points: [[100, 300], [200, 400]] }),
      ],
      allowed,
    );
    expect(placed).toEqual([]);
    expect(dropped).toEqual(["bad_points", "bad_points", "bad_size", "bad_tex", "empty_text", "bad_points"]);
  });

  test("au plus 14 tracés, ramenés dans la toile", () => {
    const many = Array.from({ length: 30 }, () => el({ points: [[-20, 880], [1630, 200]] }));
    const { placed } = cleanSketch(many, allowed);
    expect(placed).toHaveLength(14);
    expect(placed[0]!.el.from).toEqual([20, 880]);
    expect(placed[0]!.el.to).toEqual([CANVAS.w - 20, 200]);
  });
});

describe("mise en page par le code", () => {
  const scene = { heading: "Hebelgesetz", bullets: [], steps: [], formula: "", visual: "text", voiceover: "eins zwei drei", sketch: [] as SketchElement[] };

  test("un enchaînement d'étapes : une case, une étiquette et une flèche par étape", () => {
    const flow = flowchartElements(["Last", "Biegemoment", "Spannung"]);
    expect(flow.filter((p) => p.el.kind === "rect")).toHaveLength(3);
    expect(flow.filter((p) => p.el.kind === "arrow")).toHaveLength(2);
    expect(flow.filter((p) => p.el.kind === "text").map((p) => p.el.text)).toEqual(["Last", "Biegemoment", "Spannung"]);
    // Tout tient dans la toile, et les cases arrivent dans l'ordre.
    for (const p of flow) if (p.el.kind === "rect") expect(p.el.corner![0] >= 0 && p.el.corner![0] + p.el.w! <= CANVAS.w).toBe(true);
    const fracs = flow.filter((p) => p.el.kind === "rect").map((p) => p.frac!);
    expect([...fracs].sort((a, b) => a - b)).toEqual(fracs);
    expect(flowchartElements(["seul"])).toEqual([]);
  });

  test("six étapes passent sur deux rangées", () => {
    const flow = flowchartElements(["a", "b", "c", "d", "e", "f"]);
    const ys = new Set(flow.filter((p) => p.el.kind === "rect").map((p) => p.el.corner![1]));
    expect(ys.size).toBe(2);
  });

  test("le croquis du modèle est gardé s'il reste un vrai schéma, sinon la mise en page sûre", () => {
    const good = layoutScene({ ...scene, sketch: [el({}), el({ kind: "circle", points: [[800, 500]], r: 60 })] }, allowed);
    expect(good.placed.some((p) => p.el.kind === "circle")).toBe(true);
    // Titre écrit et souligné, toujours.
    expect(good.placed[0]!.el).toMatchObject({ kind: "text", text: "Hebelgesetz" });

    const poor = layoutScene({ ...scene, formula: "\\sigma = \\frac{M}{W}", bullets: ["Moment wächst", "Widerstand zählt"], sketch: [el({ kind: "label", points: [[800, 500]], text: "F = 999" })] }, allowed);
    expect(poor.sketchDropped).toEqual(["number_not_in_sources"]);
    expect(poor.placed.some((p) => p.el.kind === "formula" && p.el.tex === "\\sigma = \\frac{M}{W}")).toBe(true);
    expect(poor.placed.filter((p) => p.el.kind === "text").map((p) => p.el.text)).toContain("Moment wächst");
  });

  test("question mystère, étapes et récapitulatif ne passent jamais par le croquis du modèle", () => {
    const sketch = [el({}), el({ kind: "circle", points: [[800, 500]], r: 60 })];
    const hook = layoutScene({ ...scene, heading: "Warum bricht der Balken in der Mitte?", visual: "question", sketch }, allowed);
    expect(hook.placed.some((p) => p.el.kind === "circle")).toBe(false);
    expect(hook.placed.some((p) => p.el.text === "?")).toBe(true);
    const recap = layoutScene({ ...scene, visual: "recap", bullets: ["Eins", "Zwei"], sketch }, allowed);
    expect(recap.placed.filter((p) => p.el.kind === "polyline" && p.el.color === "green")).toHaveLength(2);
  });

  test("une formule que le moteur ne sait pas écrire n'est pas envoyée", () => {
    expect(drawableTex("$$F = m \\cdot a$$")).toBe("F = m \\cdot a");
    expect(drawableTex("a = b \\\\ c = d")).toBe("a = b");
    expect(drawableTex("\\text{Kraft} = \\left( m a \\right)")).toBe("\\mathrm{Kraft} = ( m a )");
    expect(drawableTex("σ = M / W")).toBeNull();
    expect(drawableTex("x".repeat(200))).toBeNull();
  });

  test("un texte long rétrécit pour tenir", () => {
    expect(fitSize("kurz", 1320, 50)).toBe(50);
    expect(fitSize("x".repeat(58), 1320, 50)).toBeLessThan(40);
    expect(fitSize("x".repeat(500), 300, 50)).toBe(20);
  });
});

describe("calage sur la voix", () => {
  test("chaque tracé commence au mot dit, dans sa scène, et s'efface avant la suivante", () => {
    const words = [...speak(20, 0), ...speak(30, 3000)];
    const sb = buildStoryboard({
      style: "whiteboard",
      scenes: [
        { wordCount: 20, placed: [{ el: { kind: "line", color: "ink", from: [200, 400], to: [900, 400] }, word: 0 }, { el: { kind: "arrow", color: "red", from: [400, 300], to: [400, 500] }, word: 10 }] },
        { wordCount: 30, placed: [{ el: { kind: "circle", color: "ink", center: [800, 500], r: 80 }, word: 15 }] },
      ],
      words,
      ranges: [{ from: 0, to: 20 }, { from: 20, to: 50 }],
      sceneStartsMs: [0, 3000],
      durationMs: 7500,
    });
    expect(sb.duration).toBe(7.5);
    const [line, arrow, circle] = sb.elements;
    expect(line!.at).toBe(0);
    expect(arrow!.at).toBe(1); // le mot 10 est dit à 1 000 ms
    expect(circle!.at).toBe(4.5); // le mot 15 de la scène 2 : 3 000 + 1 500 ms
    // Scène 1 : tout est effacé avant 3 s. Dernière scène : le dessin reste.
    expect(line!.until).toBe(2.5);
    expect(arrow!.at + arrow!.dur).toBeLessThanOrEqual(2.5);
    expect(circle!.until).toBeUndefined();
    expect([line!.group, arrow!.group, circle!.group]).toEqual([0, 0, 1]);
  });

  test("le numéro du mot vient du texte, les instants de la voix : une langue sans espaces se cale quand même", () => {
    // Le script compte 4 « mots », la voix en a rendu 40 (chinois, japonais).
    const sb = buildStoryboard({
      style: "cinematic",
      scenes: [{ wordCount: 4, placed: [{ el: { kind: "line", color: "ink", from: [200, 400], to: [900, 400] }, word: 2 }] }],
      words: speak(40),
      ranges: [{ from: 0, to: 40 }],
      sceneStartsMs: [0],
      durationMs: 6000,
    });
    expect(sb.elements[0]!.at).toBe(2); // la moitié de la scène parlée
  });

  test("les tracés d'une scène trop courte restent dans la scène, sans se chevaucher au départ", () => {
    const placed = Array.from({ length: 8 }, (_, i) => ({ el: { kind: "line" as const, color: "ink" as const, from: [200, 300 + i * 50] as [number, number], to: [1200, 300 + i * 50] as [number, number] }, word: 0 }));
    const sb = buildStoryboard({ style: "whiteboard", scenes: [{ wordCount: 5, placed }, { wordCount: 5, placed: [] }], words: speak(10, 0), ranges: [{ from: 0, to: 5 }, { from: 5, to: 10 }], sceneStartsMs: [0, 2000], durationMs: 4000 });
    expect(sb.elements.length).toBeGreaterThan(0);
    for (const e of sb.elements) {
      expect(e.at).toBeGreaterThanOrEqual(0);
      expect(e.at + e.dur).toBeLessThanOrEqual(1.5 + 0.001);
      expect(e.dur).toBeGreaterThanOrEqual(0.15);
    }
    const ats = sb.elements.map((e) => e.at);
    expect([...ats].sort((a, b) => a - b)).toEqual(ats);
  });

  test("le temps de tracé suit la longueur", () => {
    const short = drawSeconds({ kind: "line", color: "ink", from: [0, 0], to: [100, 0] });
    const long = drawSeconds({ kind: "line", color: "ink", from: [0, 0], to: [900, 0] });
    expect(long).toBeGreaterThan(short);
    expect(drawSeconds({ kind: "text", color: "ink", text: "x".repeat(60) })).toBeLessThanOrEqual(1.8);
  });
});

describe("sous-titres", () => {
  test("SRT : 7 mots au plus, coupés aux silences, sans chevauchement", () => {
    const words: VoiceWord[] = [...speak(9, 0), ...speak(3, 2000)];
    const srt = buildSrt(words);
    const blocks = srt.trim().split("\n\n");
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe("1\n00:00:00,000 --> 00:00:00,700\nw0 w1 w2 w3 w4 w5 w6");
    expect(blocks[2]!.startsWith("3\n00:00:02,000 --> ")).toBe(true);
    // Un mot ne peut pas fabriquer une ligne de minutage.
    expect(buildSrt([{ text: "a --> b\n9", startMs: 0, endMs: 100 }])).toContain("a → b 9");
    expect(buildVtt(words).startsWith("WEBVTT\n\n1\n00:00:00.000 --> 00:00:00.700\n")).toBe(true);
  });
});

describe("moteur : réglages et protocole", () => {
  test("sans interpréteur, rien n'est proposé ; Edge-TTS seulement sur décision explicite", () => {
    expect(enginePython({})).toBeNull();
    expect(enginePython({ VIDEO_ENGINE_PYTHON: " /opt/x/python " })).toBe("/opt/x/python");
    expect(voiceProvider({})).toBe("elevenlabs");
    expect(voiceProvider({ VIDEO_VOICE_PROVIDER: "edge" })).toBe("elevenlabs");
    expect(voiceProvider({ VIDEO_VOICE_PROVIDER: "Edge", VIDEO_ENGINE_PYTHON: "python" })).toBe("edge");
  });

  test("une voix par langue de l'interface, remplaçable par une variable bien formée", () => {
    for (const lang of ["de", "en", "fr", "es", "it", "pt", "ru", "ar", "hi", "bn", "ja", "zh"]) expect(EDGE_VOICES[lang]).toMatch(/Neural$/);
    expect(edgeVoiceFor("de", {})).toBe("de-DE-TanjaNeural");
    expect(edgeVoiceFor("de", { EDGE_TTS_VOICE_DE: "de-DE-ChristophNeural" })).toBe("de-DE-ChristophNeural");
    expect(edgeVoiceFor("de", { EDGE_TTS_VOICE_DE: "x; rm -rf /" })).toBe("de-DE-TanjaNeural");
    expect(edgeVoiceFor("xx", {})).toBeNull();
  });

  test("la sortie du moteur est lue strictement", () => {
    expect(parseEngineLine('{"progress": 0.4}')).toEqual({ progress: 0.4 });
    expect(parseEngineLine("Glyph not found")).toBeNull();
    expect(parseEngineLine("[1, 2]")).toBeNull();
    const ok = parseEdgeSegments({ ok: true, segments: [{ start_ms: 0, end_ms: 900, words: [{ text: "Eins", start_ms: 100, end_ms: 300 }] }, { start_ms: 900, end_ms: 2000, words: [{ text: "Zwei", start_ms: 1000, end_ms: 1300 }, { text: "Drei", start_ms: 1400, end_ms: 1700 }] }] }, 2);
    expect(ok).toEqual({ words: [{ text: "Eins", startMs: 100, endMs: 300 }, { text: "Zwei", startMs: 1000, endMs: 1300 }, { text: "Drei", startMs: 1400, endMs: 1700 }], ranges: [{ from: 0, to: 1 }, { from: 1, to: 3 }], sceneStartsMs: [0, 900], endMs: 2000 });
    // Une scène de moins que prévu, une scène muette, un champ du mauvais type : refusé.
    expect(parseEdgeSegments({ ok: true, segments: [] }, 2)).toBeNull();
    expect(parseEdgeSegments({ ok: true, segments: [{ start_ms: 0, end_ms: 900, words: [] }] }, 1)).toBeNull();
    expect(parseEdgeSegments({ ok: true, segments: [{ start_ms: "0", end_ms: 900, words: [{ text: "a", start_ms: 1, end_ms: 2 }] }] }, 1)).toBeNull();
    expect(parseEdgeSegments({ ok: false, error: "voice_failed" }, 1)).toBeNull();
  });

  test("l'avancement public suit le dessin puis l'assemblage", () => {
    expect(videoJobView("voice").progress).toBe(70);
    expect(videoJobView("drawing").progress).toBe(75);
    expect(videoJobView("drawing:50").progress).toBe(85);
    expect(videoJobView("assembly").progress).toBe(97);
    expect(videoJobView("done")).toEqual({ status: "done", progress: 100 });
  });

  test("la requête n'accepte que les deux styles connus", () => {
    expect(videoRequestSchema.parse({ language: "de", style: "whiteboard" }).style).toBe("whiteboard");
    expect(videoRequestSchema.parse({ language: "de" }).style).toBeUndefined();
    expect(videoRequestSchema.safeParse({ language: "de", style: "comic" }).success).toBe(false);
  });

  test("la consigne interdit les mots à l'écran dans les langues que la police ne sait pas écrire", () => {
    expect(sketchPromptBlock("whiteboard", "de")).not.toContain("AUCUN mot");
    expect(sketchPromptBlock("cinematic", "ja")).toContain("AUCUN mot");
  });
});
