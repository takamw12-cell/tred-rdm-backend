import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildTutorAgent } from "../src/api/agent/index";
import { withConversationCacheBreakpoint } from "../src/api/agent/prompt-cache";
import { HAIKU, routeChat, SONNET } from "../src/api/lib/chat-routing";
import { createStreamTimer, lastUserHasAttachment, perfLine } from "../src/api/lib/chat-perf";
import { detectDomain } from "../src/api/lib/solvers/domain";
import { chatPhase, PHASE_KEY } from "../src/web/lib/chat-phase";
import { de } from "../src/web/i18n/messages/de";
import { en } from "../src/web/i18n/messages/en";
import { fr } from "../src/web/i18n/messages/fr";
import { es } from "../src/web/i18n/messages/es";

const route = (text: string, extra: Partial<Parameters<typeof routeChat>[0]> = {}) =>
  routeChat({ text, domain: detectDomain(text).domain, ...extra });

describe("Routage : modèle et raisonnement selon la question", () => {
  test.each([
    "Hallo!",
    "Danke dir",
    "Merci beaucoup",
    "Wer bist du?",
    "Bonjour",
    "ok super",
  ])("smalltalk → Haiku, sans raisonnement : %p", (text) => {
    expect(route(text)).toMatchObject({ tier: "smalltalk", modelId: HAIKU, thinking: "off" });
  });

  test.each([
    "Qu'est-ce que la RDM ?",
    "Explique la loi d'Ohm",
    "Was ist ein Biegemoment?",
    "Was ist eine Ableitung?",
    "Warum?",
    "Hallo, was ist ein Fachwerk?", // salutation + matière → Sonnet
  ])("concept → Sonnet, sans raisonnement : %p", (text) => {
    expect(route(text)).toMatchObject({ tier: "concept", modelId: SONNET, thinking: "off" });
  });

  test.each([
    ["Résous ce système hyperstatique", "verbe de calcul"],
    ["Berechne die Auflagerkräfte", "verbe de calcul"],
    ["Ein Balken mit 4 m und 10 kN", "grandeur avec unité"],
    ["Und mit F = 20 kN?", "formule"],
    ["σ = F/A, wie groß ist σ?", "formule"],
    ["Netzadresse von 192.168.1.130", "adresse IP"],
    ["Wie kommt man auf M_max?", "formule"],
    ["Erkläre Schritt für Schritt den Ritterschnitt", "sujet d'exercice"],
  ])("complex → Sonnet + raisonnement : %p (%p)", (text, reason) => {
    expect(route(text)).toMatchObject({ tier: "complex", modelId: SONNET, thinking: "adaptive", reason });
  });

  test("pièce jointe, examen, mode code, ≥ 50 mots : toujours complex", () => {
    expect(route("Hallo", { hasAttachments: true }).tier).toBe("complex");
    expect(route("Was ist ein Lager?", { examMode: true }).tier).toBe("complex");
    expect(route("Was ist ein Lager?", { calcMode: true }).tier).toBe("complex");
    expect(route(Array.from({ length: 50 }, () => "Wort").join(" ")).tier).toBe("complex");
  });
});

describe("Cache : le bloc système fixe ne dépend plus de la question", () => {
  type Instr = { content: string; providerOptions?: { anthropic?: { cacheControl?: { type: string; ttl?: string } } } };
  const instructionsOf = (a: unknown) => (a as { settings: { instructions: Instr[] } }).settings.instructions;
  const base = {
    locale: "de",
    inventory: [{ title: "TM1 Skript", kind: "vorlesung", pageCount: 120 }],
    contextLabel: "TM1",
    search: () => [],
  };
  const q1 = buildTutorAgent({ ...base, sources: [{ title: "TM1 Skript", kind: "vorlesung", content: "Kapitel 3: Lagerreaktionen …" }] });
  const q2 = buildTutorAgent({
    ...base,
    sources: [{ title: "Übung 4", kind: "uebung", content: "Aufgabe 2: Fachwerk mit Ritterschnitt …" }],
    memory: { open: [{ label: "Vorzeichen der Querkraft", topic: "TM1", timesSeen: 2, lastSeen: new Date() }], note: async () => {}, resolve: async () => {} },
    studentName: "Lena",
  });

  test("deux questions, extraits/mémoire/nom différents → premier bloc identique au caractère près", () => {
    expect(instructionsOf(q1)[0].content).toBe(instructionsOf(q2)[0].content);
  });

  test("le premier bloc porte le cache (1 h) ; les extraits viennent après, hors du bloc", () => {
    const [fixed, ...rest] = instructionsOf(q2);
    expect(fixed.providerOptions?.anthropic?.cacheControl).toEqual({ type: "ephemeral", ttl: "1h" });
    expect(fixed.content).not.toContain("Aufgabe 2: Fachwerk");
    expect(fixed.content).not.toContain("Lena");
    expect(fixed.content).not.toContain("Vorzeichen der Querkraft");
    const after = rest.map((r) => r.content).join("\n");
    expect(after).toContain("Aufgabe 2: Fachwerk");
    expect(after).toContain("Lena");
    expect(after).toContain("Vorzeichen der Querkraft");
    expect(after).toContain("--- KURSUNTERLAGEN (TM1) ---");
  });

  test("la taille du préfixe mis en cache (mesure)", () => {
    const chars = instructionsOf(q1)[0].content.length;
    // ≈ 3,5 caractères par token pour ce texte allemand : largement au-dessus
    // du minimum de cache d'Anthropic (1 024 tokens Sonnet, 4 096 Haiku).
    expect(chars / 3.5).toBeGreaterThan(4096);
  });

  test("second point de cache sur le dernier message, sans toucher l'original", () => {
    const msgs = [
      { role: "user" as const, content: "Frage 1" },
      { role: "assistant" as const, content: "Antwort" },
      { role: "user" as const, content: "Frage 2" },
    ];
    const out = withConversationCacheBreakpoint(msgs);
    expect(out[2].providerOptions?.anthropic).toEqual({ cacheControl: { type: "ephemeral" } });
    expect(out[0].providerOptions).toBeUndefined();
    expect((msgs[2] as { providerOptions?: unknown }).providerOptions).toBeUndefined();
    expect(withConversationCacheBreakpoint([])).toEqual([]);
  });

  test("routage appliqué à l'agent : modèle et raisonnement", () => {
    const fast = buildTutorAgent({ sources: [], locale: "de", route: { modelId: HAIKU, thinking: "off" } }) as unknown as {
      settings: { model: { modelId: string }; providerOptions: Record<string, unknown> };
    };
    expect(fast.settings.model.modelId).toBe("claude-haiku-4-5");
    expect(fast.settings.providerOptions).toEqual({});
    const deep = buildTutorAgent({ sources: [], locale: "de" }) as unknown as typeof fast;
    expect(deep.settings.model.modelId).toBe("claude-sonnet-4-6");
    expect(deep.settings.providerOptions).toEqual({ anthropic: { thinking: { type: "adaptive", display: "summarized" } } });
  });

  test("les solveurs restent disponibles quel que soit le modèle", () => {
    const fast = buildTutorAgent({ sources: [], locale: "de", route: { modelId: HAIKU, thinking: "off" } }) as unknown as { tools: Record<string, unknown> };
    for (const t of ["rechnen", "balkenstatik", "thermo_berechnen", "physik_berechnen", "solve_cyber", "solve_ai"]) {
      expect(Object.keys(fast.tools)).toContain(t);
    }
  });
});

