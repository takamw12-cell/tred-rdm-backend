import { createHash } from "node:crypto";
import type { Hono } from "hono";
import { auth } from "../auth";
import { reserveChars } from "./budget";
import { createElevenLabsTts, elevenLabsConfigured, premiumVoices, resolvePremiumVoice, type VoiceStyle } from "../avatar/elevenlabs";

/**
 * Voix premium du professeur (ElevenLabs). Inerte sans ELEVENLABS_API_KEY :
 * /status répond { premium: false } et le navigateur garde sa propre voix.
 *
 * Garde-fous de coût (ElevenLabs facture au caractère) :
 *  - session obligatoire + limite de requêtes (index.ts) ;
 *  - 2 500 caractères par appel (le navigateur découpe les longues réponses) ;
 *  - plafond quotidien par étudiant (ELEVENLABS_DAILY_CHARS, défaut 20 000) ;
 *  - cache mémoire : réécouter la même réponse ne coûte rien.
 */
export const MAX_TTS_CHARS = 2500;
const STYLES: readonly VoiceStyle[] = ["calm", "energetic", "strict"];

const CACHE_MAX = 60;
const cache = new Map<string, ArrayBuffer>();
function remember(key: string, audio: ArrayBuffer) {
  cache.set(key, audio);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

export function registerTtsRoutes(app: Hono) {
  app.get("/api/tts/status", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ premium: false }, 401);
    // Seulement les ids de professeur et leur style — jamais les ID de voix.
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

    const style = STYLES.find((st) => st === body?.style);
    const voice = resolvePremiumVoice(typeof body?.voice === "string" ? body.voice : undefined, style);
    if (!voice) return c.json({ error: "not_configured" }, 503);

    const key = createHash("sha256").update(`${voice.voiceId}|${voice.style}|${text}`).digest("hex");
    const headers = { "Content-Type": "audio/mpeg", "Cache-Control": "private, max-age=86400" };
    const hit = cache.get(key);
    if (hit) return new Response(hit.slice(0), { headers });

    if (!reserveChars(session.user.id, text.length)) return c.json({ error: "daily_limit" }, 429);
    try {
      const audio = await createElevenLabsTts({ slot: voice.id, style: voice.style }).synthesize(text);
      remember(key, audio);
      return new Response(audio.slice(0), { headers });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/missing_permissions|text_to_speech/i.test(msg)) {
        console.error(
          "[tts] La clé ElevenLabs n'a PAS la permission « Text to Speech ». " +
            "ElevenLabs → API Keys → modifier la clé → Text to Speech : Access (ou recréer la clé).",
        );
      } else if (/401|invalid_api_key|unauthorized/i.test(msg)) {
        console.error("[tts] Clé ElevenLabs refusée (401) : vérifie ELEVENLABS_API_KEY sur Railway.");
      } else if (/quota|credits|402|429/i.test(msg)) {
        console.error("[tts] Quota ElevenLabs atteint ou limite de débit : voix de l'appareil en relais.", msg.slice(0, 200));
      } else {
        console.error("[tts] ElevenLabs a échoué", msg.slice(0, 300));
      }
      return c.json({ error: "tts_failed" }, 502);
    }
  });
}
