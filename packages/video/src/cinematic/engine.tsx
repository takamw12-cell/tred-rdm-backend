import { useMemo, type CSSProperties, type ReactNode } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { colorCorrection } from "@remotion/effects/color-correction";
import { noise } from "@remotion/effects/noise";
import { vignette } from "@remotion/effects/vignette";
import { LightLeak } from "@remotion/light-leaks";
import { AbsoluteFill, Audio, Easing, HtmlInCanvas, Img, OffthreadVideo, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Logo } from "@/components/logo";
import { FPS, clamp, easeOut, pop, progress } from "../promo/kit";
import { planVoice, splitPhrases, type VoFile, type VoicePlan } from "../promo/voice";
import { SFX, type SfxKind } from "../series/engine";

/**
 * Le moteur des courts-métrages « Cinematic » (2026-11-13) — 1920 × 1080,
 * 30 i/s, image en 2.35:1 (bandes noires), 30 à 45 s.
 *
 * Le film montre la VRAIE interface : des captures de l'app
 * (scripts/cinematic-captures.mjs) parcourues par une caméra (zoom, panoramique)
 * et un curseur, entre des plans d'ambiance (scripts/cinematic-broll.mjs).
 *
 * Rendu « film » avec les outils de Remotion :
 *  - toute l'image passe par <HtmlInCanvas> et reçoit `colorCorrection()`
 *    (exposition, température, contraste, saturation), `vignette()` et
 *    `noise()` (grain, une graine par image) de @remotion/effects ;
 *  - chaque changement de scène se fait sous un <LightLeak> de
 *    @remotion/light-leaks (`hueShift` 0 = chaud, 190 = bleu froid) ;
 *  - bandes noires 2.35:1, sous-titres dans la bande du bas.
 *
 * La voix (ElevenLabs, horodatée mot par mot) est découpée en phrases ; chaque
 * scène couvre `span` phrases et laisse l'image respirer (`lead`, `gap`,
 * `tail`). La durée du film se déduit de la voix : elle n'est écrite nulle part.
 */

export const FILM = { width: 1920, height: 1080, fps: FPS } as const;
/** Hauteur d'une bande noire : (1080 − 1920 / 2.35) / 2. */
export const BAR = Math.round((1080 - 1920 / 2.35) / 2);
const TOP = BAR;
const BOTTOM = 1080 - BAR;

export type Look = {
  /** Réglages de `colorCorrection()`. */
  grade: Parameters<typeof colorCorrection>[0];
  /** Force du grain (0–1) et du vignettage (0–1). */
  grain: number;
  vignette: number;
  /** Teinte des light leaks : 0 = ambre, 190 = bleu froid (mesuré : 240 donne un voile VERT avec ce paquet). */
  hueShift: number;
  /** Intensité des light leaks (défaut 1). Les teintes froides lavent vite une interface blanche. */
  leak?: number;
  /** Couleur d'accent (mot actif des sous-titres, traits). */
  accent: string;
};

export const LOOKS = {
  /** Nuit chaude : tons ambrés, contraste doux, grain léger. */
  amber: { grade: { temperature: 0.3, tint: 0.04, exposure: -0.12, contrast: 1.1, saturation: 0.92, shadows: -0.08, highlights: -0.05 }, grain: 0.1, vignette: 0.36, hueShift: 0, accent: "#F5B942" },
  /** Lumière naturelle : neutre, grain fin, accents jaunes. */
  neutral: { grade: { temperature: 0.06, exposure: 0.02, contrast: 1.06, saturation: 1.02, vibrance: 0.12 }, grain: 0.065, vignette: 0.24, hueShift: 22, accent: "#EAB308" },
  /** Nuit froide : bleus, grain marqué. */
  cold: { grade: { temperature: -0.34, tint: -0.03, exposure: -0.16, contrast: 1.14, saturation: 0.82, shadows: -0.1 }, grain: 0.12, vignette: 0.42, hueShift: 190, leak: 0.8, accent: "#8FD3FF" },
  /** « Tech Premium » (série B) : très sombre, métal, néon jaune. */
  tech: { grade: { temperature: -0.06, exposure: -0.1, contrast: 1.2, saturation: 0.9, shadows: -0.16, highlights: 0.06, vibrance: 0.15 }, grain: 0.085, vignette: 0.5, hueShift: 28, accent: "#FACC15" },
} as const satisfies Record<string, Look>;

