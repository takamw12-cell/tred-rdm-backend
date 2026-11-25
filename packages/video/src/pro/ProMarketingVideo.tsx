import { useMemo } from "react";
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";

/**
 * « Pro Marketing » (19 nov. 2026) — 6 vidéos de 30 s (3 EN, 3 DE), l'identité
 * propre à TRED : dégradé maillé bleu nuit très sombre, l'interface RÉELLE de
 * TRED qui flotte dans des cartes de verre poli, écran partagé « réponse /
 * vraie page du PDF », Inter, sous-titres mot par mot.
 * Structure de chaque storyboard : accroche (0–3 s), corps, appel à l'action.
 *
 * Les mouvements sont des RESSORTS (spring de Remotion, même physique que
 * Framer Motion) : Framer Motion anime sur l'horloge du navigateur, alors
 * qu'un rendu Remotion calcule chaque image à part — ses animations y
 * sauteraient. spring() donne le même effet, image par image, à l'identique.
 *
 * Le contenu vient des storyboards JSON (src/pro/storyboards/). La voix et la
 * musique sont facultatives (public/pro/, voir LISEZ-MOI) : sans voix, les
 * sous-titres suivent le rythme du storyboard ; avec la voix d'ElevenLabs et
 * ses mots horodatés, les scènes se calent sur la voix.
 */
export const PRO_FPS = 30;
export const PRO_W = 1080;
export const PRO_H = 1920;
const FADE = 18;

export interface ProScene {
  /** hook = accroche (0–3 s), body = corps, cta = appel à l'action. */
  part?: "hook" | "body" | "cta";
  seconds: number;
  kind: "broll" | "glass" | "split" | "statement" | "outro";
  /** Écran partagé : la seconde carte (souvent la vraie page du PDF). */
  media2?: string;
  label2?: string;
  media?: string;
  focus?: { x: number; y: number; zoom: number };
  /** Vidéo : seconde de la prise à laquelle la scène commence. */
  from?: number;
  eyebrow?: string;
  headline: string;
  sub?: string;
  voice: string;
}
export interface Storyboard {
  id: string;
  lang: "en" | "de";
  voiceId: string;
  title: string;
  palette: keyof typeof PALETTES;
  scenes: ProScene[];
  /**
   * « duo » : écran partagé. En haut, la vraie interface de TRED ; en bas, le
   * présentateur (voir `presenter`). Sans ce champ : la mise en page d'origine.
   */
  layout?: "duo";
  presenter?: {
    /** Nom affiché sous le présentateur. */
    name: string;
    /** Portrait dans le dossier public de Remotion (packages/web/public), ex. « avatars/ren.png ». */
    image: string;
  };
}
export interface Word {
  text: string;
  startMs: number;
  endMs: number;
}
export type ProProps = {
  board: Storyboard;
  /** Calculés par calculateMetadata : début et longueur de chaque scène (images). */
  timeline?: Array<{ from: number; dur: number }>;
  /** Mots horodatés de la voix (ElevenLabs), ou mots répartis sur la scène. */
  words?: Array<Word & { scene: number }>;
};

/* ── Fichiers : médias du dépôt, voix et musique déposées dans public/pro ── */

type Ctx = { (key: string): unknown; keys(): string[] };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tiktok = (require as any).context("../assets/tiktok", false, /\.(jpg|mp4)$/) as Ctx;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pro = (require as any).context("../assets/pro", false, /\.(png|jpg)$/) as Ctx;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dropped = (require as any).context("../../public/pro", false, /\.(mp3|wav|json|mp4)$/) as Ctx;
const url = (m: unknown) => (typeof m === "string" ? m : (m as { default: string }).default);

