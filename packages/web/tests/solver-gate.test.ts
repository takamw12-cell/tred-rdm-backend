import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { needsSolver } from "../src/api/lib/precision";
import { computedResult, forcedSolverStep, givenNumbers, solverGateEnabled, solverGateStream, solverToolsFor } from "../src/api/lib/solver-gate";

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

  test("le second essai impose l'appel d'un solveur au premier pas", () => {
    const duty = 'RECHENPFLICHT …: passend hier: "physik_berechnen", "rechnen".';
    const tools = solverToolsFor(duty);
    expect(tools).toEqual(["physik_berechnen", "rechnen"]);
    expect(forcedSolverStep(0, tools)).toEqual({ toolChoice: "required", activeTools: ["physik_berechnen", "rechnen"] });
    // Ensuite, la boucle redevient libre pour expliquer.
    expect(forcedSolverStep(1, tools)).toBeNull();
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
    expect(src).toContain("forceSolverTools: solverToolsFor(duty)");
    const agent = readFileSync(join(import.meta.dir, "../src/api/agent/index.ts"), "utf8");
    expect(agent).toContain("forcedSolverStep(stepNumber, opts.forceSolverTools");
  });
});
