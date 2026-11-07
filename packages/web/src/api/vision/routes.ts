import type { Hono } from "hono";
import { auth } from "../auth";
import { MAX_FRAME_BYTES, MIN_FRAME_INTERVAL_MS, dataUrlBytes, visionFrameSchema } from "../lib/vision-copilot";

/**
 * POST /api/vision/frame — une image du partage d'écran/caméra (V2 — Pilier 3).
 *
 * SQUELETTE : session, clé, validation et cadence sont en place ; l'appel à
 * Claude Vision ne l'est pas encore → 501 not_implemented. L'image n'est
 * jamais écrite nulle part.
 */
const lastFrame = new Map<string, number>();

export function registerVisionRoutes(app: Hono) {
  app.post("/api/vision/frame", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!process.env.ANTHROPIC_API_KEY) return c.json({ error: "not_configured" }, 503);

    const parsed = visionFrameSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    if (dataUrlBytes(parsed.data.image) > MAX_FRAME_BYTES) return c.json({ error: "frame_too_large" }, 413);

    const uid = session.user.id;
    const now = Date.now();
    if (now - (lastFrame.get(uid) ?? 0) < MIN_FRAME_INTERVAL_MS) return c.json({ error: "too_fast" }, 429);
    lastFrame.set(uid, now);

    // À venir : generateObject({ model: gateway("anthropic/claude-sonnet-4.6"),
    //   messages: [{ role: "user", content: [{ type: "image", image }, { type: "text", text }] }],
    //   schema: VisionObservation }) avec le prompt du Super-Professeur.
    return c.json({ error: "not_implemented" }, 501);
  });
}
