import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";
import { detectCollatzNumber, resolveFastPath, withFastPathResult } from "../src/api/lib/fast-path";
import { buildTutorAgent } from "../src/api/agent/index";
import { solverChartBlockFromPart } from "../src/web/lib/solver-charts";
import { createStreamTimer } from "../src/api/lib/chat-perf";

describe("Fast-path Collatz : détection", () => {
  test.each([
    ["Zeig mir die Collatz-Folge von 27 mit Diagramm.", "27"],
    ["Berechne die Collatz-Folge für 27", "27"],
    ["Collatz für n = 97", "97"],
    ["Montre-moi la suite de Collatz de 871", "871"],
    ["collatz 027", "27"],
    ["Syracuse 6", "6"],
  ])("%p → %p", (text, n) => {
    expect(detectCollatzNumber(text)).toBe(n);
  });

  test.each([
    "Was ist die Collatz-Vermutung?",
    "Erkläre mir Collatz",
    "Die 3n+1-Folge für 27", // pas le mot Collatz : chemin normal
    "27 ist ungerade, und Collatz?", // le nombre ne SUIT pas le mot
    "Collatz 0",
    "Collatz\n27", // retour à la ligne entre les deux
  ])("pas de fast-path : %p", (text) => {
    expect(detectCollatzNumber(text)).toBeNull();
  });

  test("hors limites (n > 10^15) : chemin normal", () => {
    expect(resolveFastPath("Collatz 99999999999999999")).toBeNull();
  });
});

describe("Fast-path Collatz : résultat", () => {
  const fast = resolveFastPath("Zeig mir die Collatz-Folge von 27 mit Diagramm.", () => "1234-5678")!;

  test("le solveur a tourné : 111 étapes, pic 9232", () => {
    expect(fast.toolName).toBe("solve_open_math");
    expect(fast.input).toEqual({ aufgabe: "collatz", n: "27" });
    expect(fast.output).toMatchObject({ ok: true, schritte: 111, maximum: "9232", maximum_bei_schritt: 77 });
    expect(fast.toolCallId).toBe("fast_12345678");
  });

  test("note pour le modèle : les chiffres, ne pas recalculer, pas de preuve — sans le graphique", () => {
    expect(fast.modelNote).toContain('"schritte":111');
    expect(fast.modelNote).toContain('"maximum":"9232"');
    expect(fast.modelNote).toContain("Rufe solve_open_math NICHT erneut auf");
    expect(fast.modelNote).toContain("KEIN BEWEIS");
    expect(fast.modelNote).not.toContain("diagramme");
  });

  const chunks = (list: UIMessageChunk[]) =>
    new ReadableStream<UIMessageChunk>({
      start(c) {
        for (const x of list) c.enqueue(x);
        c.close();
      },
    });
  const collect = async (s: ReadableStream<UIMessageChunk>) => {
    const out: UIMessageChunk[] = [];
    const r = s.getReader();
    for (;;) {
      const { done, value } = await r.read();
      if (done) return out;
      out.push(value);
    }
  };

  test("le résultat part juste après « start », avant tout token du modèle", async () => {
    const out = await collect(
      withFastPathResult(
        chunks([
          { type: "start" },
          { type: "start-step" },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Die Folge …" },
          { type: "text-end", id: "t" },
          { type: "finish-step" },
          { type: "finish" },
        ]),
        fast,
      ),
    );
    expect(out.map((c) => c.type)).toEqual([
      "start",
      "tool-input-available",
      "tool-output-available",
      "start-step",
      "text-start",
      "text-delta",
      "text-end",
      "finish-step",
      "finish",
    ]);
  });

  test("côté navigateur : une partie d'outil solve_open_math → le graphique, avant le texte", async () => {
    const stream = withFastPathResult(
      chunks([
        { type: "start", messageId: "m1" },
        { type: "start-step" },
        { type: "text-start", id: "t" },
        { type: "text-delta", id: "t", delta: "Erklärung" },
        { type: "text-end", id: "t" },
        { type: "finish-step" },
        { type: "finish" },
      ]),
      fast,
    );
    let last: UIMessage | undefined;
    for await (const m of readUIMessageStream({ stream })) last = m;
    const tool = last!.parts.find((p) => p.type === "tool-solve_open_math") as { state: string } | undefined;
    expect(tool?.state).toBe("output-available");
    expect(last!.parts.findIndex((p) => p.type === "tool-solve_open_math")).toBeLessThan(last!.parts.findIndex((p) => p.type === "text"));
    const block = solverChartBlockFromPart(tool);
    expect(block).toContain("111 Schritte, Maximum 9232");
  });

  test("la mesure [perf] voit le graphique comme premier signe de vie", () => {
    let t = 0;
    const timer = createStreamTimer(0, () => t);
    t = 450;
    timer.observe('data: {"type":"tool-input-available","toolCallId":"fast_1","toolName":"solve_open_math"}\n\n');
    expect(timer.marks().firstActivityMs).toBe(450);
  });

  test("agent : la note arrive en dernier message système ; le bloc en cache ne change pas", () => {
    type Instr = { settings: { instructions: { content: string }[]; tools?: unknown }; tools: Record<string, unknown> };
    const plain = buildTutorAgent({ sources: [], locale: "de" }) as unknown as Instr;
    const withNote = buildTutorAgent({ sources: [], locale: "de", precomputedNote: fast.modelNote }) as unknown as Instr;
    const instr = withNote.settings.instructions;
    expect(instr.at(-1)!.content).toBe(fast.modelNote);
    expect(instr[0].content).toBe(plain.settings.instructions[0].content);
    // tous les outils restent déclarés (préfixe du cache identique)
    expect(Object.keys(withNote.tools)).toEqual(Object.keys(plain.tools));
  });

  test("câblage : route du chat, réflexion coupée, pas de graphique en double", () => {
    const api = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
    expect(api).toContain("const fast = resolveFastPath(lastUserText);");
    expect(api).toContain('thinking: "off" as const, reason: `fast-path ${fast.name}`');
    expect(api).toContain("stream: fast ? withFastPathResult(uiStream, fast) : uiStream,");
    const chat = readFileSync(join(import.meta.dir, "../src/web/pages/chat.tsx"), "utf8");
    expect(chat).toContain("if (seenCharts.has(chart)) return \"\";");
  });
});