/* ── Le plan du film : scènes et voix ─────────────────────────────────── */

export type FilmCtx = {
  /** Durée de la scène (images). */
  dur: number;
  /** Image (relative à la scène) où la voix prononce ce mot. */
  f: (word: string, nth?: number) => number;
  /** Image (relative à la scène) où commence sa première phrase. */
  voiceAt: number;
  /** Image (relative à la scène) où commence sa n-ième phrase (0 = la première). */
  sentence: (n: number) => number;
  look: Look;
};

export type FilmScene = {
  name: string;
  /** Nombre de phrases dites pendant la scène. */
  span: number;
  /** Secondes d'image avant la première phrase (défaut 0,5). */
  lead?: number;
  /** Secondes d'image après la dernière phrase (défaut 0,5). */
  tail?: number;
  /** Respiration entre deux phrases de la scène (défaut 0,35 s). */
  gap?: number;
  /** Pas de light leak à l'entrée (coupe franche). */
  cut?: boolean;
  render: (ctx: FilmCtx) => ReactNode;
  cues?: (ctx: FilmCtx) => { at: number; kind: SfxKind; volume?: number }[];
};

export type FilmPlan = { plan: VoicePlan; bounds: { from: number; to: number }[]; frames: number };

export function planFilm(vo: VoFile, scenes: FilmScene[]): FilmPlan {
  const groups = splitPhrases(vo);
  const total = scenes.reduce((n, sc) => n + sc.span, 0);
  if (total !== groups.length) throw new Error(`${vo.id} : ${groups.length} phrases, mais les scènes en couvrent ${total}`);
  const starts: number[] = [];
  const cuts: number[] = [];
  let t = 0;
  let k = 0;
  for (const sc of scenes) {
    cuts.push(t);
    t += sc.lead ?? 0.5;
    for (let i = 0; i < sc.span; i++, k++) {
      const g = groups[k];
      starts.push(t);
      t += (g[g.length - 1].endMs - g[0].startMs) / 1000 + (i < sc.span - 1 ? (sc.gap ?? 0.35) : 0);
    }
    t += sc.tail ?? 0.5;
  }
  const frames = Math.round(t * FPS);
  const from = cuts.map((c) => Math.round(c * FPS));
  return { plan: planVoice(vo, starts), bounds: from.map((f, i) => ({ from: f, to: i < from.length - 1 ? from[i + 1] : frames })), frames };
}

/* ── Le film ──────────────────────────────────────────────────────────── */

export type CinematicProps = {
  vo: VoFile;
  voice: string;
  music: string;
  look: Look;
  scenes: FilmScene[];
  /** Volume de la musique entre les phrases / sous la voix. */
  musicVolume?: number;
  duckedVolume?: number;
  /** Graine des light leaks (une forme différente par film). */
  seed?: number;
};

const LEAK = 26; // images : la coupe tombe au milieu, sous le voile de lumière (fondu « écran » : l'image reste lisible)

