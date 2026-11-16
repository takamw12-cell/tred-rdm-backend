import { useMemo, type CSSProperties, type ReactNode } from "react";
import { createTikTokStyleCaptions } from "@remotion/captions";
import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, random, useCurrentFrame } from "remotion";
import { Logo } from "@/components/logo";
import { Soundtrack, planVoice, type Cue, type VoFile, type VoicePlan } from "../promo/voice";
import { FPS, H, W, clamp, easeInOut, easeOut, media, pop, progress, s } from "./kit";
import voEn2Json from "../assets/vo-s-en2.json";
import voiceEn2 from "../assets/vo-s-en2.mp3";
import voDe1Json from "../assets/vo-s-de1.json";
import voiceDe1 from "../assets/vo-s-de1.mp3";
import musicDoc from "../assets/music-c3-en.mp3";
import musicComedy from "../assets/music-c4-de.mp3";
import sfxAlarm from "../assets/sfx-alarm.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxPop from "../assets/sfx-pop.wav";
import sfxSuccess from "../assets/sfx-success.wav";
import sfxClick from "../assets/sfx-click.wav";

/**
 * Campagne V8 « six styles » (2026-11-16) — les deux pilotes.
 *
 * Règle du fondateur : six vidéos COMPLÈTEMENT différentes — style visuel,
 * angle, ambiance musicale, voix. Rien n'est donc repris du moteur des séries
 * SK et V5 (bleu nuit, autocollants orange, téléphone) : chaque vidéo a ici sa
 * palette, sa typographie, ses sous-titres, ses transitions et son cadre pour
 * l'app.
 *
 *   EN 2 · documentaire : image chaude, caméra à l'épaule, Fraunces et notes à
 *          la main, sous-titres de documentaire, l'app dans une fenêtre de
 *          navigateur posée sur du papier.
 *   DE 1 · comédie : alarme rouge, compte à rebours, feuilles qui volent,
 *          lettres de bande dessinée jaune et noir — puis tout se calme.
 *
 * Les écrans sont la VRAIE app (scripts/v5-captures.ts, prises `en-doc-*`,
 * `de-import3`, `de-summary`) ; le texte de la réponse du tuteur y est simulé,
 * au format exact de l'app. Les quatre autres vidéos attendent les réponses du
 * fondateur (GUIDE_FOUNDER.md, « Campagne V8 »).
 */
const cue = (at: number, src: string, volume: number): Cue => ({ frame: Math.round(at), src, volume });

/* ── Sous-titres : le même découpage, un habillage par vidéo ──────────── */

type CaptionLook = {
  y: number;
  /** Le bloc entier (police, casse, taille de base). */
  block: CSSProperties;
  /** Un mot : à venir, dit, en train d'être dit. */
  word: (state: "next" | "said" | "now", k: number) => CSSProperties;
  /** Groupement des mots (ms) : plus grand = phrases plus longues à l'écran. */
  group: number;
  band?: CSSProperties;
};

function Captions({ plan, look, hideFrom }: { plan: VoicePlan; look: CaptionLook; hideFrom?: number }) {
  const frame = useCurrentFrame();
  const { pages } = useMemo(() => {
    const spoken = plan.captions.filter((c) => /[\p{L}\p{N}]/u.test(c.text));
    return createTikTokStyleCaptions({ captions: spoken, combineTokensWithinMilliseconds: look.group });
  }, [plan, look.group]);
  if (hideFrom !== undefined && frame >= hideFrom) return null;
  const now = (frame / FPS) * 1000;
  const page = pages.find((p, i) => {
    const last = p.tokens[p.tokens.length - 1]?.toMs ?? p.startMs + p.durationMs;
    return now >= p.startMs && now < Math.min(last + 280, pages[i + 1]?.startMs ?? Infinity);
  });
  if (!page) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 20 }}>
      <div style={{ position: "absolute", left: 24, right: 24, top: look.y - 90, height: 180, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ margin: 0, display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", textAlign: "center", ...look.block, ...look.band }}>
          {page.tokens.map((tk, i) => {
            const from = Math.round((tk.fromMs / 1000) * FPS);
            const state = now >= tk.fromMs && now < tk.toMs ? "now" : now >= tk.fromMs ? "said" : "next";
            return (
              <span key={i} style={{ display: "inline-block", ...look.word(state, pop(frame, from, 7)) }}>
                {tk.text.trim()}
              </span>
            );
          })}
        </p>
      </div>
    </AbsoluteFill>
  );
}

