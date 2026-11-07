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
/** Incrémenté à chaque arrêt : une lecture premium en cours sait qu'elle doit s'arrêter. */
let generation = 0;

export function stopSpeaking() {
  generation++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  if (current.audio) current.audio.pause();
  if (current.url) URL.revokeObjectURL(current.url);
  current = {};
}

/**
 * Quel moteur a parlé :
 *  - "premium"  : ElevenLabs (vraie voix de professeur) ;
 *  - "browser"  : voix de l'appareil, AUCUNE voix premium configurée ;
 *  - "fallback" : voix de l'appareil, la voix premium a échoué (réseau,
 *                 plafond du jour…).
 */
export type VoiceEngine = "premium" | "browser" | "fallback";

/**
 * Lit `text` (déjà nettoyé pour l'oral). `onEnd` est appelé à la fin ou en
 * cas d'erreur. Renvoie false si aucune voix n'est disponible.
 *
 * Priorité : la voix ElevenLabs du professeur choisi (`professorId`), puis
 * la voix de l'appareil. `voice` remplace le choix enregistré ("" =
 * automatique, "eleven:<professeur>" = voix premium, sinon voiceURI).
 */
export async function speak(
  text: string,
  locale: string,
  {
    onEnd,
    onEngine,
    voice,
    style,
    defaultStyle,
    professorId,
    onWord,
  }: {
    onEnd?: () => void;
    /** À chaque mot prononcé (voix de l'appareil seulement) : le halo du professeur bat en rythme. */
    onWord?: () => void;
    onEngine?: (engine: VoiceEngine) => void;
    voice?: string;
    style?: VoiceStyle;
    defaultStyle?: VoiceStyle;
    professorId?: string;
  } = {},
): Promise<boolean> {
  stopSpeaking();
  const gen = generation;
  if (!text.trim()) return false;
  const pref = voice ?? getPreferredVoice() ?? "";
  const st = style ?? getVoiceStyle() ?? defaultStyle ?? "calm";

  let slots: PremiumVoice[] = [];
  if (pref === "" || pref.startsWith(PREMIUM_PREFIX)) {
    slots = await premiumVoices();
    const wanted = pref ? pref.slice(PREMIUM_PREFIX.length) : professorId;
    const slot = slots.find((s) => s.id === wanted) ?? (pref ? undefined : premiumSlotFor(slots, st));
    if (slot && (await playPremium(text, locale, slot.id, st, gen, onEnd))) {
      onEngine?.("premium");
      return true;
    }
    if (gen !== generation) return false; // arrêté pendant la tentative
  }
  onEngine?.(slots.length > 0 ? "fallback" : "browser");

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
    if (onWord) u.onboundary = (e) => {
      if (e.name === "word") onWord();
    };
    u.onerror = () => onEnd?.();
    synth.speak(u);
  });
  return true;
}

/** Morceaux de ~1 800 caractères, coupés entre deux phrases. */
export function premiumChunks(text: string, max = 1800): string[] {
  const out: string[] = [];
  let cur = "";
  for (const sentence of speechChunks(text)) {
    if (cur && cur.length + sentence.length + 1 > max) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur} ${sentence}` : sentence;
    while (cur.length > max) {
      out.push(cur.slice(0, max));
      cur = cur.slice(max);
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function fetchAudio(text: string, locale: string, slot: string, style: VoiceStyle): Promise<Blob | null> {
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, locale, voice: slot, style }),
    });
    return res.ok ? await res.blob() : null;
  } catch {
    return null;
  }
}

/**
 * Lecture premium de TOUTE la réponse : morceau par morceau, le suivant est
 * demandé pendant que le précédent joue (pas de blanc). Si le PREMIER
 * morceau échoue, on rend la main (repli sur la voix de l'appareil).
 */
async function playPremium(
  text: string,
  locale: string,
  slot: string,
  style: VoiceStyle,
  gen: number,
  onEnd?: () => void,
): Promise<boolean> {
  const parts = premiumChunks(text);
  let next = fetchAudio(parts[0], locale, slot, style);
  const first = await next;
  if (!first || gen !== generation) return false;

  const playFrom = async (i: number, blob: Blob) => {
    if (gen !== generation) return;
    if (i + 1 < parts.length) next = fetchAudio(parts[i + 1], locale, slot, style);
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = { audio, url };
    const done = async () => {
      URL.revokeObjectURL(url);
      if (gen !== generation) return;
      const following = i + 1 < parts.length ? await next : null;
      if (following && gen === generation) void playFrom(i + 1, following);
      else {
        current = {};
        onEnd?.();
      }
    };
    audio.onended = () => void done();
    audio.onerror = () => {
      current = {};
      onEnd?.();
    };
    try {
      await audio.play();
    } catch {
      onEnd?.();
    }
  };
  await playFrom(0, first);
  return true;
}
