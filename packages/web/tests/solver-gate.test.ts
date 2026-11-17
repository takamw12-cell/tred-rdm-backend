import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import { NO_SOLVER_TOOL, detectSolverSkip, isLimitQuestion, mustCallToolFirst, needsSolver, solverDutyNote } from "../src/api/lib/precision";
import { computedResult, firstCallForce, forcedToolStep, givenNumbers, retryForce, solverGateEnabled, solverGateStream } from "../src/api/lib/solver-gate";

/** TM3 : la question de la capture (vitesse d'un avion, 120 km/h). */
const TM3 = "Ein Flugzeug fliegt mit 120 km/h. Wie groß ist seine Geschwindigkeit in m/s und welche Strecke legt es in 15 min zurück?";

type Chunk = { type: string; id?: string; delta?: string; toolName?: string; [k: string]: unknown };

/** Un faux flux de modèle : texte découpé en petits morceaux, comme en vrai. */
function fakeModel(parts: (string | { tool: string })[], onAbort?: () => void) {
  return (signal: AbortSignal) => {
    signal.addEventListener("abort", () => onAbort?.());
    const chunks: Chunk[] = [{ type: "start" }, { type: "start-step" }];
    let n = 0;
    for (const p of parts) {
      if (typeof p === "string") {
        const id = `t${n++}`;
        chunks.push({ type: "text-start", id });
        for (let i = 0; i < p.length; i += 7) chunks.push({ type: "text-delta", id, delta: p.slice(i, i + 7) });
        chunks.push({ type: "text-end", id });
      } else {
        chunks.push({ type: "tool-input-start", toolCallId: "c1", toolName: p.tool }, { type: "tool-input-available", toolCallId: "c1", toolName: p.tool, input: {} }, { type: "tool-output-available", toolCallId: "c1", output: { ok: true } });
      }
    }
    chunks.push({ type: "finish-step" }, { type: "finish" });
    return Promise.resolve(
      new ReadableStream<Chunk>({
        async pull(controller) {
          // Un consommateur qui a annulé ne reçoit plus rien.
          if (signal.aborted || chunks.length === 0) return controller.close();
          controller.enqueue(chunks.shift()!);
        },
      }),
    );
  };
}

async function drain(s: ReadableStream<Chunk>) {
  const out: Chunk[] = [];
  const r = s.getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) return out;
    out.push(value);
  }
}
const visibleText = (chunks: Chunk[]) => chunks.filter((c) => c.type === "text-delta").map((c) => c.delta).join("");

