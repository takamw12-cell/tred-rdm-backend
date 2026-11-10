import { useMemo } from "react";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { AbsoluteFill, Audio, Sequence, interpolate, useCurrentFrame } from "remotion";
import { FPS, clamp, progress } from "./kit";

/**
 * La voix off ElevenLabs, phrase par phrase.
 *
 * scripts/voiceover.mjs écrit, pour chaque langue, le MP3 et l'horodatage de
 * chaque mot (vo-xx.json). On découpe la voix en phrases et on place chaque
 * phrase à l'instant voulu de la vidéo (`starts`, en secondes) : l'image a le
 * temps de respirer entre deux phrases, et les sous-titres suivent les mots.
 */

export type VoWord = { text: string; startMs: number; endMs: number };
export type VoFile = { id: string; words: VoWord[] };

type Sentence = { words: VoWord[]; srcStartMs: number; srcEndMs: number; atMs: number };

export type VoicePlan = {
  sentences: Sentence[];
  /** Instant (image de la vidéo) où un mot est prononcé : synchroniser l'image sur la voix. */
  frameOf: (needle: string, nth?: number) => number;
  /** Image de début de la phrase n. */
  sentenceFrame: (n: number) => number;
  captions: Caption[];
};

const norm = (w: string) =>
  w
    .toLowerCase()
    .replace(/^(?:l|d|t|j|m|n|s|c|qu)['’]/, "") // élisions : « l'économie » → « économie »
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}%]/gu, "");

/**
 * `breakAfter` : mots (avec leur ponctuation, ex. « documents, ») après lesquels
 * on coupe AUSSI, pour faire respirer une longue phrase.
 */
