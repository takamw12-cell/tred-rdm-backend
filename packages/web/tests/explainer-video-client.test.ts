import { afterEach, describe, expect, test } from "bun:test";
import { errorCodeOf, formatDuration, runExplainerVideo, type ExplainerState } from "../src/web/lib/explainer-video";

/** Le suivi côté navigateur, avec un serveur simulé : aucune requête réelle. */
const realFetch = globalThis.fetch;
const realSetTimeout = globalThis.setTimeout;
afterEach(() => {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const REQ = { question: "Warum A = B?", answer: "…", language: "fr" };

async function run(responses: Response[]) {
  const calls: { url: string; body?: string }[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body as string | undefined });
    return responses.shift() ?? json({ status: "pending" });
  }) as typeof fetch;
  // Pas d'attente réelle entre deux tours de polling.
  globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
  const states: ExplainerState[] = [];
  await runExplainerVideo(REQ, (s) => states.push(s), new AbortController().signal);
  return { states, calls };
}

describe("runExplainerVideo", () => {
  test("envoie la langue de l'étudiant et suit pending → script → voice → done", async () => {
    const video = { status: "done", id: "gv_1", title: "Lagerkräfte", durationMs: 42_000, scenes: [], words: [], sceneStartsMs: [], audioUrl: "/api/video/gv_1/audio", saved: false, language: "fr", professor: "sensei" };
    const { states, calls } = await run([json({ id: "gv_1", status: "pending" }, 202), json({ status: "script" }), json({ status: "voice" }), json(video)]);
    expect(calls[0]!.url).toBe("/api/video/generate");
    expect(JSON.parse(calls[0]!.body!).language).toBe("fr");
    expect(calls[1]!.url).toBe("/api/video/gv_1");
    expect(states.map((s) => (s.phase === "working" ? s.step : s.phase))).toEqual(["pending", "script", "voice", "done"]);
    const last = states.at(-1)!;
    expect(last.phase === "done" && last.video.durationMs).toBe(42_000);
  });

  test("sans cours ni calcul : invite à déposer le cours, sans rien générer", async () => {
    const { states, calls } = await run([json({ error: "no_documents" }, 422)]);
    expect(states.at(-1)).toEqual({ phase: "needDocs" });
    expect(calls).toHaveLength(1);
  });

  test("fonction non configurée ou table absente : l'ancien diaporama prend le relais", async () => {
    expect((await run([json({ error: "not_configured" }, 503)])).states.at(-1)).toEqual({ phase: "unavailable" });
    expect((await run([json({ error: "not_migrated" }, 503)])).states.at(-1)).toEqual({ phase: "unavailable" });
  });

  test("script refusé par le validateur : message « je n'invente rien »", async () => {
    const { states } = await run([json({ id: "gv_2" }, 202), json({ status: "failed", error: "not_grounded" })]);
    expect(states.at(-1)).toEqual({ phase: "error", code: "grounded" });
  });

  test("quota ou plafond quotidien : message de limite", async () => {
    expect((await run([json({ error: "QUOTA" }, 402)])).states.at(-1)).toEqual({ phase: "error", code: "limit" });
    expect((await run([json({ id: "gv_3" }, 202), json({ status: "failed", error: "daily_limit" })])).states.at(-1)).toEqual({ phase: "error", code: "limit" });
  });

  test("une coupure réseau pendant le suivi n'arrête pas la vidéo", async () => {
    const calls: string[] = [];
    let n = 0;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      n++;
      if (n === 1) return json({ id: "gv_4" }, 202);
      if (n === 2) throw new TypeError("network");
      return json({ status: "done", id: "gv_4", title: "", durationMs: 1, scenes: [], words: [], sceneStartsMs: [], audioUrl: "", saved: false, language: "de", professor: null });
    }) as typeof fetch;
    globalThis.setTimeout = ((fn: () => void) => realSetTimeout(fn, 0)) as typeof setTimeout;
    const states: ExplainerState[] = [];
    await runExplainerVideo(REQ, (s) => states.push(s), new AbortController().signal);
    expect(states.at(-1)!.phase).toBe("done");
  });
});

describe("aides", () => {
  test("errorCodeOf", () => {
    expect(errorCodeOf("voice_failed")).toBe("generic");
    expect(errorCodeOf(undefined, 500)).toBe("generic");
  });
  test("formatDuration", () => {
    expect(formatDuration(84_000)).toBe("1:24");
    expect(formatDuration(29_400)).toBe("0:29");
    expect(formatDuration(180_000)).toBe("3:00");
  });
});