export function CinematicShort({ vo, voice, music, look, scenes, musicVolume = 0.5, duckedVolume = 0.14, seed = 1 }: CinematicProps) {
  const frame = useCurrentFrame();
  const { plan, bounds, frames } = useMemo(() => planFilm(vo, scenes), [vo, scenes]);
  const ctxs: FilmCtx[] = bounds.map(({ from, to }, i) => {
    const first = scenes.slice(0, i).reduce((n, sc) => n + sc.span, 0);
    return { dur: to - from, f: (w, nth) => plan.frameOf(w, nth) - from, voiceAt: scenes[i].span > 0 ? plan.sentenceFrame(first) - from : 0, sentence: (n) => plan.sentenceFrame(first + Math.min(n, Math.max(0, scenes[i].span - 1))) - from, look };
  });
  const effects = useMemo(
    () => [colorCorrection(look.grade), vignette({ amount: look.vignette, radius: 0.6, feather: 0.5 }), noise({ amount: look.grain, seed: frame })],
    [look, frame],
  );
  const sfx = [
    ...bounds.slice(1).flatMap(({ from }, i) => (scenes[i + 1].cut ? [] : [{ frame: from - 8, src: SFX.whoosh, volume: 0.16 }])),
    ...scenes.flatMap((sc, i) => (sc.cues?.(ctxs[i]) ?? []).map((c) => ({ frame: bounds[i].from + c.at, src: SFX[c.kind], volume: c.volume ?? 0.35 }))),
  ];
  const ms2f = (ms: number) => (ms / 1000) * FPS;
  const spans = plan.sentences.map((se) => [ms2f(se.atMs), ms2f(se.atMs + se.srcEndMs - se.srcStartMs)] as const);

  return (
    <AbsoluteFill style={{ background: "#000", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {/* L'image : tout ce qui est filmé est étalonné, vignetté et grainé d'un bloc. */}
      <HtmlInCanvas width={FILM.width} height={FILM.height} effects={effects}>
        <AbsoluteFill style={{ background: "#05070C" }}>
          {scenes.map((sc, i) => (
            <Sequence key={sc.name} from={bounds[i].from} durationInFrames={bounds[i].to - bounds[i].from} name={sc.name}>
              <AbsoluteFill style={{ opacity: i === 0 || sc.cut ? 1 : progress(frame, bounds[i].from, bounds[i].from + 6) }}>{sc.render(ctxs[i])}</AbsoluteFill>
            </Sequence>
          ))}
        </AbsoluteFill>
      </HtmlInCanvas>
      {/* Les transitions : un voile de lumière, la coupe en son milieu. */}
      {bounds.slice(1).map(({ from }, i) =>
        scenes[i + 1].cut ? null : (
          <Sequence key={from} from={from - LEAK / 2} durationInFrames={LEAK} name="Light leak" style={{ mixBlendMode: "screen", opacity: (look as Look).leak ?? 1 }}>
            <LightLeak durationInFrames={LEAK} seed={seed * 7 + i * 3} hueShift={look.hueShift} />
          </Sequence>
        ),
      )}
      {/* Ouverture et fermeture au noir. */}
      <AbsoluteFill style={{ background: "#000", opacity: 1 - progress(frame, 0, 18) + progress(frame, frames - 16, frames - 2) }} />
      {/* Bandes 2.35:1 et sous-titres. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: TOP, background: "#000" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: BAR, background: "#000" }} />
      <Subtitles plan={plan} accent={look.accent} />
      {/* Bande-son : musique (baissée sous la voix, fondue à la fin), voix, effets. */}
      <Audio
        src={music}
        volume={(f) => {
          const d = Math.min(...spans.map(([a, b]) => (f < a ? a - f : f > b ? f - b : 0)));
          const v = duckedVolume + (musicVolume - duckedVolume) * Math.min(1, d / 14);
          return v * interpolate(f, [0, 20], [0, 1], clamp) * interpolate(f, [frames - 36, frames - 2], [1, 0], clamp);
        }}
      />
      {plan.sentences.map((se, i) => {
        const prevEnd = i > 0 ? plan.sentences[i - 1].srcEndMs : 0;
        const nextStart = i < plan.sentences.length - 1 ? plan.sentences[i + 1].srcStartMs : Infinity;
        const from = Math.max(Math.ceil(ms2f(prevEnd)), Math.floor(ms2f(se.srcStartMs)) - 3);
        const to = Math.min(Math.floor(ms2f(nextStart)), Math.ceil(ms2f(se.srcEndMs)) + 8);
        return (
          <Sequence key={i} from={Math.round(ms2f(se.atMs) - (ms2f(se.srcStartMs) - from))} durationInFrames={Math.max(1, to - from)} name={`Voix ${i + 1}`}>
            <Audio src={voice} trimBefore={from} trimAfter={to} volume={1} />
          </Sequence>
        );
      })}
      {sfx.map((c, i) => (
        <Sequence key={`sfx-${i}`} from={Math.max(0, c.frame)} durationInFrames={FPS * 2} name="SFX">
          <Audio src={c.src} volume={c.volume} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}

/** Sous-titres de cinéma : une ligne dans la bande du bas, le mot dit en accent. */
function Subtitles({ plan, accent }: { plan: VoicePlan; accent: string }) {
  const frame = useCurrentFrame();
  const { pages } = useMemo(() => createTikTokStyleCaptions({ captions: plan.captions, combineTokensWithinMilliseconds: 2600 }), [plan]);
  const now = (frame / FPS) * 1000;
  const page = pages.find((p, i) => now >= p.startMs && now < Math.min(p.startMs + p.durationMs + 450, pages[i + 1]?.startMs ?? Infinity));
  if (!page) return null;
  const enter = progress(frame, Math.round((page.startMs / 1000) * FPS), Math.round((page.startMs / 1000) * FPS) + 6);
  return (
    <div style={{ position: "absolute", left: 120, right: 120, bottom: 0, height: BAR, display: "flex", alignItems: "center", justifyContent: "center", opacity: enter }}>
      <p style={{ margin: 0, fontSize: 34, fontWeight: 500, letterSpacing: "0.005em", color: "rgb(255 255 255 / 0.62)", textAlign: "center", whiteSpace: "pre-wrap", lineHeight: 1.2 }}>
        {page.tokens.map((tk, i) => (
          <span key={i} style={{ color: now >= tk.fromMs && now < tk.toMs ? accent : now >= tk.fromMs ? "#FFFFFF" : undefined }}>
            {tk.text}
          </span>
        ))}
      </p>
    </div>
  );
}

/* ── Plan d'ambiance (B-roll) ─────────────────────────────────────────── */

/** Un clip plein cadre, ralenti, avec une lente avancée. `from` : seconde de départ dans le clip. */
export function Broll({ src, from = 0, rate = 0.72, children, dim = 0.18 }: { src: string; from?: number; rate?: number; children?: ReactNode; dim?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      <OffthreadVideo src={src} muted trimBefore={Math.round(from * FPS)} playbackRate={rate} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.04 + frame * 0.00035})` }} />
      <AbsoluteFill style={{ background: `linear-gradient(90deg, rgb(0 0 0 / ${dim + 0.35}), rgb(0 0 0 / ${dim}) 55%, rgb(0 0 0 / ${dim * 0.6}))` }} />
      {children}
    </AbsoluteFill>
  );
}

/** Typographie cinétique : des lignes qui montent mot par mot, calées sur la voix. */
export function Kinetic({ lines, x = 150, bottom = BAR + 92, size = 84, align = "left", accent }: { lines: { text: string; at: number; hot?: boolean }[]; x?: number; bottom?: number; size?: number; align?: "left" | "center"; accent?: string }) {
  const frame = useCurrentFrame();
  return (
    <div className="font-display" style={{ position: "absolute", left: align === "center" ? 0 : x, right: align === "center" ? 0 : undefined, bottom, display: "flex", flexDirection: "column", gap: 6, alignItems: align === "center" ? "center" : "flex-start" }}>
      {lines.map((line) => (
        <p key={line.text} style={{ margin: 0, fontSize: size, fontWeight: 600, lineHeight: 1.08, letterSpacing: "-0.02em", color: line.hot ? (accent ?? "#F5B942") : "#FFFFFF", textShadow: "0 6px 40px rgb(0 0 0 / 0.75)" }}>
          {line.text.split(" ").map((w, i) => {
            const k = progress(frame, line.at + i * 3, line.at + i * 3 + 14);
            return (
              <span key={i} style={{ display: "inline-block", overflow: "hidden", verticalAlign: "bottom", paddingBottom: 6 }}>
                <span style={{ display: "inline-block", opacity: k, transform: `translateY(${(1 - k) * 70}px)`, filter: `blur(${(1 - k) * 8}px)`, whiteSpace: "pre" }}>{w + " "}</span>
              </span>
            );
          })}
        </p>
      ))}
    </div>
  );
}

/* ── L'écran de l'app : captures, caméra, curseur ─────────────────────── */

export type Cam = { at: number; x: number; y: number; z: number };
export type Layer = {
  src: string;
  at?: number;
  /** Durée du fondu d'apparition (images, défaut 10). */
  fade?: number;
  /** Dévoilement dans un rectangle [x, y, l, h] : vers la droite (saisie) ou vers le bas (écriture). */
  reveal?: { rect: [number, number, number, number]; dir: "right" | "down"; dur: number };
};
export type CursorKey = { at: number; x: number; y: number; click?: boolean };

const inOut = Easing.inOut(Easing.cubic);

function camAt(cams: Cam[], frame: number) {
  let c = cams[0];
  for (let i = 1; i < cams.length; i++) {
    const a = cams[i - 1];
    const b = cams[i];
    if (frame >= a.at) {
      // Deux repères au même instant : on saute au second (coupe de caméra).
      const k = b.at > a.at ? interpolate(frame, [a.at, b.at], [0, 1], { ...clamp, easing: inOut }) : 1;
      c = { at: frame, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
    }
  }
  const z = Math.max(1, c.z);
  // La capture couvre toujours la fenêtre 2.35:1 : on borne le déplacement.
  const tx = Math.min(0, Math.max(1920 - 1920 * z, 960 - c.x * z));
  const ty = Math.min(TOP, Math.max(BOTTOM - 1080 * z, 540 - c.y * z));
  return { tx, ty, z };
}

/**
 * Une ou plusieurs captures de l'app (coordonnées en px CSS de l'app,
 * 1920 × 1080), filmées par une caméra qui se déplace entre des repères, avec
 * le curseur. `children` : calques ajoutés dans le repère de la capture.
 */
export function Screen({ layers, cams, cursor, hideCursorAt, children, overlay }: { layers: Layer[]; cams: Cam[]; cursor?: CursorKey[]; hideCursorAt?: number; children?: ReactNode; /** Calques fixes, hors caméra (repère de l'image). */ overlay?: ReactNode }) {
  const frame = useCurrentFrame();
  const { tx, ty, z } = camAt(cams, frame);
  // Inutile de dessiner ce qu'un calque plein, entièrement apparu, recouvre.
  let base = 0;
  layers.forEach((l, i) => {
    if (!l.reveal && frame >= (l.at ?? 0) + (l.fade ?? 10)) base = i;
  });
  return (
    <AbsoluteFill style={{ background: "#05070C", overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
        {layers.map((l, i) => {
          const at = l.at ?? 0;
          if (i < base || frame < at) return null;
          const style: CSSProperties = { position: "absolute", left: 0, top: 0, width: 1920, height: 1080 };
          if (l.reveal) {
            const [x, y, w, h] = l.reveal.rect;
            const p = interpolate(frame, [at, at + l.reveal.dur], [0, 1], { ...clamp, easing: l.reveal.dir === "down" ? inOut : undefined });
            style.clipPath = l.reveal.dir === "right" ? `inset(${y}px ${1920 - x - w * p}px ${1080 - y - h}px ${x}px)` : `inset(${y}px ${1920 - x - w}px ${1080 - y - h * p}px ${x}px)`;
          } else {
            style.opacity = i === 0 ? 1 : progress(frame, at, at + (l.fade ?? 10));
          }
          return <Img key={`${l.src}-${i}`} src={l.src} style={style} />;
        })}
        {children}
        {cursor && <FilmCursor keys={cursor} hideAt={hideCursorAt} />}
      </div>
      {overlay}
    </AbsoluteFill>
  );
}

/** Le pointeur : il rejoint sa cible juste avant le clic, puis une onde jaune part du clic. */
export function FilmCursor({ keys, hideAt }: { keys: CursorKey[]; hideAt?: number }) {
  const frame = useCurrentFrame();
  let x = keys[0].x;
  let y = keys[0].y;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    const start = Math.max(a.at, b.at - 22);
    if (frame >= start) {
      const k = b.at > start ? interpolate(frame, [start, b.at], [0, 1], { ...clamp, easing: inOut }) : 1;
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
    }
  }
  const last = keys.filter((k) => k.click && frame >= k.at).pop();
  const since = last ? frame - last.at : 99;
  const press = since < 6 ? 1 - 0.2 * Math.sin((since / 6) * Math.PI) : 1;
  const opacity = progress(frame, keys[0].at - 8, keys[0].at) * (hideAt === undefined ? 1 : 1 - progress(frame, hideAt, hideAt + 8));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity }}>
      {last && since < 18 && (
        <div style={{ position: "absolute", left: last.x - 44, top: last.y - 44, width: 88, height: 88, borderRadius: 44, border: "4px solid #EAB308", background: "rgb(234 179 8 / 0.22)", opacity: 1 - since / 18, transform: `scale(${0.25 + 0.9 * easeOut(since / 18)})` }} />
      )}
      <svg width={40} height={50} viewBox="0 0 24 30" style={{ position: "absolute", left: x - 5, top: y - 3, transform: `scale(${press})`, transformOrigin: "5px 3px", filter: "drop-shadow(0 8px 12px rgb(0 0 0 / 0.5))" }}>
        <path d="M3 2 L3 24 L9 18.6 L13.2 28 L17 26.3 L12.9 17.2 L21 17.2 Z" fill="#FFFFFF" stroke="#0F172A" strokeWidth={1.8} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Un halo jaune qui pulse autour d'un élément de la capture (dans son repère). */
export function Glow({ rect, at, until, radius = 999 }: { rect: [number, number, number, number]; at: number; until: number; radius?: number }) {
  const frame = useCurrentFrame();
  if (frame < at || frame > until + 8) return null;
  const k = progress(frame, at, at + 8) * (1 - progress(frame, until, until + 8));
  const pulse = 0.5 + 0.5 * Math.sin((frame - at) / 4);
  const [x, y, w, h] = rect;
  return <div style={{ position: "absolute", left: x - 6, top: y - 6, width: w + 12, height: h + 12, borderRadius: radius, border: "2.5px solid #EAB308", boxShadow: `0 0 ${18 + pulse * 22}px ${4 + pulse * 6}px rgb(234 179 8 / ${0.45 * k})`, opacity: k }} />;
}

/* ── Carte de fin ─────────────────────────────────────────────────────── */

/** Logo, signature en typographie cinétique, adresse du site. */
export function EndCard({ logoAt, lines, linesAt, lineAts, url = "tred-tutor.de", accent = "#EAB308", backdrop }: { logoAt: number; lines: string[]; linesAt: number; /** Une image de départ par ligne (sinon elles s'enchaînent). */ lineAts?: number[]; url?: string; accent?: string; backdrop?: ReactNode }) {
  const frame = useCurrentFrame();
  const k = pop(frame, logoAt);
  const glow = progress(frame, logoAt, logoAt + 40);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse 60% 55% at 50% 46%, #17223B, #070A12 75%)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      {backdrop && <AbsoluteFill style={{ opacity: 0.55 }}>{backdrop}</AbsoluteFill>}
      <div style={{ position: "absolute", left: "50%", top: "46%", width: 900, height: 900, marginLeft: -450, marginTop: -450, borderRadius: 450, background: `radial-gradient(circle, ${accent}4D, transparent 62%)`, opacity: glow, transform: `scale(${0.7 + 0.3 * glow})` }} />
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34, marginTop: -20, transform: "scale(1.28)" }}>
        <div style={{ opacity: Math.min(1, k * 1.4), transform: `scale(${0.88 + 0.12 * k})` }}>
          <Logo markClassName="h-28 text-white" />
        </div>
        <div className="font-display" style={{ textAlign: "center" }}>
          {lines.map((line, li) => (
            <p key={line} style={{ margin: 0, fontSize: 62, fontWeight: 600, lineHeight: 1.12, letterSpacing: "-0.02em", color: "#FFFFFF" }}>
              {line.split(" ").map((w, i) => {
                const t0 = (lineAts?.[li] ?? linesAt + li * 8) + i * 3;
                const p = progress(frame, t0, t0 + 14);
                return (
                  <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 34}px)`, filter: `blur(${(1 - p) * 6}px)`, whiteSpace: "pre" }}>
                    {w + " "}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
        <p style={{ margin: 0, display: "inline-flex", alignItems: "center", gap: 14, padding: "12px 28px", borderRadius: 999, border: "1px solid rgb(255 255 255 / 0.22)", background: "rgb(255 255 255 / 0.06)", color: "#FFFFFF", fontSize: 28, fontWeight: 600, opacity: progress(frame, linesAt + 22, linesAt + 36) }}>
          <span style={{ width: 11, height: 11, borderRadius: 6, background: accent }} />
          {url}
        </p>
      </div>
    </AbsoluteFill>
  );
}