export function mediaOf(name: string): { src: string; video: boolean } | null {
  for (const [ctx, ext] of [[tiktok, ".mp4"], [tiktok, ".jpg"], [pro, ".png"], [pro, ".jpg"]] as const) {
    if (ctx.keys().includes(`./${name}${ext}`)) return { src: url(ctx(`./${name}${ext}`)), video: ext === ".mp4" };
  }
  return null;
}
function droppedFile(name: string): unknown {
  return dropped.keys().includes(`./${name}`) ? dropped(`./${name}`) : null;
}
export const voiceOf = (id: string) => {
  const mp3 = droppedFile(`vo-${id}.mp3`);
  const json = droppedFile(`vo-${id}.json`) as { words?: Word[] } | null;
  return mp3 && json?.words?.length ? { src: url(mp3), words: json.words } : null;
};
/** L'avatar HeyGen de cette vidéo (scripts/heygen-avatar.mjs), s'il a été généré. */
export const avatarOf = (id: string) => {
  const m = droppedFile(`avatar-${id}.mp4`);
  return m ? url(m) : null;
};
export const musicOf = (id: string) => {
  const m = droppedFile(`music-${id}.mp3`) ?? droppedFile(`music-${id}.wav`) ?? droppedFile("music.mp3") ?? droppedFile("music.wav");
  return m ? url(m) : null;
};

/* ── Le calendrier : sur la voix si elle existe, sinon sur le storyboard ── */

export function buildTimeline(board: Storyboard, voice: { words: Word[] } | null) {
  const counts = board.scenes.map((s) => s.voice.split(/\s+/).filter(Boolean).length);
  if (voice) {
    const timeline: Array<{ from: number; dur: number }> = [];
    const words: Array<Word & { scene: number }> = [];
    let k = 0;
    board.scenes.forEach((s, i) => {
      const own = voice.words.slice(k, k + counts[i]!);
      k += counts[i]!;
      own.forEach((w) => words.push({ ...w, scene: i }));
      const start = i === 0 ? 0 : Math.max(0, Math.round(((own[0]?.startMs ?? 0) / 1000) * PRO_FPS) - 8);
      timeline.push({ from: start, dur: 0 });
    });
    const end = Math.round(((voice.words.at(-1)?.endMs ?? 0) / 1000 + 1.6) * PRO_FPS);
    timeline.forEach((t, i) => (t.dur = (timeline[i + 1]?.from ?? end) - t.from));
    return { timeline, words, total: end };
  }
  const timeline: Array<{ from: number; dur: number }> = [];
  const words: Array<Word & { scene: number }> = [];
  let at = 0;
  board.scenes.forEach((s, i) => {
    const dur = Math.round(s.seconds * PRO_FPS);
    timeline.push({ from: at, dur });
    // Sans voix : les mots se répartissent entre 0,3 s et la fin de la scène moins 0,5 s.
    const list = s.voice.split(/\s+/).filter(Boolean);
    const t0 = (at / PRO_FPS) * 1000 + 300;
    const span = Math.max(600, s.seconds * 1000 - 800);
    list.forEach((text, j) => words.push({ text, scene: i, startMs: t0 + (span * j) / list.length, endMs: t0 + (span * (j + 1)) / list.length }));
    at += dur;
  });
  return { timeline, words, total: at };
}

export const calculateProMetadata: CalculateMetadataFunction<ProProps> = ({ props }) => {
  const { timeline, words, total } = buildTimeline(props.board, voiceOf(props.board.id));
  return { durationInFrames: total, props: { ...props, timeline, words } };
};

/* ── Le décor : dégradé maillé bleu nuit, lent ─────────────────────────── */

export const PALETTES = {
  // fond, taches de lumière, couleur d'accent (la pastille jaune de TRED par défaut)
  night: { base: "#060A16", blobs: ["#13254F", "#1B1F4A", "#0E3A4A", "#2A1E4D"], accent: "#EAB308" },
  aurora: { base: "#050B14", blobs: ["#0F3346", "#123B3A", "#1A2552", "#0B2A3F"], accent: "#5EEAD4" },
  violet: { base: "#08081A", blobs: ["#24195A", "#16295A", "#3A1A4F", "#122245"], accent: "#C4B5FD" },
} as const;
const INK = "#F4F6FB";
const MUTED = "rgba(226,232,240,0.62)";
const SANS = "Inter, ui-sans-serif, system-ui, sans-serif";

