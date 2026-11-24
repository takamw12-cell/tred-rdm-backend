import { describe, expect, test } from "bun:test";
import { reasoningWatchdog } from "../src/api/lib/reasoning-watchdog";
import { routeChat } from "../src/api/lib/chat-routing";

/**
 * Incident du 24 nov. 2026 : une photo d'exercice (schéma tourné de 90°)
 * jointe à « Löse Aufgabe 13 ». Le modèle a raisonné 840 s puis 899 s sans
 * écrire un mot ni appeler un outil ; Railway a coupé à 15 minutes. Rejoué en
 * local avec la même photo : raisonnement sans fin, même plafonné. Sans
 * raisonnement étendu : premier mot après 3 s.
 */

type Chunk = { type: string; id?: string; delta?: string; toolName?: string };

/** Un faux flux : chaque paquet part après `gapMs`. `endless` = du raisonnement pour toujours. */
function fake(chunks: Chunk[], opts: { gapMs?: number; endless?: boolean; onAbort?: () => void } = {}) {
  return (signal: AbortSignal) => {
    signal.addEventListener("abort", () => opts.onAbort?.());
    const queue = [...chunks];
    return Promise.resolve(
      new ReadableStream<Chunk>({
        async pull(controller) {
          await new Promise((r) => setTimeout(r, opts.gapMs ?? 0));
          if (signal.aborted) return controller.close();
          const next = queue.shift();
          if (next) return controller.enqueue(next);
          if (opts.endless) return controller.enqueue({ type: "reasoning-delta", id: "0", delta: "hm " });
          controller.close();
        },
      }),
    );
  };
}

async function collect(stream: ReadableStream<Chunk>): Promise<Chunk[]> {
  const out: Chunk[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const ANSWER: Chunk[] = [
  { type: "start" },
  { type: "start-step" },
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", delta: "Ich lese das Bild." },
  { type: "text-end", id: "t" },
  { type: "finish-step" },
  { type: "finish" },
];

describe("un raisonnement qui ne conclut pas est coupé et relancé sans raisonnement", () => {
  test("raisonnement sans fin : coupé au délai, la relance répond, le flux reste bien formé", async () => {
    let aborted = false;
    let reported = 0;
    const stream = reasoningWatchdog<Chunk>({
      maxMs: 60,
      first: fake([{ type: "start" }, { type: "start-step" }, { type: "reasoning-start", id: "0" }], { gapMs: 5, endless: true, onAbort: () => (aborted = true) }),
      fallback: fake(ANSWER),
      onTimeout: () => (reported += 1),
    });
    const types = (await collect(stream)).map((c) => c.type);

    expect(aborted).toBe(true);
    expect(reported).toBe(1);
    // Un seul « start » ; le raisonnement et l'étape ouverts sont refermés avant la relance.
    expect(types.filter((t) => t === "start")).toHaveLength(1);
    const end = types.indexOf("reasoning-end");
    expect(end).toBeGreaterThan(0);
    expect(types[end + 1]).toBe("finish-step");
    expect(types.slice(end + 2)).toEqual(["start-step", "text-start", "text-delta", "text-end", "finish-step", "finish"]);
  });

  test("réponse normale : rien n'est coupé, la relance n'est jamais construite", async () => {
    let built = false;
    const stream = reasoningWatchdog<Chunk>({
      maxMs: 60,
      first: fake([{ type: "start" }, { type: "start-step" }, { type: "reasoning-start", id: "0" }, { type: "reasoning-delta", id: "0", delta: "kurz" }, { type: "reasoning-end", id: "0" }, ...ANSWER.slice(2)]),
      fallback: (signal) => {
        built = true;
        return fake(ANSWER)(signal);
      },
    });
    const types = (await collect(stream)).map((c) => c.type);
    expect(built).toBe(false);
    expect(types.at(-1)).toBe("finish");
    expect(types).toContain("text-delta");
  });

  test("après le premier mot ou le premier outil, le délai ne s'applique plus", async () => {
    let built = false;
    const slow: Chunk[] = [{ type: "start" }, { type: "start-step" }, { type: "tool-input-start", toolName: "schaltplan_erfassen" }, ...Array.from({ length: 40 }, () => ({ type: "reasoning-delta", id: "0", delta: "x" })), { type: "finish-step" }, { type: "finish" }];
    // L'outil arrive vers 30 ms, bien avant le délai ; le flux dure ensuite ~400 ms, bien après.
    const stream = reasoningWatchdog<Chunk>({
      maxMs: 250,
      first: fake(slow, { gapMs: 10 }),
      fallback: (signal) => {
        built = true;
        return fake(ANSWER)(signal);
      },
    });
    const types = (await collect(stream)).map((c) => c.type);
    expect(built).toBe(false);
    expect(types.at(-1)).toBe("finish");
  });

  test("le navigateur ferme : les deux essais sont arrêtés", async () => {
    let aborted = false;
    const client = new AbortController();
    const stream = reasoningWatchdog<Chunk>({
      maxMs: 5_000,
      signal: client.signal,
      first: fake([{ type: "start" }], { gapMs: 5, endless: true, onAbort: () => (aborted = true) }),
      fallback: fake(ANSWER),
    });
    const reader = stream.getReader();
    await reader.read();
    client.abort();
    for (;;) if ((await reader.read()).done) break;
    expect(aborted).toBe(true);
  });
});

describe("une pièce jointe est lue sans raisonnement étendu", () => {
  test("image ou PDF joint : modèle principal, raisonnement coupé", () => {
    expect(routeChat({ text: "Löse Aufgabe 13.", hasAttachments: true })).toMatchObject({ tier: "complex", thinking: "off", reason: "pièce jointe" });
  });

  test("la même question sans pièce jointe garde son raisonnement", () => {
    expect(routeChat({ text: "Löse Aufgabe 13." }).thinking).toBe("adaptive");
  });
});