describe("TM3 — avion à 120 km/h : blocage dur sans solveur", () => {
  test("la question est reconnue comme un calcul", () => {
    expect(needsSolver(TM3)).toBe(true);
    expect(solverGateEnabled(TM3, false)).toBe(true);
  });

  test("le modèle calcule à la main : flux coupé AVANT le chiffre, message, puis solveur imposé", async () => {
    let aborted = false;
    let blockedWith = "";
    const handAnswer = fakeModel(["Gegeben: v = 120 km/h.\n", "Umrechnung: v = 120 / 3,6 = 33,3 m/s.\n", "Strecke: s = 30 km.\n"], () => (aborted = true));
    const forced = fakeModel([{ tool: "physik_berechnen" }, "Laut Löser: v = 33,33 m/s, s = 30 km.\n"]);
    const gate = solverGateStream<Chunk>({
      question: TM3,
      enabled: solverGateEnabled(TM3, false),
      locale: "fr",
      first: handAnswer,
      retry: forced,
      onBlocked: ({ excerpt }) => (blockedWith = excerpt),
    });
    const out = await drain(gate.stream);
    const shown = visibleText(out);

    // Le premier essai est arrêté (le modèle ne génère plus rien).
    expect(gate.blocked()).toBe(true);
    expect(aborted).toBe(true);
    expect(blockedWith).toContain("33,3");
    // Le chiffre calculé à la main n'a JAMAIS atteint le navigateur.
    const beforeNotice = shown.split("Je dois utiliser")[0];
    expect(beforeNotice).not.toContain("33,3");
    expect(beforeNotice).not.toContain("30 km");
    // La ligne de données (120 km/h, recopiée de la question) est passée.
    expect(shown).toContain("Gegeben: v = 120 km/h.");
    // Le message du brief, puis la réponse du second essai, qui appelle l'outil.
    expect(shown).toContain("Je dois utiliser le solveur pour garantir le résultat. Un instant…");
    expect(out.some((c) => c.type === "tool-input-available" && c.toolName === "physik_berechnen")).toBe(true);
    expect(shown).toContain("Laut Löser: v = 33,33 m/s");
    // Un seul début de message, chaque bloc de texte ouvert est fermé.
    expect(out.filter((c) => c.type === "start")).toHaveLength(1);
    const opened = out.filter((c) => c.type === "text-start").map((c) => c.id);
    const closed = out.filter((c) => c.type === "text-end").map((c) => c.id);
    expect(closed.sort()).toEqual(opened.sort());
  });

  test("le second essai n'offre que des solveurs, jusqu'au premier appel", () => {
    const duty = 'RECHENPFLICHT …: passend hier: "physik_berechnen", "rechnen".';
    const force = retryForce(duty);
    expect(force.tools).toEqual(["physik_berechnen", "rechnen"]);
    expect(forcedToolStep([], force)).toEqual({ toolChoice: "required", activeTools: ["physik_berechnen", "rechnen"] });
    // Ensuite, la boucle redevient libre pour expliquer.
    expect(forcedToolStep(["physik_berechnen"], force)).toBeNull();
  });

  test("le modèle appelle le solveur : rien n'est coupé, tout passe", async () => {
    const gate = solverGateStream<Chunk>({
      question: TM3,
      enabled: true,
      first: fakeModel(["Ansatz: v = s / t.\n", { tool: "physik_berechnen" }, "Ergebnis laut Löser: 33,33 m/s.\n"]),
      retry: () => {
        throw new Error("pas de second essai");
      },
    });
    const shown = visibleText(await drain(gate.stream));
    expect(gate.blocked()).toBe(false);
    expect(shown).toContain("Ansatz: v = s / t.");
    expect(shown).toContain("33,33 m/s");
  });

  test("question sans calcul : flux inchangé", async () => {
    const q = "Was ist der Unterschied zwischen Masse und Gewicht?";
    expect(solverGateEnabled(q, false)).toBe(false);
    const gate = solverGateStream<Chunk>({ question: q, enabled: false, first: fakeModel(["Die Masse ist 1 kg = 1000 g.\n"]), retry: () => Promise.reject(new Error("non")) });
    expect(visibleText(await drain(gate.stream))).toContain("1000 g");
  });

  test("détection : recopier une donnée ou écrire ΣF = 0 n'est pas calculer", () => {
    const given = givenNumbers(TM3);
    expect(computedResult("Gegeben: v = 120 km/h, t = 15 min", given)).toBeNull();
    expect(computedResult("$\\sum F_x = 0$", given)).toBeNull();
    expect(computedResult("v = 33,3 m/s", given)).not.toBeNull();
    expect(computedResult("$s = 30\\,\\mathrm{km}$", given)).not.toBeNull();
    expect(computedResult("$v = \\frac{120}{3{,}6}$ = 33{,}3", given)).not.toBeNull();
  });

  test("le verrou est branché dans la route du chat", () => {
    const src = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
    expect(src).toContain("solverGateStream({");
    expect(src).toContain('route: { ...route, thinking: "off" }');
    expect(src).toContain("forceTools: retryForce(duty),");
    const agent = readFileSync(join(import.meta.dir, "../src/api/agent/index.ts"), "utf8");
    expect(agent).toContain("forcedToolStep(");
    expect(agent).toContain("opts.forceTools,");
  });
});