function MeshBackground({ palette }: { palette: (typeof PALETTES)[keyof typeof PALETTES] }) {
  const f = useCurrentFrame();
  const spots = [
    { x: 15, y: 15, r: 1000 },
    { x: 90, y: 38, r: 900 },
    { x: 20, y: 80, r: 1050 },
    { x: 80, y: 95, r: 820 },
  ];
  return (
    <AbsoluteFill style={{ background: palette.base, overflow: "hidden" }}>
      {spots.map((s, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${s.x + Math.sin(f / (150 + i * 23) + i) * 7}%`,
            top: `${s.y + Math.cos(f / (180 + i * 19) + i * 2) * 5}%`,
            width: s.r,
            height: s.r,
            marginLeft: -s.r / 2,
            marginTop: -s.r / 2,
            borderRadius: "50%",
            background: palette.blobs[i],
            filter: "blur(140px)",
            opacity: 0.9,
          }}
        />
      ))}
      {/* Vignette : le centre respire, les bords s'éteignent. */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 35%, rgba(2,4,10,0.65))" }} />
    </AbsoluteFill>
  );
}

/** Grain très léger : évite les aplats « numériques » et le banding des dégradés. */
function Grain() {
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "overlay", opacity: 0.1 }}>
      <svg width="100%" height="100%">
        <filter id="pro-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#pro-grain)" />
      </svg>
    </AbsoluteFill>
  );
}

/** Ressort doux (amorti, sans rebond visible) ou vif (léger dépassement). */
const soft = (frame: number, delay = 0) => spring({ frame: frame - delay, fps: PRO_FPS, config: { damping: 200, stiffness: 90, mass: 1 } });
const lively = (frame: number, delay = 0) => spring({ frame: frame - delay, fps: PRO_FPS, config: { damping: 14, stiffness: 120, mass: 0.9 } });

/* ── Les éléments ───────────────────────────────────────────────────────── */

function Headline({ text, size, top, local, color = INK }: { text: string; size: number; top: number; local: number; color?: string }) {
  const t = soft(local, 4);
  return (
    <div style={{ position: "absolute", left: 80, right: 80, top, textAlign: "center", fontFamily: SANS, fontWeight: 700, fontSize: size, lineHeight: 1.06, letterSpacing: "-0.03em", color, opacity: t, transform: `translateY(${(1 - t) * 40}px)`, filter: `blur(${(1 - t) * 10}px)` }}>
      {text}
    </div>
  );
}

function Eyebrow({ text, local, accent }: { text: string; local: number; accent: string }) {
  const t = soft(local, 0);
  return (
    <div style={{ position: "absolute", top: 200, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: t }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 14, fontFamily: SANS, fontSize: 30, fontWeight: 600, color: INK, padding: "12px 26px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.14)", backdropFilter: "blur(14px)" }}>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: accent, boxShadow: `0 0 18px ${accent}` }} />
        {text}
      </span>
    </div>
  );
}

/** Carte de verre poli qui flotte : un reflet en haut, une ombre profonde, un léger tangage. */
function GlassCard({ children, style, local, delay = 0, tilt = 0, light = false }: { children: React.ReactNode; style: React.CSSProperties; local: number; delay?: number; tilt?: number; light?: boolean }) {
  const t = lively(local, 4 + delay);
  const drift = Math.sin((local + delay * 7) / 40) * 9;
  return (
    <div
      style={{
        position: "absolute",
        padding: 14,
        borderRadius: 44,
        background: "linear-gradient(160deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04))",
        border: "1.5px solid rgba(255,255,255,0.18)",
        boxShadow: "0 60px 120px -40px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.35)",
        backdropFilter: "blur(28px)",
        opacity: Math.min(1, t * 1.4),
        transform: `translateY(${(1 - t) * 140 + drift}px) scale(${0.92 + 0.08 * t}) rotate(${tilt * t + Math.sin(local / 75) * 0.35}deg)`,
        ...style,
      }}
    >
      <div style={{ width: "100%", height: "100%", borderRadius: 32, overflow: "hidden", background: light ? "#FFFFFF" : "#0B0F19" }}>{children}</div>
    </div>
  );
}

function Media({ name, from, focus, fit }: { name?: string; from?: number; focus?: ProScene["focus"]; fit?: "cover" | "contain" }) {
  const m = name ? mediaOf(name) : null;
  if (!m) return null;
  const f = focus ?? { x: 50, y: 50, zoom: 1 };
  const style = { width: "100%", height: "100%", objectFit: fit ?? (m.video ? "cover" : "contain"), objectPosition: `${f.x}% ${f.y}%`, transform: `scale(${f.zoom})`, transformOrigin: `${f.x}% ${f.y}%` } as const;
  return m.video ? <OffthreadVideo src={m.src} muted trimBefore={Math.round((from ?? 0) * PRO_FPS)} style={style} /> : <Img src={m.src} style={style} />;
}

/* ── Les scènes ─────────────────────────────────────────────────────────── */

function BrollScene({ scene, local, dur }: { scene: ProScene; local: number; dur: number }) {
  const f = scene.focus ?? { x: 50, y: 50, zoom: 1 };
  const zoom = f.zoom * interpolate(local, [0, dur], [1.04, 1.12]);
  return (
    <AbsoluteFill style={{ background: "#05070D" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: `${f.x}% ${f.y}%` }}>
        <Media name={scene.media} from={scene.from} fit="cover" />
      </AbsoluteFill>
      {/* Étalonnage bleu nuit : le plan d'ambiance rejoint l'univers de TRED. */}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(6,10,22,0.35), rgba(6,10,22,0.15) 40%, rgba(6,10,22,0.85))" }} />
      <AbsoluteFill style={{ background: "rgba(30,50,110,0.22)", mixBlendMode: "color" }} />
      <Headline text={scene.headline} size={112} top={680} local={local} />
    </AbsoluteFill>
  );
}

function GlassScene({ scene, local, accent }: { scene: ProScene; local: number; accent: string }) {
  const m = scene.media ? mediaOf(scene.media) : null;
  return (
    <AbsoluteFill>
      {scene.eyebrow && <Eyebrow text={scene.eyebrow} local={local} accent={accent} />}
      <Headline text={scene.headline} size={80} top={290} local={local} />
      <GlassCard local={local} light={!m?.video} tilt={-1.2} style={{ left: 70, right: 70, top: 540, height: 900 }}>
        <Media name={scene.media} from={scene.from} focus={scene.focus} />
      </GlassCard>
    </AbsoluteFill>
  );
}

/** Écran partagé : à gauche la réponse dans TRED, à droite la vraie page du PDF qui la prouve. */
function SplitScene({ scene, local, accent }: { scene: ProScene; local: number; accent: string }) {
  const link = soft(local, 26);
  return (
    <AbsoluteFill>
      {scene.eyebrow && <Eyebrow text={scene.eyebrow} local={local} accent={accent} />}
      <Headline text={scene.headline} size={80} top={290} local={local} />
      <GlassCard local={local} tilt={-2.5} style={{ left: 40, width: 520, top: 560, height: 880 }}>
        <Media name={scene.media} from={scene.from} focus={scene.focus} fit="cover" />
      </GlassCard>
      <GlassCard local={local} delay={10} tilt={2.5} light style={{ right: 40, width: 470, top: 640, height: 800 }}>
        <Media name={scene.media2} fit="cover" focus={{ x: 50, y: 22, zoom: 1 }} />
      </GlassCard>
      {/* Le lien entre les deux : la page citée. */}
      {scene.label2 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 1470, display: "flex", justifyContent: "center", opacity: link, transform: `translateY(${(1 - link) * 20}px)` }}>
          <span style={{ fontFamily: SANS, fontSize: 32, fontWeight: 600, color: "#0B0F19", padding: "12px 26px", borderRadius: 999, background: accent, boxShadow: `0 0 40px ${accent}66` }}>{scene.label2}</span>
        </div>
      )}
    </AbsoluteFill>
  );
}

function StatementScene({ scene, local }: { scene: ProScene; local: number }) {
  const words = scene.headline.split(" ");
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 90 }}>
      <div style={{ fontFamily: SANS, fontWeight: 700, fontSize: 110, lineHeight: 1.04, letterSpacing: "-0.035em", color: INK, textAlign: "center" }}>
        {words.map((w, i) => {
          const t = lively(local, 4 + i * 4);
          return (
            <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: Math.min(1, t * 1.3), transform: `translateY(${(1 - t) * 30}px)`, filter: `blur(${Math.max(0, 1 - t) * 8}px)` }}>
              {w}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

function OutroScene({ scene, local, accent }: { scene: ProScene; local: number; accent: string }) {
  const t = lively(local, 2);
  const t2 = soft(local, 16);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div style={{ opacity: Math.min(1, t * 1.3), transform: `scale(${0.9 + 0.1 * t})`, textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 176, letterSpacing: "0.02em", color: INK }}>TRED</div>
        <div style={{ height: 8, width: 130 * t2, margin: "6px auto 0", borderRadius: 4, background: accent, boxShadow: `0 0 30px ${accent}` }} />
      </div>
      <div style={{ marginTop: 70, opacity: t2, transform: `translateY(${(1 - t2) * 24}px)`, textAlign: "center" }}>
        <div style={{ fontFamily: SANS, fontWeight: 600, fontSize: 56, color: INK, padding: "18px 42px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.2)", backdropFilter: "blur(16px)" }}>{scene.headline}</div>
        {scene.sub && <div style={{ marginTop: 26, fontFamily: SANS, fontSize: 36, color: MUTED }}>{scene.sub}</div>}
      </div>
    </AbsoluteFill>
  );
}

/* ── Sous-titres mot par mot ───────────────────────────────────────────── */

function Captions({ words, scene, accent, bottom = 150, size = 48 }: { words: Array<Word & { scene: number }>; scene: number; accent: string; bottom?: number; size?: number }) {
  const frame = useCurrentFrame();
  const ms = (frame / PRO_FPS) * 1000;
  const own = words.filter((w) => w.scene === scene);
  if (own.length === 0 || ms < own[0]!.startMs - 100) return null;
  const end = own.at(-1)!.endMs;
  const fadeOut = interpolate(ms, [end + 250, end + 650], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (fadeOut <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 70, right: 70, bottom, display: "flex", justifyContent: "center", opacity: fadeOut }}>
      <div style={{ maxWidth: 940, padding: "20px 32px", borderRadius: 30, textAlign: "center", background: "rgba(8,12,26,0.55)", border: "1.5px solid rgba(255,255,255,0.14)", backdropFilter: "blur(18px)", fontFamily: SANS, fontSize: size, lineHeight: 1.25, fontWeight: 600, letterSpacing: "-0.01em" }}>
        {own.map((w, i) => {
          // Mot par mot : chaque mot arrive sur un petit ressort quand il est prononcé ; le mot en cours prend l'accent.
          const appear = lively(frame, Math.round((w.startMs / 1000) * PRO_FPS) - 2);
          if (appear <= 0.001) return null;
          const speaking = ms >= w.startMs && ms <= w.endMs + 120;
          return (
            <span key={i} style={{ display: "inline-block", marginRight: "0.26em", color: speaking ? accent : INK, opacity: Math.min(1, appear * 1.4), transform: `translateY(${(1 - appear) * 14}px) scale(${0.9 + 0.1 * appear})` }}>
              {w.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── Écran partagé « duo » : l'interface en haut, le présentateur en bas ── */

/** Hauteur de la zone du haut (l'interface de TRED). Le présentateur occupe le reste. */
const DUO_TOP = 1130;

function DuoScene({ scene, local, dur, accent }: { scene: ProScene; local: number; dur: number; accent: string }) {
  const m = scene.media ? mediaOf(scene.media) : null;
  if (scene.kind === "outro") {
    const t = lively(local, 2);
    const t2 = soft(local, 14);
    return (
      <AbsoluteFill style={{ height: DUO_TOP, alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: Math.min(1, t * 1.3), transform: `scale(${0.9 + 0.1 * t})`, fontFamily: SANS, fontWeight: 800, fontSize: 168, letterSpacing: "0.02em", color: INK }}>TRED</div>
        <div style={{ height: 8, width: 130 * t2, marginTop: 6, borderRadius: 4, background: accent, boxShadow: `0 0 30px ${accent}` }} />
        <div style={{ marginTop: 60, opacity: t2, fontFamily: SANS, fontWeight: 600, fontSize: 54, color: INK, padding: "18px 42px", borderRadius: 999, background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.2)" }}>{scene.headline}</div>
        {scene.sub && <div style={{ marginTop: 24, opacity: t2, fontFamily: SANS, fontSize: 36, color: MUTED }}>{scene.sub}</div>}
      </AbsoluteFill>
    );
  }
  if (!m) {
    // Pas de capture : une phrase forte, mot par mot (accroche, problème).
    const words = scene.headline.split(" ");
    return (
      <AbsoluteFill style={{ height: DUO_TOP, alignItems: "center", justifyContent: "center", padding: 80 }}>
        {scene.eyebrow && <div style={{ marginBottom: 36, fontFamily: SANS, fontSize: 34, fontWeight: 600, color: accent, letterSpacing: "0.08em", textTransform: "uppercase", opacity: soft(local, 0) }}>{scene.eyebrow}</div>}
        <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 100, lineHeight: 1.05, letterSpacing: "-0.035em", color: INK, textAlign: "center" }}>
          {words.map((w, i) => {
            const t = lively(local, 3 + i * 4);
            return (
              <span key={i} style={{ display: "inline-block", marginRight: "0.24em", opacity: Math.min(1, t * 1.3), transform: `translateY(${(1 - t) * 30}px)` }}>
                {w}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    );
  }
  // La capture réelle, dans une carte de verre, avec un lent travelling vers le point d'intérêt.
  const f = scene.focus ?? { x: 50, y: 50, zoom: 1 };
  const k = interpolate(local, [0, dur], [0.9, 1.04], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ height: DUO_TOP }}>
      {scene.eyebrow && (
        <div style={{ position: "absolute", top: 70, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: soft(local, 0) }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 14, fontFamily: SANS, fontSize: 30, fontWeight: 600, color: INK, padding: "10px 24px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,255,255,0.14)" }}>
            <span style={{ width: 12, height: 12, borderRadius: 6, background: accent, boxShadow: `0 0 18px ${accent}` }} />
            {scene.eyebrow}
          </span>
        </div>
      )}
      <Headline text={scene.headline} size={66} top={150} local={local} />
      <GlassCard local={local} light={!m.video} tilt={-0.8} style={{ left: 44, right: 44, top: 330, height: 740 }}>
        <Media name={scene.media} from={scene.from} focus={{ ...f, zoom: f.zoom * k }} fit="cover" />
      </GlassCard>
    </AbsoluteFill>
  );
}

/**
 * Le présentateur, en buste, dans la moitié basse. L'avatar HeyGen s'il a été
 * généré ; sinon le portrait du professeur de l'application, qui « parle » :
 * il respire, un halo et un égaliseur suivent les mots de la voix. Ce n'est
 * PAS une synchronisation des lèvres — le portrait est une image fixe.
 */
function Presenter({ id, presenter, words, accent }: { id: string; presenter: NonNullable<Storyboard["presenter"]>; words: Word[]; accent: string }) {
  // public/pro/avatar-<id>.mp4 : l'avatar HeyGen, synchronisé sur la voix. Sans lui, le portrait.
  const avatar = avatarOf(id);
  const frame = useCurrentFrame();
  const ms = (frame / PRO_FPS) * 1000;
  const speaking = words.some((w) => ms >= w.startMs - 40 && ms <= w.endMs + 90);
  // Niveau sonore simulé : lissé sur quelques images, pour ne pas clignoter entre deux mots.
  const level = [0, 1, 2, 3].reduce((a, d) => a + (words.some((w) => ms - d * 33 >= w.startMs - 40 && ms - d * 33 <= w.endMs + 90) ? 1 : 0), 0) / 4;
  const enter = lively(frame, 6);
  const SIZE = 430;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: DUO_TOP, bottom: 0 }}>
      {/* Séparation douce entre l'écran et le présentateur. */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,7,16,0.35), rgba(4,7,16,0.72))" }} />
      <div style={{ position: "absolute", left: "50%", top: 44, width: SIZE, height: SIZE, marginLeft: -SIZE / 2, opacity: Math.min(1, enter * 1.3), transform: `translateY(${(1 - enter) * 60}px) scale(${1 + 0.012 * Math.sin(frame / 22) + 0.014 * level})` }}>
        <div style={{ position: "absolute", inset: -14, borderRadius: "50%", border: `4px solid ${accent}`, opacity: 0.25 + 0.65 * level, boxShadow: `0 0 ${30 + 60 * level}px ${accent}` }} />
        <div style={{ width: "100%", height: "100%", borderRadius: "50%", overflow: "hidden", border: "3px solid rgba(255,255,255,0.35)", background: "#FDF7EC" }}>
          {avatar ? <OffthreadVideo src={avatar} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Img src={staticFile(presenter.image)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: 44 + SIZE + 34, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, opacity: enter }}>
        <span style={{ fontFamily: SANS, fontSize: 34, fontWeight: 700, color: INK }}>{presenter.name}</span>
        <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 5, height: 34 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ width: 6, borderRadius: 3, background: accent, height: 6 + (speaking ? 1 : 0) * level * (10 + 18 * Math.abs(Math.sin(frame / (2.3 + i * 0.7) + i * 1.9))) }} />
          ))}
        </span>
      </div>
    </div>
  );
}

/* ── La composition ───────────────────────────────────────────────────── */

export function ProMarketingVideo({ board, timeline, words }: ProProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const palette = PALETTES[board.palette] ?? PALETTES.night;
  const plan = useMemo(() => (timeline && words ? { timeline, words } : buildTimeline(board, null)), [board, timeline, words]);
  const voice = voiceOf(board.id);
  const music = musicOf(board.id);
  const current = plan.timeline.reduce((acc, t, i) => (frame >= t.from ? i : acc), 0);
  return (
    <AbsoluteFill style={{ background: palette.base }}>
      <MeshBackground palette={palette} />
      {board.scenes.map((scene, i) => {
        const { from, dur } = plan.timeline[i]!;
        const length = i === board.scenes.length - 1 ? dur : dur + FADE;
        return (
          <Sequence key={i} from={from} durationInFrames={Math.max(1, length)} layout="none">
            <SceneLayer index={i} scene={scene} dur={dur} accent={palette.accent} duo={board.layout === "duo"} />
          </Sequence>
        );
      })}
      {board.layout === "duo" && board.presenter && <Presenter id={board.id} presenter={board.presenter} words={plan.words} accent={palette.accent} />}
      <Captions words={plan.words} scene={current} accent={palette.accent} {...(board.layout === "duo" ? { bottom: 70, size: 44 } : {})} />
      <Grain />
      {voice && <Audio src={voice.src} />}
      {/* Musique synthétisée (scripts/lofi-music.mjs), en boucle ; −20 dB = 0,1 en amplitude, fondu à l'entrée et à la sortie. */}
      {music && <Audio src={music} loop volume={(f) => 0.1 * Math.min(1, f / 30, (durationInFrames - f) / 45)} />}
    </AbsoluteFill>
  );
}

function SceneLayer({ index, scene, dur, accent, duo = false }: { index: number; scene: ProScene; dur: number; accent: string; duo?: boolean }) {
  const local = useCurrentFrame();
  // Fondu enchaîné sur ressort : la scène entre (sauf la première, qui est l'accroche) pendant que la précédente s'efface en reculant.
  const enter = index === 0 ? 1 : soft(local, 0);
  const leave = local > dur ? soft(local - dur, 0) : 0;
  return (
    <AbsoluteFill style={{ opacity: Math.min(enter, 1 - leave), transform: `scale(${1 - 0.04 * leave})`, filter: leave > 0 ? `blur(${leave * 6}px)` : undefined }}>
      {duo && <DuoScene scene={scene} local={local} dur={dur} accent={accent} />}
      {!duo && scene.kind === "broll" && <BrollScene scene={scene} local={local} dur={dur} />}
      {!duo && scene.kind === "glass" && <GlassScene scene={scene} local={local} accent={accent} />}
      {!duo && scene.kind === "split" && <SplitScene scene={scene} local={local} accent={accent} />}
      {!duo && scene.kind === "statement" && <StatementScene scene={scene} local={local} />}
      {!duo && scene.kind === "outro" && <OutroScene scene={scene} local={local} accent={accent} />}
    </AbsoluteFill>
  );
}
