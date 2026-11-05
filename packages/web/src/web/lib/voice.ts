import { pickVoice, rankVoices, SPEECH_LANG, speechChunks } from "@/lib/speech";

/**
 * La voix du professeur, côté navigateur.
 *
 *  1. Voix premium ElevenLabs si le SERVEUR a une clé (ELEVENLABS_API_KEY) :
 *     on lui envoie le texte, il renvoie un MP3. La clé ne quitte jamais le
 *     serveur.
 *  2. Sinon, la synthèse du navigateur avec la voix la plus naturelle de
 *     l'appareil (lib/speech.ts → scoreVoice), ou celle choisie dans les
 *     réglages.
 */

const PREF_KEY = "tred-voice-uri";

export function getPreferredVoice(): string | null {
  try {
    return localStorage.getItem(PREF_KEY);
  } catch {
    return null;
  }
}

export function setPreferredVoice(uri: string | null) {
  try {
    if (uri) localStorage.setItem(PREF_KEY, uri);
    else localStorage.removeItem(PREF_KEY);
  } catch {
    /* navigation privée : le choix ne sera simplement pas retenu */
  }
}

/** Les voix arrivent en différé dans Chrome : on attend `voiceschanged`. */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
  const now = window.speechSynthesis.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

export async function voicesFor(locale: string): Promise<SpeechSynthesisVoice[]> {
  return rankVoices(await loadVoices(), locale);
}

let premium: Promise<boolean> | null = null;
/** Le serveur a-t-il une voix premium ? Demandé une fois par session. */
export function premiumVoiceAvailable(): Promise<boolean> {
  premium ??= fetch("/api/tts/status", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { premium: false }))
    .then((j: { premium?: boolean }) => j.premium === true)
    .catch(() => false);
  return premium;
}

let current: { audio?: HTMLAudioElement; url?: string } = {};

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (current.audio) current.audio.pause();
  if (current.url) URL.revokeObjectURL(current.url);
  current = {};
}

/**
 * Lit `text` (déjà nettoyé pour l'oral). `onEnd` est appelé à la fin ou en
 * cas d'erreur. Renvoie false si aucune voix n'est disponible.
 */
export async function speak(
  text: string,
  locale: string,
  { onEnd, voiceURI }: { onEnd?: () => void; voiceURI?: string | null } = {},
): Promise<boolean> {
  stopSpeaking();
  if (!text.trim()) return false;

  if (voiceURI === undefined && (await premiumVoiceAvailable())) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 2500), locale }),
      });
      if (res.ok) {
        const url = URL.createObjectURL(await res.blob());
        const audio = new Audio(url);
        current = { audio, url };
        audio.onended = () => {
          stopSpeaking();
          onEnd?.();
        };
        audio.onerror = () => {
          stopSpeaking();
          onEnd?.();
        };
        await audio.play();
        return true;
      }
    } catch {
      /* repli sur la voix du navigateur */
    }
  }

  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  const voice = pickVoice(await loadVoices(), locale, voiceURI ?? getPreferredVoice());
  const lang = voice?.lang ?? SPEECH_LANG[locale] ?? locale;
  const chunks = speechChunks(text);
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = lang;
    if (voice) u.voice = voice;
    // Les voix « Natural » sont justes à 1 ; les voix classiques gagnent à
    // ralentir un peu : moins hachées, plus faciles à suivre.
    u.rate = voice && /natural|neural|premium|enhanced|google/i.test(voice.name) ? 1 : 0.95;
    if (i === chunks.length - 1) u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
  });
  return true;
}
