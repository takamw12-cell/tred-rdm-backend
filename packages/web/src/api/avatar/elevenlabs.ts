import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NotConfiguredError, type TtsStage } from "./pipeline";

/**
 * Voix premium ElevenLabs — UNE VOIX PAR PROFESSEUR du vestiaire.
 *
 * Serveur uniquement : la clé et les identifiants de voix ne quittent jamais
 * le backend ; le navigateur ne connaît que l'id du professeur.
 *
 * Il suffit de poser ELEVENLABS_API_KEY : chaque professeur a une voix par
 * défaut, choisie parmi les voix « par défaut » d'ElevenLabs (disponibles sur
 * tous les comptes). Pour en changer, coller un autre Voice ID de la Voice
 * Library dans la variable du professeur. Le modèle multilingue
 * (eleven_multilingual_v2) leur fait parler allemand, français, anglais…
 */

export type VoiceStyle = "calm" | "energetic" | "strict";
export type PremiumSlot = "genius" | "maverick" | "examiner" | "sensei";

export const PREMIUM_SLOTS: {
  id: PremiumSlot;
  env: string;
  /** Voix par défaut (Voice Library ElevenLabs, « default voices »). */
  defaultVoiceId: string;
  style: VoiceStyle;
}[] = [
  // Prof. Kenta — jeune homme dynamique (« Liam »).
  { id: "genius", env: "ELEVENLABS_VOICE_KENTA", defaultVoiceId: "TX3LPaxmHKxFdv7VOQHJ", style: "energetic" },
  // Prof. Ren — homme charismatique, conteur (« George »).
  { id: "maverick", env: "ELEVENLABS_VOICE_REN", defaultVoiceId: "JBFqnCBsd6RMkjVDRZzb", style: "energetic" },
  // Dr. Aiko — femme posée, assurée (« Alice »).
  { id: "examiner", env: "ELEVENLABS_VOICE_AIKO", defaultVoiceId: "Xb7hH8MSUJpSbSDYk0k2", style: "strict" },
  // Sensei Haruto — voix grave et calme (« Brian »).
  { id: "sensei", env: "ELEVENLABS_VOICE_HARUTO", defaultVoiceId: "nPczCjzI2devNBz1zQrb", style: "calm" },
];

/** Voix disponibles : toutes, dès que la clé est posée. */
export function premiumVoices(): { id: PremiumSlot; style: VoiceStyle; voiceId: string }[] {
  if (!process.env.ELEVENLABS_API_KEY) return [];
  return PREMIUM_SLOTS.map((s) => ({
    id: s.id,
    style: s.style,
    voiceId: process.env[s.env]?.trim() || s.defaultVoiceId,
  }));
}

export const elevenLabsConfigured = (): boolean => Boolean(process.env.ELEVENLABS_API_KEY);

/**
 * Le style module la diction (voice_settings) : stable et posé pour
 * « calme », plus expressif pour « énergique », sec pour « sévère ».
 */
const SETTINGS: Record<VoiceStyle, { stability: number; similarityBoost: number; style: number; speed: number }> = {
  calm: { stability: 0.6, similarityBoost: 0.8, style: 0.15, speed: 0.95 },
  energetic: { stability: 0.4, similarityBoost: 0.8, style: 0.45, speed: 1.05 },
  strict: { stability: 0.75, similarityBoost: 0.85, style: 0.1, speed: 1.0 },
};

export function resolvePremiumVoice(slot?: string, style?: VoiceStyle) {
  const voices = premiumVoices();
  if (voices.length === 0) return null;
  const chosen = voices.find((v) => v.id === slot) ?? voices.find((v) => v.style === style) ?? voices[0];
  return { ...chosen, style: style ?? chosen.style };
}

export function createElevenLabsTts(opts: { slot?: string; style?: VoiceStyle } = {}): TtsStage {
  const chosen = resolvePremiumVoice(opts.slot, opts.style);
  if (!chosen) throw new NotConfiguredError("tts (ElevenLabs)");
  const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });

  return {
    async synthesize(text) {
      const stream = await client.textToSpeech.convert(chosen.voiceId, {
        text,
        modelId: process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        outputFormat: "mp3_44100_128",
        voiceSettings: SETTINGS[chosen.style],
      });
      return new Response(stream).arrayBuffer();
    },
  };
}
