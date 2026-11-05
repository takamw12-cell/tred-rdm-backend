import { describe, expect, test } from "bun:test";
import { withSseHeartbeat } from "../src/api/lib/sse-heartbeat";

/**
 * Incident du 5 novembre 2026 : flux du chat coupé pendant une longue
 * réflexion. Le battement doit combler les silences SANS jamais casser un
 * événement SSE, et laisser passer le contenu intact.
 */

const enc = new TextEncoder();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function slowStream(parts: { text: string; delay: number }[]) {
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(c) {
        for (const p of parts) {
          await sleep(p.delay);
          c.enqueue(enc.encode(p.text));
        }
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

describe("withSseHeartbeat", () => {
  test("un silence plus long que l'intervalle reçoit des « : ping »", async () => {
    const res = withSseHeartbeat(
      slowStream([
        { text: 'data: {"a":1}\n\n', delay: 0 },
        { text: 'data: {"b":2}\n\n', delay: 700 },
      ]),
      200,
    );
    const out = await res.text();
    expect(out).toContain(": ping\n\n");
    // Le contenu passe intact et dans l'ordre, pings retirés.
    expect(out.replace(/: ping\n\n/g, "")).toBe('data: {"a":1}\n\ndata: {"b":2}\n\n');
  });

  test("jamais de ping au milieu d'un événement", async () => {
    const res = withSseHeartbeat(
      slowStream([
        { text: 'data: {"long":', delay: 0 },
        { text: '"x"}\n\n', delay: 700 }, // événement coupé en deux, longue pause
      ]),
      200,
    );
    const out = await res.text();
    expect(out).toBe('data: {"long":"x"}\n\n');
  });

  test("statut et en-têtes conservés", () => {
    const res = withSseHeartbeat(slowStream([]), 200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    expect(res.status).toBe(200);
  });
});