/** Une vidéo : la voix placée phrase par phrase, la musique, les bruitages, les sous-titres habillés. */
function Film({ vo, voice, music, starts, sfx, look, captionsUntil, musicVolume = 0.2, children }: { vo: VoFile; voice: string; music: string; starts: number[]; sfx: Cue[]; look: CaptionLook; captionsUntil?: number; musicVolume?: number; children: (plan: VoicePlan) => ReactNode }) {
  const plan = useMemo(() => planVoice(vo, starts, [], 1), [vo, starts]);
  return (
    <AbsoluteFill>
      {children(plan)}
      <Captions plan={plan} look={look} hideFrom={captionsUntil} />
      <Soundtrack plan={plan} voice={voice} music={music} sfx={sfx} musicVolume={musicVolume} duckedVolume={0.07} />
    </AbsoluteFill>
  );
}

/** Une scène : de `from` à `to` (secondes), avec un fondu d'entrée et de sortie facultatif (images). */
function Scene({ from, to, fadeIn = 0, fadeOut = 0, children }: { from: number; to: number; fadeIn?: number; fadeOut?: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const a = s(from);
  const b = s(to);
  if (frame < a || frame >= b) return null;
  const opacity = Math.min(fadeIn ? interpolate(frame, [a, a + fadeIn], [0, 1], clamp) : 1, fadeOut ? interpolate(frame, [b - fadeOut, b], [1, 0], clamp) : 1);
  return (
    <Sequence from={a} durationInFrames={b - a} layout="none">
      <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>
    </Sequence>
  );
}

/** Une prise de l'app dans une boîte : largeur d'affichage `w`, hauteur `h`, la capture fait `srcW` × `srcH` pixels. */
function Clip({ name, from, rate, w, h, srcW, srcH, top = 0, zoom = 1, focus = [0.5, 0.5], zoomAt = 0, zoomFrames = 24 }: { name: string; from: number; rate: number; w: number; h: number; srcW: number; srcH: number; top?: number; zoom?: number; focus?: [number, number]; zoomAt?: number; zoomFrames?: number }) {
  const frame = useCurrentFrame();
  const scale = w / srcW;
  const k = zoom === 1 ? 0 : progress(frame, zoomAt, zoomAt + zoomFrames, easeInOut);
  const z = 1 + (zoom - 1) * k;
  return (
    <div style={{ position: "relative", width: w, height: h, overflow: "hidden" }}>
      <div style={{ position: "absolute", left: 0, top: -top * scale, width: w, height: srcH * scale, transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`, transform: `scale(${z})` }}>
        <OffthreadVideo src={media(name)} muted trimBefore={Math.round(from * FPS)} playbackRate={rate} style={{ width: w, height: srcH * scale, maxWidth: "none", display: "block" }} />
      </div>
    </div>
  );
}

/* ══ EN 2 · documentaire ═════════════════════════════════════════════════ */

const PAPER = "#F3EBDD";
const SEPIA = "#2B2118";
const CLAY = "#C4532F";
const MOSS = "#55664A";

/** Grain de pellicule et vignette : l'image n'est jamais tout à fait propre. */
function Grain({ strength = 0.16 }: { strength?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 15 }}>
      <svg width="100%" height="100%" style={{ opacity: strength, mixBlendMode: "multiply" }}>
        <filter id="doc-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 12} />
          <feColorMatrix values="0 0 0 0 0.2  0 0 0 0 0.15  0 0 0 0 0.1  0 0 0 0.9 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#doc-grain)" />
      </svg>
      <AbsoluteFill style={{ background: "radial-gradient(120% 85% at 50% 45%, rgb(0 0 0 / 0) 55%, rgb(30 18 8 / 0.5) 100%)" }} />
    </AbsoluteFill>
  );
}

/** La caméra tenue à la main : elle dérive, elle respire. */
function Handheld({ children, amount = 1 }: { children: ReactNode; amount?: number }) {
  const f = useCurrentFrame();
  const x = (Math.sin(f / 17) * 5 + Math.sin(f / 7.3) * 2.2) * amount;
  const y = (Math.cos(f / 21) * 6 + Math.sin(f / 9.1) * 2) * amount;
  const r = (Math.sin(f / 29) * 0.5 + Math.sin(f / 11) * 0.18) * amount;
  return <AbsoluteFill style={{ transform: `translate(${x}px, ${y}px) rotate(${r}deg) scale(${1.07 + Math.sin(f / 40) * 0.008 * amount})` }}>{children}</AbsoluteFill>;
}

/** Une note écrite à la main, qui se pose. */
function Note({ at, x, y, rotate = -3, children, color = SEPIA, size = 30 }: { at: number; x: number; y: number; rotate?: number; children: ReactNode; color?: string; size?: number }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const k = progress(frame, at, at + 10);
  return <div style={{ position: "absolute", left: x, top: y, fontFamily: "Caveat, cursive", fontWeight: 700, fontSize: size, lineHeight: 1.05, color, transform: `rotate(${rotate}deg) translateY(${(1 - k) * 10}px)`, opacity: k, whiteSpace: "nowrap" }}>{children}</div>;
}

/** La fenêtre de navigateur où tourne l'app. */
function BrowserWindow({ children, tilt = 0, width = 472 }: { children: ReactNode; tilt?: number; width?: number }) {
  return (
    <div style={{ width, borderRadius: 16, overflow: "hidden", background: "#111827", boxShadow: "0 30px 60px -18px rgb(43 33 24 / 0.55), 0 0 0 1px rgb(43 33 24 / 0.25)", transform: `rotate(${tilt}deg)` }}>
      <div style={{ height: 30, background: "#E7DCC9", display: "flex", alignItems: "center", gap: 6, padding: "0 12px" }}>
        {["#D9694A", "#E0B04A", "#7E9A62"].map((c) => (
          <span key={c} style={{ width: 9, height: 9, borderRadius: 9, background: c }} />
        ))}
        <span style={{ marginLeft: 10, flex: 1, height: 17, borderRadius: 9, background: "#F6EFE2", color: "#6B5B4A", fontFamily: "Inter, sans-serif", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", padding: "0 10px" }}>tred-tutor.de</span>
      </div>
      {children}
    </div>
  );
}

const DOC = { srcW: 1200, srcH: 1720, w: 472, h: 600 };
const docLook: CaptionLook = {
  y: 852,
  group: 1500,
  block: { fontFamily: "Fraunces, Georgia, serif", fontWeight: 600, fontStyle: "italic", fontSize: 30, lineHeight: 1.18, gap: "2px 9px", letterSpacing: "-0.005em" },
  band: { background: "rgb(34 24 15 / 0.82)", padding: "10px 18px 12px", borderRadius: 6 },
  word: (state) => ({ color: state === "next" ? "rgb(243 235 221 / 0.45)" : "#F3EBDD", borderBottom: state === "now" ? "3px solid #E9A13B" : "3px solid transparent" }),
};

export function StyleDocumentary() {
  return (
    <Film
      vo={voEn2Json as VoFile}
      voice={voiceEn2}
      music={musicDoc}
      //       Drowning…?  You don't…  You need…  Upload your…  It tells…  Take back…
      starts={[0.5, 2.5, 4.1, 6.0, 11.4, 14.9]}
      look={docLook}
      captionsUntil={s(14.75)}
      musicVolume={0.22}
      sfx={[cue(s(5.7) - 3, sfxWhoosh, 0.18), cue(s(8.6), sfxClick, 0.5), cue(s(14.7) - 4, sfxSuccess, 0.25)]}
    >
      {(plan) => {
        const f = (w: string, nth?: number) => plan.frameOf(w, nth);
        return (
          <>
            {/* 1 · Le bureau, la nuit : caméra à l'épaule. */}
            <Scene from={0} to={5.9} fadeOut={8}>
              <AbsoluteFill style={{ background: "#1A120B", overflow: "hidden" }}>
                <Handheld>
                  <OffthreadVideo src={media("broll-desk.mp4")} muted playbackRate={0.92} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "sepia(0.35) saturate(1.15) contrast(1.05) brightness(1.08)" }} />
                </Handheld>
                <AbsoluteFill style={{ background: "linear-gradient(180deg, rgb(26 18 11 / 0.55) 0%, rgb(26 18 11 / 0) 28%, rgb(26 18 11 / 0) 58%, rgb(26 18 11 / 0.7) 100%)" }} />
                <DocHud />
                <DocHook f={f} />
              </AbsoluteFill>
            </Scene>

            {/* 2 · L'écran : on dépose les notes, TRED construit le plan. */}
            <Scene from={5.7} to={11.3} fadeIn={8}>
              <AbsoluteFill style={{ background: PAPER }}>
                <PaperTexture />
                <div style={{ position: "absolute", left: (W - DOC.w) / 2, top: 150 }}>
                  <BrowserWindow tilt={-1.2}>
                    <Sequence durationInFrames={s(1.9)} layout="none">
                      <Clip name="app-v8-en-doc-import.mp4" from={8.2} rate={1} {...DOC} />
                    </Sequence>
                    <Sequence from={s(1.9)} layout="none">
                      <Clip name="app-v8-en-doc-plan.mp4" from={3.9} rate={1.15} {...DOC} />
                    </Sequence>
                  </BrowserWindow>
                </div>
                <Sequence durationInFrames={s(1.9)} layout="none">
                  <Note at={6} x={70} y={84} size={38}>
                    80 pages of notes, uploaded
                  </Note>
                </Sequence>
                <Sequence from={s(1.9)} layout="none">
                  <Note at={4} x={96} y={84} size={38} color={CLAY}>
                    one click: a 7-day plan
                  </Note>
                </Sequence>
              </AbsoluteFill>
            </Scene>

            {/* 3 · De près : quoi lire, jour par jour. */}
            <Scene from={11.3} to={14.7}>
              <AbsoluteFill style={{ background: PAPER }}>
                <PaperTexture />
                <div style={{ position: "absolute", left: (W - DOC.w) / 2, top: 150 }}>
                  <BrowserWindow tilt={0.8}>
                    <Clip name="app-v8-en-doc-plan.mp4" from={7.2} rate={2.1} {...DOC} zoom={1.32} focus={[0.3, 0.45]} zoomFrames={30} />
                  </BrowserWindow>
                </div>
                <Note at={8} x={60} y={84} size={38} color={MOSS}>
                  day by day, page by page
                </Note>
              </AbsoluteFill>
            </Scene>

            {/* 4 · Fin : le week-end. */}
            <Scene from={14.7} to={18.6} fadeIn={6}>
              <DocEnd />
            </Scene>
            <Grain />
          </>
        );
      }}
    </Film>
  );
}

function PaperTexture() {
  return (
    <>
      <AbsoluteFill style={{ background: "radial-gradient(90% 60% at 30% 15%, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0) 60%), radial-gradient(70% 50% at 85% 95%, rgb(196 83 47 / 0.1), rgb(196 83 47 / 0) 70%)" }} />
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgb(43 33 24 / 0.045) 0 1px, transparent 1px 34px)" }} />
    </>
  );
}

/** L'habillage « caméra » : point rouge, heure, repères de cadre. */
function DocHud() {
  const frame = useCurrentFrame();
  const sec = Math.floor(frame / FPS);
  return (
    <>
      <div style={{ position: "absolute", top: 64, left: 28, display: "flex", alignItems: "center", gap: 8, fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontSize: 14, fontWeight: 600, color: "#F3EBDD", letterSpacing: "0.08em" }}>
        <span style={{ width: 10, height: 10, borderRadius: 10, background: "#E5482D", opacity: Math.floor(frame / 15) % 2 ? 0.25 : 1 }} />
        REC · SUN 23:{String(47 + Math.floor(sec / 60)).padStart(2, "0")}:{String(12 + (sec % 48)).padStart(2, "0")}
      </div>
      {[
        { top: 54, left: 18, borderTop: "2px solid", borderLeft: "2px solid" },
        { top: 54, right: 18, borderTop: "2px solid", borderRight: "2px solid" },
        { bottom: 150, left: 18, borderBottom: "2px solid", borderLeft: "2px solid" },
        { bottom: 150, right: 18, borderBottom: "2px solid", borderRight: "2px solid" },
      ].map((c, i) => (
        <span key={i} style={{ position: "absolute", width: 22, height: 22, color: "rgb(243 235 221 / 0.6)", ...c }} />
      ))}
    </>
  );
}

/** « harder » barré, « smarter » souligné : le titre se corrige sous nos yeux. */
function DocHook({ f }: { f: (w: string, nth?: number) => number }) {
  const frame = useCurrentFrame();
  const title: CSSProperties = { fontFamily: "Fraunces, Georgia, serif", fontWeight: 700, fontStyle: "italic", color: "#F7F0E3", textShadow: "0 3px 22px rgb(0 0 0 / 0.7)", letterSpacing: "-0.01em", lineHeight: 1.04 };
  const drowning = progress(frame, f("Drowning"), f("Drowning") + 12);
  const harderAt = f("harder");
  const strike = progress(frame, harderAt + 8, harderAt + 20, easeInOut);
  const smarterAt = f("smarter");
  const under = progress(frame, smarterAt + 2, smarterAt + 16, easeInOut);
  return (
    <div style={{ position: "absolute", left: 34, right: 34, top: 250 }}>
      <div style={{ ...title, fontSize: 56, opacity: drowning, transform: `translateY(${(1 - drowning) * 14}px)` }}>
        Drowning in
        <br />
        lecture notes?
      </div>
      {frame >= f("work") - 4 && (
        <div style={{ ...title, fontSize: 40, marginTop: 34, opacity: progress(frame, f("work") - 4, f("work") + 8) }}>
          work{" "}
          <span style={{ position: "relative", display: "inline-block" }}>
            harder
            <span style={{ position: "absolute", left: -4, top: "56%", height: 5, width: `calc(${strike * 100}% + 8px)`, background: "#E5482D", borderRadius: 3, transform: "rotate(-3deg)" }} />
          </span>
        </div>
      )}
      {frame >= smarterAt - 6 && (
        <div style={{ ...title, fontSize: 48, marginTop: 6, color: "#F3C75A", opacity: progress(frame, smarterAt - 6, smarterAt + 6) }}>
          <span style={{ position: "relative", display: "inline-block" }}>
            work smarter.
            <span style={{ position: "absolute", left: 0, bottom: -6, height: 5, width: `${under * 100}%`, background: "#F3C75A", borderRadius: 3 }} />
          </span>
        </div>
      )}
    </div>
  );
}

function DocEnd() {
  const frame = useCurrentFrame();
  const k = progress(frame, 4, 20);
  const line = progress(frame, 16, 34, easeInOut);
  return (
    <AbsoluteFill style={{ background: PAPER, alignItems: "center" }}>
      <PaperTexture />
      <div style={{ position: "absolute", top: 250, left: 40, right: 40, textAlign: "center", fontFamily: "Fraunces, Georgia, serif", fontStyle: "italic", fontWeight: 700, fontSize: 58, lineHeight: 1.05, letterSpacing: "-0.015em", color: SEPIA, opacity: k, transform: `translateY(${(1 - k) * 16}px)` }}>
        Take back
        <br />
        <span style={{ position: "relative", display: "inline-block", color: CLAY }}>
          your weekend.
          <span style={{ position: "absolute", left: 0, bottom: -4, height: 5, width: `${line * 100}%`, background: CLAY, borderRadius: 3, opacity: 0.55 }} />
        </span>
      </div>
      <div style={{ position: "absolute", top: 520, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 18, opacity: progress(frame, 26, 40) }}>
        <Logo variant="stacked" markClassName="h-[112px] text-[#2B2118]" className="text-[#2B2118]" />
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 700, fontSize: 24, color: "#F7F0E3", background: SEPIA, padding: "10px 22px 11px", borderRadius: 999 }}>tred-tutor.de</span>
        <span style={{ fontFamily: "Caveat, cursive", fontWeight: 700, fontSize: 30, color: MOSS, transform: "rotate(-2deg)" }}>your notes, a plan, seven days</span>
      </div>
    </AbsoluteFill>
  );
}

/* ══ DE 1 · comédie ══════════════════════════════════════════════════════ */

const ALARM = "#E5132B";
const YELLOW = "#FFD60A";
const BLACK = "#0C0C10";
const MINT = "#D9F5E5";
const TEAL = "#1F8A70";
const NAVY = "#12263F";

const comic = (size: number, color = "#FFFFFF"): CSSProperties => ({
  fontFamily: "Inter, sans-serif",
  fontWeight: 900,
  fontStyle: "italic",
  fontSize: size,
  lineHeight: 0.95,
  letterSpacing: "-0.03em",
  textTransform: "uppercase",
  color,
  WebkitTextStroke: `${Math.max(2, size / 22)}px ${BLACK}`,
  paintOrder: "stroke fill",
  textShadow: `${size / 14}px ${size / 14}px 0 ${BLACK}`,
});

/** Trame de bande dessinée. */
function Halftone({ color, opacity = 0.22 }: { color: string; opacity?: number }) {
  return <AbsoluteFill style={{ backgroundImage: `radial-gradient(${color} 22%, transparent 24%)`, backgroundSize: "18px 18px", opacity }} />;
}

/** Une feuille de cours : elle traverse l'écran en tournant, ou reste suspendue (`freeze`). */
function Sheet({ i, freezeAt, calm = false }: { i: number; freezeAt?: number; calm?: boolean }) {
  const frame = useCurrentFrame();
  const t = freezeAt !== undefined && frame > freezeAt ? freezeAt + (frame - freezeAt) * 0.06 : frame;
  const seed = `sheet-${i}`;
  const dir = random(`${seed}-d`) > 0.5 ? 1 : -1;
  const speed = 9 + random(`${seed}-s`) * 9;
  const start = random(`${seed}-o`) * 40;
  const x0 = dir > 0 ? -140 : W + 40;
  const x = x0 + dir * ((t + start) * speed) % (W + 280) * 1;
  const y = 130 + random(`${seed}-y`) * 620 + Math.sin((t + i * 9) / 6) * 26;
  const rot = (t + i * 20) * (3 + random(`${seed}-r`) * 6) * dir;
  const size = 0.75 + random(`${seed}-z`) * 0.55;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: 96 * size, height: 128 * size, background: "#FFFFFF", border: `2.5px solid ${BLACK}`, borderRadius: 4, transform: `rotate(${rot}deg)`, boxShadow: calm ? "0 14px 24px -12px rgb(18 38 63 / 0.4)" : `5px 5px 0 ${BLACK}`, padding: 9 * size, boxSizing: "border-box" }}>
      {[0.9, 0.6, 0.8, 0.5, 0.75, 0.4].map((wd, n) => (
        <div key={n} style={{ height: 4 * size, width: `${wd * 100}%`, background: n === 0 ? ALARM : "#9AA3B2", borderRadius: 2, marginBottom: 7 * size }} />
      ))}
    </div>
  );
}

/** Le téléphone de la comédie : contour noir épais, ombre jaune décalée. */
function ComicPhone({ children, wobble = 0 }: { children: ReactNode; wobble?: number }) {
  const frame = useCurrentFrame();
  const k = pop(frame, 0, 12);
  const w = 392;
  const h = 700;
  return (
    <div style={{ position: "absolute", left: (W - w) / 2, top: 170, width: w, height: h, transform: `scale(${0.6 + 0.4 * k}) rotate(${Math.sin(frame / 9) * wobble}deg)` }}>
      <div style={{ position: "absolute", inset: 0, transform: "translate(12px, 12px)", background: YELLOW, borderRadius: 38, border: `4px solid ${BLACK}` }} />
      <div style={{ position: "absolute", inset: 0, background: BLACK, borderRadius: 38, border: `4px solid ${BLACK}`, padding: 8, boxSizing: "border-box" }}>
        <div style={{ width: "100%", height: "100%", borderRadius: 28, overflow: "hidden", background: "#0A0E27" }}>{children}</div>
      </div>
    </div>
  );
}

/** Une étiquette de BD qui claque. */
function Burst({ at, x, y, rotate = -8, bg = YELLOW, color = BLACK, size = 34, children }: { at: number; x: number; y: number; rotate?: number; bg?: string; color?: string; size?: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const k = pop(frame, at, 9);
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: `rotate(${rotate}deg) scale(${0.4 + 0.6 * k})`, transformOrigin: "center", background: bg, color, border: `4px solid ${BLACK}`, boxShadow: `6px 6px 0 ${BLACK}`, borderRadius: 14, padding: "8px 16px 10px", fontFamily: "Inter, sans-serif", fontWeight: 900, fontStyle: "italic", fontSize: size, letterSpacing: "-0.02em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{children}</div>
  );
}

const PHONE_CLIP = { srcW: 1000, srcH: 1778, w: 376, h: 684 };
const comedyLook = (calmFrom: number, calmUntil: number): CaptionLook => ({
  y: 884,
  group: 560,
  block: { fontFamily: "Inter, sans-serif", fontWeight: 900, fontStyle: "italic", fontSize: 40, lineHeight: 1.05, gap: "4px 10px", textTransform: "uppercase", letterSpacing: "-0.02em" },
  word: (state, k) => ({
    color: state === "now" ? BLACK : "#FFFFFF",
    background: state === "now" ? YELLOW : "transparent",
    border: state === "now" ? `3px solid ${BLACK}` : "3px solid transparent",
    borderRadius: 10,
    padding: "0 8px 3px",
    opacity: state === "next" ? 0.55 : 1,
    WebkitTextStroke: state === "now" ? "0" : `2px ${BLACK}`,
    paintOrder: "stroke fill",
    textShadow: state === "now" ? "none" : `3px 3px 0 ${BLACK}`,
    transform: `rotate(${state === "now" ? -3 : 0}deg) scale(${state === "now" ? 0.9 + 0.16 * k : 1})`,
  }),
  // (les bornes servent seulement à documenter où la vidéo se calme)
  band: calmFrom < calmUntil ? undefined : undefined,
});

export function StyleComedy() {
  return (
    <Film
      vo={voDe1Json as VoFile}
      voice={voiceDe1}
      music={musicComedy}
      //       Morgen Klausur…?  Tief durchatmen.  Wirf deine…  Unsere KI…  Schritt für Schritt.  Entspann dich…
      starts={[0.3, 2.95, 4.6, 6.6, 10.9, 12.6]}
      look={comedyLook(2.8, 4.5)}
      captionsUntil={s(15.05)}
      musicVolume={0.24}
      sfx={[cue(2, sfxAlarm, 0.42), cue(s(2.8), sfxWhoosh, 0.45), cue(s(4.5), sfxPop, 0.45), cue(s(5.6), sfxPop, 0.4), cue(s(6.5) - 3, sfxWhoosh, 0.3), cue(s(9.6), sfxPop, 0.45), cue(s(12.4), sfxSuccess, 0.4)]}
    >
      {(plan) => {
        const f = (w: string, nth?: number) => plan.frameOf(w, nth);
        return (
          <>
            {/* 1 · Panique : alarme, compte à rebours, les feuilles volent. */}
            <Scene from={0} to={2.8}>
              <Panic nullAt={f("null")} />
            </Scene>

            {/* 2 · Tout s'arrête : on respire. */}
            <Scene from={2.8} to={4.5}>
              <Breathe />
            </Scene>

            {/* 3 · Les Skripte partent dans TRED. */}
            <Scene from={4.5} to={6.5}>
              <AbsoluteFill style={{ background: MINT }}>
                <Halftone color={TEAL} opacity={0.14} />
                <ComicPhone wobble={0.6}>
                  <Clip name="app-v8-de-import3.mp4" from={1.9} rate={1.7} {...PHONE_CLIP} />
                </ComicPhone>
                <Burst at={6} x={70} y={84} rotate={-5} size={34}>
                  Skripte rein!
                </Burst>
              </AbsoluteFill>
            </Scene>

            {/* 4 · Le professeur explique l'essentiel, étape par étape. */}
            <Scene from={6.5} to={12.4}>
              <AbsoluteFill style={{ background: MINT }}>
                <Halftone color={TEAL} opacity={0.14} />
                <ComicPhone wobble={0.3}>
                  <Sequence durationInFrames={s(1.5)} layout="none">
                    <Clip name="app-v8-de-summary.mp4" from={1.1} rate={2.3} {...PHONE_CLIP} />
                  </Sequence>
                  <Sequence from={s(1.5)} layout="none">
                    <Clip name="app-v8-de-summary.mp4" from={5.2} rate={1.25} {...PHONE_CLIP} />
                  </Sequence>
                </ComicPhone>
                <Burst at={f("Sekunden") - s(6.5) - 4} x={250} y={96} rotate={7} bg={ALARM} color="#FFFFFF" size={32}>
                  In Sekunden!
                </Burst>
                {[1, 2, 3].map((n) => (
                  <Burst key={n} at={f("Schritt") - s(6.5) + (n - 1) * 9} x={34 + (n - 1) * 62} y={84} rotate={-6 + n * 3} size={34}>
                    {n}
                  </Burst>
                ))}
              </AbsoluteFill>
            </Scene>

            {/* 5 · Détente : c'est sous contrôle. */}
            <Scene from={12.4} to={17.2}>
              <Chill />
            </Scene>
          </>
        );
      }}
    </Film>
  );
}

function Panic({ nullAt }: { nullAt: number }) {
  const frame = useCurrentFrame();
  const flash = Math.floor(frame / 5) % 2 === 0;
  const shake = [Math.sin(frame * 2.1) * 7, Math.cos(frame * 1.7) * 6];
  // 8 h 59 min 59 s qui fondent : cent fois plus vite que le vrai temps.
  const left = Math.max(0, 8 * 3600 + 59 * 60 + 59 - frame * 97);
  const hh = String(Math.floor(left / 3600)).padStart(2, "0");
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const k = pop(frame, 1, 9);
  return (
    <AbsoluteFill style={{ background: flash ? ALARM : "#8E0B1C", overflow: "hidden" }}>
      <Halftone color={BLACK} opacity={0.2} />
      <AbsoluteFill style={{ transform: `translate(${shake[0]}px, ${shake[1]}px)` }}>
        {Array.from({ length: 11 }, (_, i) => (
          <Sheet key={i} i={i} />
        ))}
        <div style={{ position: "absolute", top: 150, left: 0, right: 0, textAlign: "center", transform: `scale(${0.5 + 0.5 * k}) rotate(-4deg)` }}>
          <div style={comic(96, YELLOW)}>Morgen</div>
          <div style={comic(88)}>Klausur</div>
        </div>
        <div style={{ position: "absolute", top: 420, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <div style={{ background: BLACK, border: `5px solid ${YELLOW}`, borderRadius: 18, padding: "10px 26px 12px", fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace", fontWeight: 800, fontSize: 68, color: flash ? "#FF5468" : "#FFFFFF", letterSpacing: "0.04em", boxShadow: `8px 8px 0 ${BLACK}` }}>
            {hh}:{mm}:{ss}
          </div>
        </div>
        {frame >= nullAt && (
          <div style={{ position: "absolute", top: 590, left: 0, right: 0, textAlign: "center", transform: `rotate(5deg) scale(${0.5 + 0.5 * pop(frame, nullAt, 8)})` }}>
            <span style={{ ...comic(64, "#FFFFFF"), background: BLACK, padding: "4px 20px 10px", borderRadius: 16, WebkitTextStroke: "0", textShadow: "none" }}>Null Plan?</span>
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function Breathe() {
  const frame = useCurrentFrame();
  const calm = progress(frame, 0, 10, easeOut);
  const breath = 1 + Math.sin((frame / FPS) * Math.PI * 1.15) * 0.16;
  return (
    <AbsoluteFill style={{ background: MINT, overflow: "hidden" }}>
      <AbsoluteFill style={{ background: ALARM, opacity: 1 - calm }} />
      <Halftone color={TEAL} opacity={0.14 * calm} />
      {Array.from({ length: 11 }, (_, i) => (
        <Sheet key={i} i={i} freezeAt={0} calm />
      ))}
      <div style={{ position: "absolute", left: W / 2 - 150, top: 300, width: 300, height: 300, borderRadius: 300, background: "rgb(31 138 112 / 0.16)", border: `4px solid ${TEAL}`, transform: `scale(${breath})`, opacity: calm }} />
      <div style={{ position: "absolute", left: W / 2 - 96, top: 354, width: 192, height: 192, borderRadius: 192, background: "rgb(31 138 112 / 0.22)", transform: `scale(${2 - breath})`, opacity: calm }} />
      <div style={{ position: "absolute", top: 406, left: 0, right: 0, textAlign: "center", fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: 46, letterSpacing: "-0.02em", color: NAVY, opacity: progress(frame, 6, 16) }}>
        Tief
        <br />
        durchatmen.
      </div>
    </AbsoluteFill>
  );
}

function Chill() {
  const frame = useCurrentFrame();
  const k = pop(frame, 2, 12);
  const draw = progress(frame, 6, 22, easeInOut);
  return (
    <AbsoluteFill style={{ background: MINT, alignItems: "center" }}>
      <Halftone color={TEAL} opacity={0.14} />
      <div style={{ position: "absolute", top: 150, width: 190, height: 190, borderRadius: 190, background: TEAL, border: `5px solid ${BLACK}`, boxShadow: `8px 8px 0 ${BLACK}`, display: "grid", placeItems: "center", transform: `scale(${0.4 + 0.6 * k}) rotate(-6deg)` }}>
        <svg width="110" height="110" viewBox="0 0 110 110">
          <path d="M22 58 L46 82 L90 30" fill="none" stroke="#FFFFFF" strokeWidth="15" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="110" strokeDashoffset={110 * (1 - draw)} />
        </svg>
      </div>
      <div style={{ position: "absolute", top: 384, left: 20, right: 20, textAlign: "center", transform: "rotate(-3deg)" }}>
        <div style={{ ...comic(54, NAVY), WebkitTextStroke: "0", textShadow: `4px 4px 0 ${YELLOW}`, opacity: progress(frame, 10, 20) }}>Du hast das</div>
        <div style={{ ...comic(70, "#FFFFFF"), marginTop: 6, opacity: progress(frame, 18, 28) }}>
          <span style={{ background: TEAL, padding: "2px 18px 10px", borderRadius: 18, border: `4px solid ${BLACK}`, boxShadow: `6px 6px 0 ${BLACK}`, WebkitTextStroke: "0", textShadow: "none" }}>im Griff.</span>
        </div>
      </div>
      <div style={{ position: "absolute", top: 610, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 16, opacity: progress(frame, 34, 46) }}>
        <Logo variant="stacked" markClassName="h-[96px] text-[#12263F]" className="text-[#12263F]" />
        <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 900, fontStyle: "italic", fontSize: 26, color: BLACK, background: YELLOW, border: `4px solid ${BLACK}`, boxShadow: `5px 5px 0 ${BLACK}`, padding: "8px 20px 10px", borderRadius: 14 }}>tred-tutor.de</span>
      </div>
    </AbsoluteFill>
  );
}

/** Identifiant de composition, composant, durée (images). */
export const STYLES = [
  ["V8-EN2-Documentary-Study-Plan", StyleDocumentary, s(18.6)],
  ["V8-DE1-Comedy-Morgen-Klausur", StyleComedy, s(17.2)],
] as const;

// Garde : H sert aux cadrages plein écran des futurs styles (EN 1, EN 3).
export const FRAME = { W, H };