describe("Mesure [perf]", () => {
  test("premier signe de vie et premier mot, depuis l'arrivée de la requête", () => {
    let t = 1000;
    const timer = createStreamTimer(1000, () => t);
    t = 1200;
    timer.observe('data: {"type":"start"}\n\n');
    t = 1500;
    timer.observe('data: {"type":"reasoning-start","id":"r"}\n\n');
    t = 4000;
    timer.observe('data: {"type":"text-delta","id":"t","delta":"Hallo"}\n\n');
    t = 9000;
    timer.observe('data: {"type":"text-delta","id":"t","delta":"!"}\n\n');
    expect(timer.marks()).toEqual({ firstActivityMs: 500, firstTextMs: 3000 });
  });

  test("ligne de log : chiffres, pas de contenu", () => {
    const line = perfLine({
      route: { tier: "concept", modelId: SONNET, thinking: "off", reason: "question courte sans calcul" },
      marks: { firstActivityMs: 1800, firstTextMs: 1800 },
      totalMs: 9100,
      usage: { steps: 1, input: 11000, cacheRead: 8800, cacheWrite: 0, output: 600 },
      aborted: false,
    });
    expect(line).toBe(
      '[perf] tier=concept model=claude-sonnet-4.6 thinking=off reason="question courte sans calcul" first_activity=1800ms' +
        " first_text=1800ms total=9100ms steps=1 in=11000tok cache_read=8800tok cache_write=0tok out=600tok aborted=no",
    );
  });

  test("pièce jointe détectée sur la dernière question seulement", () => {
    expect(lastUserHasAttachment([{ role: "user", parts: [{ type: "text" }, { type: "file" }] }])).toBe(true);
    expect(lastUserHasAttachment([{ role: "user", parts: [{ type: "file" }] }, { role: "assistant", parts: [] }, { role: "user", parts: [{ type: "text" }] }])).toBe(false);
  });

  test("câblage dans la route du chat", () => {
    const api = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
    expect(api).toContain("const route = routeChat({");
    expect(api).toContain("console.log(perfLine({");
    expect(api).toMatch(/buildTutorAgent\(\{\n\s+route,/);
  });
});

describe("Indicateur d'étape dans le chat", () => {
  test.each([
    [[], "analyse"],
    [[{ type: "step-start" }], "analyse"],
    [[{ type: "reasoning" }], "reasoning"],
    [[{ type: "tool-suche_in_unterlagen", state: "input-available" }], "search"],
    [[{ type: "tool-balkenstatik", state: "input-streaming" }], "solve"],
    [[{ type: "tool-solve_cyber", state: "input-available" }], "solve"],
    [[{ type: "tool-recherche_connaissances_externes", state: "input-available" }], "research"],
    [[{ type: "tool-skizze", state: "input-available" }], "draw"],
    [[{ type: "tool-rechnen", state: "output-available" }], "write"],
    [[{ type: "dynamic-tool", toolName: "thermo_berechnen", state: "input-available" }], "solve"],
  ])("%j → %p", (parts, phase) => {
    expect(chatPhase(parts as never)).toBe(phase as never);
  });

  test("textes dans les 4 langues complètes", () => {
    for (const pack of [de, en, fr, es]) {
      for (const key of Object.values(PHASE_KEY)) {
        const k = key.split(".")[1] as keyof typeof de.chat;
        expect(String(pack.chat[k] ?? "")).not.toBe("");
      }
    }
    expect(de.chat.phaseAnalyse).toBe("TRED analysiert deine Frage …");
    expect(de.chat.phaseSearch).toBe("Ich suche in deinen Dokumenten …");
    expect(de.chat.phaseSolve).toBe("Ich berechne die Lösung …");
  });
});
