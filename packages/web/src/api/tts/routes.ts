import type { Hono } from "hono";
import { auth } from "../auth";
import { createElevenLabsTts, elevenLabsConfigured, premiumVoices, type VoiceStyle } from "../avatar/elevenlabs";

const STYLES: readonly VoiceStyle[] = ["calm", "energetic", "strict"];

/**
 * Voix premium du professeur (ElevenLabs). Inerte sans ELEVENLABS_API_KEY :
 * /status répond { premium: false } et le navigateur garde sa propre voix.
 *
 * Garde-fous : session obligatoire, limite de requêtes (index.ts), texte
 * plafonné à 2 500 caractères — ElevenLabs facture au caractère.
 */
export const MAX_TTS_CHARS = 2500;

export function registerTtsRoutes(app: Hono) {
  app.get("/api/tts/status", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ premium: false }, 401);
    // Seulement les noms d'emplacement et leur style — jamais les ID de voix.
    const voices = premiumVoices().map(({ id, style }) => ({ id, style }));
    return c.json({ premium: voices.length > 0, voices });
  });

  app.post("/api/tts", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!elevenLabsConfigured()) return c.json({ error: "not_configured" }, 503);

    const body = (await c.req.json().catch(() => null)) as
      | { text?: unknown; voice?: unknown; style?: unknown }
      | null;
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return c.json({ error: "empty" }, 400);
    if (text.length > MAX_TTS_CHARS) return c.json({ error: "too_long" }, 413);

    try {
      const slot = typeof body?.voice === "string" ? body.voice : undefined;
      const style = STYLES.find((st) => st === body?.style);
      const audio = await createElevenLabsTts({ slot, style }).synthesize(text);
      return new Response(audio, {
        headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" },
      });
    } catch (err) {
      console.error("[tts] ElevenLabs a échoué", err);
      return c.json({ error: "tts_failed" }, 502);
    }
  });
}
