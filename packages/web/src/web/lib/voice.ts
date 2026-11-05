import {
  pickVoice,
  premiumSlotFor,
  PREMIUM_PREFIX,
  prosodyFor,
  rankVoices,
  SPEECH_LANG,
  speechChunks,
  VOICE_STYLES,
  type VoiceStyle,
} from "@/lib/speech";

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
const STYLE_KEY = "tred-voice-style";

/** Style choisi dans les réglages ; null = celui du professeur. */
export function getVoiceStyle(): VoiceStyle | null {
  try {
    const v = localStorage.getItem(STYLE_KEY);
    return VOICE_STYLES.find((s) => s === v) ?? null;
  } catch {
    return null;
  }
}

export function setVoiceStyle(style: VoiceStyle | null) {
  try {
    if (style) localStorage.setItem(STYLE_KEY, style);
    else localStorage.removeItem(STYLE_KEY);
  } catch {
    /* navigation privée */
  }
}

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

export interface PremiumVoice {
  id: string;
  style: VoiceStyle;
}

let premium: Promise<PremiumVoice[]> | null = null;
/** Voix premium du serveur (ElevenLabs). Demandé une fois par session. */
export function premiumVoices(): Promise<PremiumVoice[]> {
  premium ??= fetch("/api/tts/status", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { voices: [] }))
    .then((j: { voices?: PremiumVoice[] }) => (Array.isArray(j.voices) ? j.voices : []))
    .catch(() => []);
  return premium;
}

export async function premiumVoiceAvailable(): Promise<boolean> {
  return (await premiumVoices()).length > 0;
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
 *
 * `voice` remplace le choix enregistré ("" = automatique,
 * "eleven:<slot>" = voix premium, sinon voiceURI du navigateur).
 * `style` : Calme / Énergique / Sévère ; sinon le réglage, sinon
 * `defaultStyle` (le style du professeur), sinon calme.
 */
export async function speak(
  text: string,
  locale: string,
  {
    onEnd,
    voice,
    style,
    defaultStyle,
  }: { onEnd?: () => void; voice?: string; style?: VoiceStyle; defaultStyle?: VoiceStyle } = {},
): Promise<boolean> {
  stopSpeaking();
  if (!text.trim()) return false;
  const pref = voice ?? getPreferredVoice() ?? "";
  const st = style ?? getVoiceStyle() ?? defaultStyle ?? "calm";

  if (pref === "" || pref.startsWith(PREMIUM_PREFIX)) {
    const slots = await premiumVoices();
    const slot = pref ? slots.find((s) => s.id === pref.slice(PREMIUM_PREFIX.length)) : premiumSlotFor(slots, st);
    if (slot && (await playPremium(text, locale, slot.id, st, onEnd))) return true;
  }

  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const synth = window.speechSynthesis;
  const browserPref = pref.startsWith(PREMIUM_PREFIX) ? null : pref || null;
  const v = pickVoice(await loadVoices(), locale, browserPref);
  const lang = v?.lang ?? SPEECH_LANG[locale] ?? locale;
  const { rate, pitch } = prosodyFor(st, !!v && /natural|neural|premium|enhanced|google/i.test(v.name));
  const chunks = speechChunks(text);
  chunks.forEach((chunk, i) => {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = lang;
    if (v) u.voice = v;
    u.rate = rate;
    u.pitch = pitch;
    if (i === chunks.length - 1) u.onend = () => onEnd?.();
    u.onerror = () => onEnd?.();
    synth.speak(u);
  });
  return true;
}

async function playPremium(
  text: string,
  locale: string,
  slot: string,
  style: VoiceStyle,
  onEnd?: () => void,
): Promise<boolean> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, 2500), locale, voice: slot, style }),
    });
    if (!res.ok) return false;
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
  } catch {
    return false; // repli sur la voix du navigateur
  }
}
