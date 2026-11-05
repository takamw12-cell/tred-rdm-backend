import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NotConfiguredError, type TtsStage } from "./pipeline";

/**
 * TTS ElevenLabs (OPTIONNEL). Serveur uniquement : la clé ne quitte jamais
 * le backend, et les identifiants de voix non plus (le navigateur ne voit que
 * les noms d'emplacement : senior, junior, examiner).
 *
 * Trois emplacements de voix, chacun activé par SA variable — on ne propose
 * jamais trois « voix distinctes » qui seraient en réalité la même :
 *   ELEVENLABS_VOICE_SENIOR    « Prof. Senior »  (calme)
 *   ELEVENLABS_VOICE_JUNIOR    « Junger Prof »   (énergique)
 *   ELEVENLABS_VOICE_EXAMINER  « Prüferin »      (sévère)
 *   ELEVENLABS_VOICE_ID        voix standard, si aucun emplacement n'est posé
 */

export type VoiceStyle = "calm" | "energetic" | "strict";
export type PremiumSlot = "senior" | "junior" | "examiner" | "standard";

const SLOTS: { id: PremiumSlot; env: string; style: VoiceStyle }[] = [
  { id: "senior", env: "ELEVENLABS_VOICE_SENIOR", style: "calm" },
  { id: "junior", env: "ELEVENLABS_VOICE_JUNIOR", style: "energetic" },
  { id: "examiner", env: "ELEVENLABS_VOICE_EXAMINER", style: "strict" },
];

/** Emplacements réellement configurés (identifiant de voix présent). */
export function premiumVoices(): { id: PremiumSlot; style: VoiceStyle; voiceId: string }[] {
  if (!process.env.ELEVENLABS_API_KEY) return [];
  const list = SLOTS.flatMap((s) => {
    const voiceId = process.env[s.env]?.trim();
    return voiceId ? [{ id: s.id, style: s.style, voiceId }] : [];
  });
  const std = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (list.length === 0 && std) list.push({ id: "standard", style: "calm", voiceId: std });
  return list;
}

export const elevenLabsConfigured = (): boolean => premiumVoices().length > 0;

/**
 * Le style module la diction (voice_settings) : stable et posé pour
 * « calme », plus expressif pour « énergique », sec pour « sévère ».
 */
const SETTINGS: Record<VoiceStyle, { stability: number; similarityBoost: number; style: number; speed: number }> = {
  calm: { stability: 0.7, similarityBoost: 0.8, style: 0.1, speed: 0.95 },
  energetic: { stability: 0.35, similarityBoost: 0.8, style: 0.55, speed: 1.08 },
  strict: { stability: 0.85, similarityBoost: 0.85, style: 0.05, speed: 1.0 },
};

export function createElevenLabsTts(opts: { slot?: string; style?: VoiceStyle } = {}): TtsStage {
  const voices = premiumVoices();
  if (voices.length === 0) throw new NotConfiguredError("tts (ElevenLabs)");
  const chosen =
    voices.find((v) => v.id === opts.slot) ??
    voices.find((v) => v.style === opts.style) ??
    voices[0];
  const style = opts.style ?? chosen.style;
  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });

  return {
    async synthesize(text) {
      const stream = await client.textToSpeech.convert(chosen.voiceId, {
        text,
        // Multilingue : l'UI est en allemand, les explications aussi.
        modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
        voiceSettings: SETTINGS[style],
      });
      return new Response(stream).arrayBuffer();
    },
  };
}
