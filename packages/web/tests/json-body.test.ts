import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { readJsonObject } from "../src/api/lib/json-body";

/**
 * Un corps JSON cassé sur /api/agent/messages répondait 500 (test de charge du
 * 18 nov. 2026) : une fausse alerte par essai. C'est une faute du client : 400.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

/** La route telle qu'elle est écrite dans api/index.ts : lire le corps, 400 sinon. */
const app = new Hono();
app.post("/api/agent/messages", async (c) => {
  const parsed = await readJsonObject(c.req.raw);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  if (!Array.isArray(parsed.body.messages)) return c.json({ error: "invalid_body" }, 400);
  return c.json({ received: parsed.body.messages.length });
});
app.onError((_err, c) => c.json({ error: "internal_error" }, 500));

const post = (body: BodyInit | null) => app.request("/api/agent/messages", { method: "POST", headers: { "content-type": "application/json" }, body });

describe("corps JSON cassé sur /api/agent/messages", () => {
  test("JSON tronqué : 400 { error: \"invalid_json\" }, pas 500", async () => {
    const res = await post('{"messages": [');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });

  test("corps vide, texte quelconque, octets invalides : 400 invalid_json", async () => {
    for (const body of ["", "bonjour", "{not json", new Uint8Array([0xff, 0xfe, 0x00, 0x7b])]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_json" });
    }
  });

  test("JSON valide qui n'est pas un objet : 400 invalid_json", async () => {
    for (const body of ['"{\\"messages\\": ["', "null", "42", "[1,2]"]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_json" });
    }
  });

  test("objet sans liste `messages` : 400 invalid_body", async () => {
    const res = await post(JSON.stringify({ locale: "de" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_body" });
  });

  test("un corps correct passe", async () => {
    const res = await post(JSON.stringify({ messages: [{ role: "user" }] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 1 });
  });

  test("la vraie route lit son corps ainsi, avant le décompte du quota", () => {
    const index = read("src/api/index.ts");
    const route = index.slice(index.indexOf('app.post("/api/agent/messages"'), index.indexOf('app.post("/api/agent/translate"'));
    expect(route).toContain("await readJsonObject(c.req.raw)");
    expect(route).toContain('return c.json({ error: parsed.error }, 400)');
    expect(route).toContain('return c.json({ error: "invalid_body" }, 400)');
    expect(route).not.toContain("await c.req.json()");
    expect(route.indexOf("readJsonObject(")).toBeLessThan(route.indexOf('consume(session.user.id, "chat")'));
  });
});