export function splitPhrases(vo: VoFile, breakAfter: string[] = []): VoWord[][] {
  const groups: VoWord[][] = [];
  let cur: VoWord[] = [];
  for (const w of vo.words) {
    cur.push(w);
    if (/[.!?]$/.test(w.text) || breakAfter.includes(w.text)) groups.push(cur), (cur = []);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

export function planVoice(vo: VoFile, starts: number[], breakAfter: string[] = []): VoicePlan {
  const groups = splitPhrases(vo, breakAfter);
  if (groups.length !== starts.length) {
    throw new Error(`${vo.id} : ${groups.length} phrases, mais ${starts.length} instants de départ`);
  }

  const sentences: Sentence[] = groups.map((words, i) => ({
    words,
    srcStartMs: words[0].startMs,
    srcEndMs: words[words.length - 1].endMs,
    atMs: starts[i] * 1000,
  }));

  const outMs = (si: number, w: VoWord) => sentences[si].atMs + (w.startMs - sentences[si].srcStartMs);

  const captions: Caption[] = sentences.flatMap((se, si) =>
    se.words.map((w, wi) => ({
      text: (wi === 0 ? "" : " ") + w.text,
      startMs: outMs(si, w),
      endMs: outMs(si, w) + (w.endMs - w.startMs),
      timestampMs: null,
      confidence: null,
      pageBreakAfter: wi === se.words.length - 1,
    })),
  );

  const frameOf = (needle: string, nth = 0) => {
    const n = norm(needle);
    let seen = 0;
    for (let si = 0; si < sentences.length; si++) {
      for (const w of sentences[si].words) {
        if (norm(w.text).startsWith(n)) {
          if (seen === nth) return Math.round((outMs(si, w) / 1000) * FPS);
          seen++;
        }
      }
    }
    throw new Error(`${vo.id} : mot introuvable dans la voix off : « ${needle} »`);
  };

  return {
    sentences,
    frameOf,
    sentenceFrame: (n) => Math.round((sentences[n].atMs / 1000) * FPS),
    captions,
  };
}

/* ── Bande-son : voix, musique (baissée sous la voix), effets ─────────── */

export type Cue = { frame: number; src: string; volume?: number };

export function Soundtrack({
  plan,
  voice,
  music,
  sfx,
  musicVolume = 0.4,
  duckedVolume = 0.13,
}: {
  plan: VoicePlan;
  voice: string;
  music: string;
  sfx: Cue[];
  musicVolume?: number;
  duckedVolume?: number;
}) {
  const ms2f = (ms: number) => (ms / 1000) * FPS;
  const spans = plan.sentences.map((se) => [ms2f(se.atMs), ms2f(se.atMs + se.srcEndMs - se.srcStartMs)] as const);

  return (
    <>
      <Audio
        src={music}
        volume={(f) => {
          // distance (en images) à la voix la plus proche : la musique remonte entre les phrases
          const d = Math.min(...spans.map(([a, b]) => (f < a ? a - f : f > b ? f - b : 0)));
          const v = duckedVolume + (musicVolume - duckedVolume) * Math.min(1, d / 9);
          return v * interpolate(f, [0, 12], [0, 1], clamp);
        }}
      />
      {plan.sentences.map((se, i) => {
        // On coupe la piste au plus près de la phrase, sans mordre sur la voisine.
        const prevEnd = i > 0 ? plan.sentences[i - 1].srcEndMs : 0;
        const nextStart = i < plan.sentences.length - 1 ? plan.sentences[i + 1].srcStartMs : Infinity;
        const from = Math.max(Math.ceil(ms2f(prevEnd)), Math.floor(ms2f(se.srcStartMs)) - 3);
        const to = Math.min(Math.floor(ms2f(nextStart)), Math.ceil(ms2f(se.srcEndMs)) + 6);
        const lead = ms2f(se.srcStartMs) - from;
        return (
          <Sequence key={i} from={Math.round(ms2f(se.atMs) - lead)} durationInFrames={to - from} name={`Voix ${i + 1}`}>
            <Audio src={voice} trimBefore={from} trimAfter={to} volume={1} />
          </Sequence>
        );
      })}
      {sfx.map((c, i) => (
        <Sequence key={`sfx-${i}`} from={c.frame} durationInFrames={FPS * 2} name="SFX">
          <Audio src={c.src} volume={c.volume ?? 0.5} />
        </Sequence>
      ))}
    </>
  );
}

/* ── Sous-titres dynamiques (style TikTok, mot actif surligné) ────────── */

export function Captions({ plan, hideFrom, bottom = 150 }: { plan: VoicePlan; hideFrom?: number; bottom?: number }) {
  const frame = useCurrentFrame();
  const { pages } = useMemo(
    () => createTikTokStyleCaptions({ captions: plan.captions, combineTokensWithinMilliseconds: 1100 }),
    [plan],
  );
  if (hideFrom !== undefined && frame >= hideFrom) return null;
  const now = (frame / FPS) * 1000;
  const page = pages.find((p, i) => {
    const end = Math.min(p.startMs + p.durationMs + 250, pages[i + 1]?.startMs ?? Infinity);
    return now >= p.startMs && now < end;
  });
  if (!page) return null;
  const pageFrame = Math.round((page.startMs / 1000) * FPS);
  const enter = progress(frame, pageFrame, pageFrame + 5);

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom,
          display: "flex",
          justifyContent: "center",
          opacity: enter,
          transform: `translateY(${(1 - enter) * 10}px) scale(${0.96 + 0.04 * enter})`,
        }}
      >
        <p
          style={{
            margin: 0,
            padding: "10px 16px 12px",
            borderRadius: 16,
            background: "rgb(15 23 42 / 0.86)",
            border: "1px solid rgb(255 255 255 / 0.12)",
            boxShadow: "0 18px 40px -16px rgb(0 0 0 / 0.8)",
            color: "#FFFFFF",
            fontFamily: "Inter, sans-serif",
            fontSize: 25,
            fontWeight: 800,
            lineHeight: 1.22,
            textAlign: "center",
            letterSpacing: "-0.01em",
            maxWidth: 470,
          }}
        >
          {page.tokens.map((tk, i) => {
            const active = now >= tk.fromMs && now < tk.toMs;
            const spoken = now >= tk.fromMs;
            return (
              <span
                key={i}
                style={{
                  color: active ? "#FACC15" : spoken ? "#FFFFFF" : "rgb(255 255 255 / 0.55)",
                  whiteSpace: "pre",
                }}
              >
                {tk.text}
              </span>
            );
          })}
        </p>
      </div>
    </AbsoluteFill>
  );
}