describe("outil imposé dès le premier appel", () => {
  test("TM3 est une question technique : le premier pas est imposé", () => {
    expect(mustCallToolFirst({ text: TM3, domain: "physik" })).toBe(true);
    const step = forcedToolStep([], firstCallForce());
    expect(step?.toolChoice).toBe("required");
    expect(step?.activeTools).toContain("physik_berechnen");
    expect(step?.activeTools).toContain(NO_SOLVER_TOOL);
    // Ni dessin, ni mémoire, ni média avant le solveur.
    expect(step?.activeTools).not.toContain("skizze");
    expect(step?.activeTools).not.toContain("lernstand_melden");
  });

  test("une recherche dans le cours ne lève pas l'obligation ; un solveur ou la sortie honnête, si", () => {
    const force = firstCallForce();
    expect(forcedToolStep(["suche_in_unterlagen"], force)?.toolChoice).toBe("required");
    expect(forcedToolStep(["suche_in_unterlagen", "physik_berechnen"], force)).toBeNull();
    expect(forcedToolStep([NO_SOLVER_TOOL], force)).toBeNull();
    expect(forcedToolStep(["schaltplan_erfassen"], force)).toBeNull();
    expect(forcedToolStep([], undefined)).toBeNull();
  });

  test("pas d'obligation : salutation, question de concept, matière de méthode, pièce jointe", () => {
    expect(mustCallToolFirst({ text: "Hallo, wie geht's?" })).toBe(false);
    expect(mustCallToolFirst({ text: "Was ist der Unterschied zwischen Kraft und Moment?" })).toBe(false);
    expect(mustCallToolFirst({ text: "Wie hoch ist die Strafe nach § 242 StGB bei 3 Taten?", domain: "jura" as never })).toBe(false);
    expect(mustCallToolFirst({ text: TM3, domain: "physik", hasAttachments: true })).toBe(false);
  });

  test("la boucle d'outils du SDK envoie bien toolChoice « required » au PREMIER appel du modèle", async () => {
    const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
    const model = new MockLanguageModelV4({
      doGenerate: [
        { content: [{ type: "tool-call", toolCallId: "c1", toolName: "physik_berechnen", input: "{}" }], finishReason: { unified: "tool-calls", raw: undefined }, usage, warnings: [] },
        { content: [{ type: "text", text: "Laut Löser: 33,33 m/s." }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
      ] as never,
    });
    const force = firstCallForce();
    const noop = tool({ description: "x", inputSchema: z.object({}), execute: async () => ({ ok: true }) });
    const agent = new ToolLoopAgent({
      model,
      tools: { physik_berechnen: noop, [NO_SOLVER_TOOL]: noop, skizze: noop },
      stopWhen: [stepCountIs(4)],
      // La même règle que agent/index.ts.
      prepareStep: ({ steps }) => (forcedToolStep(steps.flatMap((st) => st.toolCalls.map((tc) => tc.toolName as string)), force) ?? {}) as never,
    });
    const result = await agent.generate({ prompt: TM3 });
    expect(result.text).toContain("Laut Löser");
    const [first, second] = model.doGenerateCalls;
    // 1er appel : outil OBLIGATOIRE, et le dessin n'est pas proposé.
    expect(first.toolChoice).toEqual({ type: "required" });
    const offered = (first.tools ?? []).map((t) => t.name);
    expect(offered).toContain("physik_berechnen");
    expect(offered).not.toContain("skizze");
    // 2e appel (après le solveur) : la boucle est libre, tous les outils reviennent.
    expect(second.toolChoice?.type ?? "auto").toBe("auto");
    expect((second.tools ?? []).map((t) => t.name)).toContain("skizze");
  });
});

describe("limites (x → 2) : aucun solveur, dit ouvertement", () => {
  const Q = "Berechne den Grenzwert von f(x) = x²/(x − 3) für x → 2.";

  test("reconnue, imposée, et la consigne nomme la sortie honnête", () => {
    expect(isLimitQuestion(Q)).toBe(true);
    expect(isLimitQuestion("lim x->2 (x^2)/(x-3)")).toBe(true);
    expect(isLimitQuestion("What is the speed limit here?")).toBe(false);
    expect(mustCallToolFirst({ text: Q, domain: "mathematik" })).toBe(true);
    const duty = solverDutyNote({ text: Q, domain: "mathematik" }) ?? "";
    expect(duty).toContain("GRENZWERT");
    expect(duty).toContain(`"${NO_SOLVER_TOOL}"`);
    expect(duty).toContain("OHNE Zahlenergebnis");
  });

  test("« 4/(−1) = −4 » calculé à la main est coupé avant l'écran", async () => {
    const gate = solverGateStream<Chunk>({
      question: Q,
      enabled: solverGateEnabled(Q, false),
      first: fakeModel([{ tool: NO_SOLVER_TOOL }, "Einsetzen ist erlaubt, weil der Nenner nicht null wird.\n", "Also: 4/(−1) = −4.\n"]),
      retry: fakeModel([{ tool: "rechnen" }, "Mit dem Rechner geprüft.\n"]),
    });
    const shown = visibleText(await drain(gate.stream));
    expect(gate.blocked()).toBe(true);
    expect(shown).toContain("Einsetzen ist erlaubt");
    expect(shown.split("Ich muss den Löser")[0]).not.toContain("−4");
  });
});

describe("le dessin n'est pas un résultat (faux blocages du 17 nov.)", () => {
  const Q = "Ein Balken der Länge 4 m trägt eine Kraft von 10 kN. Berechne die Lagerkräfte.";
  const SVG = '```svg\n<svg viewBox="0 0 400 300">\n<text x="155" y="80">F</text>\n<path d="M 248,195 L 300,200 l 5 5 m 3 0"/>\n</svg>\n```\n';

  test("un Freikörperbild en ```svg passe, puis le solveur est appelé : aucun blocage", async () => {
    const gate = solverGateStream<Chunk>({
      question: Q,
      enabled: true,
      first: fakeModel(["Zuerst das Freikörperbild:\n", SVG, { tool: "balkenstatik" }, "A = 5 kN.\n"]),
      retry: () => Promise.reject(new Error("pas de second essai")),
    });
    const shown = visibleText(await drain(gate.stream));
    expect(gate.blocked()).toBe(false);
    expect(shown).toContain('<path d="M 248,195 L 300,200');
  });

  test("balises brutes et code en ligne ne comptent pas non plus", () => {
    const given = givenNumbers(Q);
    expect(computedResult('<path d="M 248,195 L 300,200"/>', given)).not.toBeNull();
    // … mais le verrou lit la ligne sans ses balises :
    const { assertedText } = require("../src/api/lib/solver-gate");
    expect(computedResult(assertedText('<path d="M 248,195 L 300,200"/> <text x="155" y="80">F</text>'), given)).toBeNull();
    expect(computedResult(assertedText("Nutze `x = 12 m` als Beispiel"), given)).toBeNull();
  });

  test("le garde d'après coup ne signale plus un schéma", () => {
    expect(detectSolverSkip({ question: Q, toolNames: [], answer: `Hier das Freikörperbild.\n${SVG}\nWelche Lagerart hat A?` })).toBeNull();
    expect(detectSolverSkip({ question: Q, toolNames: [], answer: `${SVG}\nDie Lagerkraft ist A = 7 kN.` })).not.toBeNull();
  });

  test("un blocage ne s'écrit plus dans « Gemeldete Antworten »", () => {
    const src = readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8");
    const onBlocked = src.slice(src.indexOf("onBlocked:"), src.indexOf("});", src.indexOf("onBlocked:")));
    expect(onBlocked).toContain("console.warn(");
    expect(onBlocked).not.toContain("signaler(");
    expect(src).toContain("void resolveInternalGateReports();");
  });
});
