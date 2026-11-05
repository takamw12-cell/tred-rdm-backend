import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NotConfiguredError, type TtsStage } from "./pipeline";

/**
 * Étage TTS ElevenLabs (OPTIONNEL). Utile seulement si on veut une voix
 * différente de celle fournie par l'avatar LiveAvatar.
 * Serveur uniquement : la clé ne quitte jamais le backend.
 */
export const elevenLabsConfigured = (): boolean =>
  Boolean(process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID);

export function createElevenLabsTts(): TtsStage {
  if (!elevenLabsConfigured()) throw new NotConfiguredError("tts (ElevenLabs)");
  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });
  const voiceId = process.env.ELEVENLABS_VOICE_ID!;

  return {
    async synthesize(text) {
      const stream = await client.textToSpeech.convert(voiceId, {
        text,
        // Multilingue : l'UI est en allemand, les explications aussi.
        modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
      });
      return new Response(stream).arrayBuffer();
    },
  };
}
