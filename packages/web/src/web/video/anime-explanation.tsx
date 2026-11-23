import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import katex from "katex";
import { AbsoluteFill, Audio, Img, continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { actionStart, camera, defaultAnime, focusPoint, TOOL_ANGLES, holding, mouthOpen, pointing, speaking, toolAngle, type AnimeScene, type AnimeTool } from "../../api/lib/video-anime";
import { musicGain, speechSpans } from "../../api/lib/video-motion";
import type { ExplainerScene, ExplainerWord } from "./dynamic-explanation";
import { Captions } from "./motion-explanation";

/**
 * « Als Video erklären » en style ANIME — la composition.
 *
 * L'image parle plus que le texte :
 *   · chaque scène (5 à 8 s) est une illustration plein écran, générée par
 *     Replicate d'après le script, et la caméra y bouge toujours (Ken Burns) ;
 *   · le professeur est incrusté en bas à droite. Trois états : il attend
 *     (il respire), il parle (sa bouche suit les mots de la voix), il montre
 *     du doigt ;
 *   · le texte n'apparaît que s'il est nécessaire : une bulle de manga, ou la
 *     formule qui s'écrit sur une note manuscrite ;
 *   · une flèche tracée à la main part du doigt du professeur et désigne le
 *     sujet de l'image.
 *
 * Jouée par le lecteur Remotion du navigateur, comme les autres vidéos. La
 * voix (ElevenLabs) et la musique sous la voix ne changent pas.
 */

export const ANIME_FPS = 30;

/** Les quatre poses du professeur, au MÊME cadrage (scripts/generate-professor-sprites.mjs). */
export type ProfessorSprites = { idle: string; talk: string; point: string; pointTalk: string; hold?: string; holdTalk?: string };

/** Les objets que le personnage prend et utilise (scripts/generate-video-props.mjs). */
export type ToolProps = { wrench: string; plank: string; rock: string; wedge: string };
export const toolProps = (base = "/video-props"): ToolProps => ({ wrench: `${base}/wrench.webp`, plank: `${base}/plank.webp`, rock: `${base}/rock.webp`, wedge: `${base}/wedge.webp` });

/** Les personnages qui ont leurs poses ; les autres vidéos montrent le mentor de TRED. */
const WITH_SPRITES = ["mentor", "kenta"];
/** Ceux qui ont aussi la pose « il tient » ; les autres montrent du doigt à la place. */
const WITH_HOLD = ["mentor"];
export function professorSprites(professor: string | null | undefined, base = "/avatars/video"): ProfessorSprites {
  const id = professor && WITH_SPRITES.includes(professor) ? professor : "mentor";
  return {
    idle: `${base}/${id}-idle.webp`,
    talk: `${base}/${id}-talk.webp`,
    point: `${base}/${id}-point.webp`,
    pointTalk: `${base}/${id}-point-talk.webp`,
    ...(WITH_HOLD.includes(id) ? { hold: `${base}/${id}-hold.webp`, holdTalk: `${base}/${id}-hold-talk.webp` } : {}),
  };
}

// `type` et non `interface` : Remotion exige des props assignables à Record<string, unknown>.
export type AnimeProps = {
  audioUrl: string;
  musicUrl?: string | null;
  durationMs: number;
  title: string;
  scenes: ExplainerScene[];
  words: ExplainerWord[];
  sceneStartsMs: number[];
  sprites: ProfessorSprites;
  /** Les images des objets animés. Absent : le dossier public de l'app. */
  props?: ToolProps;
  /** La police manuscrite (Caveat), si la page ne la charge pas déjà (export MP4). */
  handFontUrl?: string;
};

const HAND = "'Caveat', 'Segoe Print', 'Bradley Hand', cursive";
const INK = "#16181D";
const YELLOW = "#FFD23F";
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ramp = (f: number, from: number, len: number) => interpolate(f, [from, from + Math.max(1, len)], [0, 1], clamp);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const sp = (f: number, at: number, bounce = false) =>
  f < at ? 0 : spring({ frame: f - at, fps: ANIME_FPS, config: bounce ? { damping: 9, stiffness: 150, mass: 0.7 } : { damping: 16, stiffness: 120, mass: 0.8 } });

const CUT_FRAMES = 9;

/** La police manuscrite, attendue avant le premier rendu d'image (export MP4). */
function useHandFont(url?: string) {
  const [handle] = useState(() => (url ? delayRender("police manuscrite") : null));
  useEffect(() => {
    if (!url || handle === null) return;
    const face = new FontFace("Caveat", `url(${url})`, { weight: "400 700" });
    face
      .load()
      .then((f) => document.fonts.add(f))
      .catch(() => undefined)
      .finally(() => continueRender(handle));
  }, [url, handle]);
}

/* ── Le décor : l'illustration plein écran, et la caméra ───────────────── */

function Decor({ anime, index, local, frames }: { anime: AnimeScene; index: number; local: number; frames: number }) {
  const cam = camera(anime.action, index, local / Math.max(1, frames));
  const zoom = anime.action === "zoom_sur_prof" ? easeOut(ramp(local, actionStart(frames, ANIME_FPS), 14)) : 0;
  return (
    <AbsoluteFill style={{ background: "linear-gradient(160deg, #1E3A8A, #0F172A)" }}>
      {anime.image && (
        <Img
          src={anime.image}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `translate(${cam.x * 100}%, ${cam.y * 100}%) scale(${cam.scale})`, filter: zoom > 0 ? `blur(${zoom * 2.2}px) brightness(${1 - zoom * 0.22})` : undefined }}
        />
      )}
      {/* Zoom sur le professeur : des lignes de vitesse, comme dans une case de manga. */}
      {zoom > 0 && <AbsoluteFill style={{ opacity: zoom * 0.22, background: "repeating-conic-gradient(from 0deg at 82% 78%, #fff 0deg 1.2deg, transparent 1.2deg 9deg)", maskImage: "radial-gradient(circle at 82% 78%, transparent 28%, #000 62%)", WebkitMaskImage: "radial-gradient(circle at 82% 78%, transparent 28%, #000 62%)" }} />}
      {/* Le bas s'assombrit un peu : les sous-titres restent lisibles sur toute image. */}
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgb(6 10 22 / 0.55), transparent 26%)" }} />
    </AbsoluteFill>
  );
}

/* ── La flèche tracée à la main ────────────────────────────────────────── */

function HandArrow({ from, to, progress }: { from: [number, number]; to: [number, number]; progress: number }) {
  if (progress <= 0) return null;
  const [x0, y0] = from;
  const [x1, y1] = to;
  // Une courbe qui monte puis redescend sur le sujet.
  const cx = (x0 + x1) / 2 + (y1 - y0) * 0.18;
  const cy = Math.min(y0, y1) - Math.abs(x1 - x0) * 0.22;
  const d = `M ${x0} ${y0} Q ${cx} ${cy} ${x1} ${y1}`;
  const line = easeOut(Math.min(1, progress / 0.75));
  const head = ramp(progress, 0.7, 0.3);
  const a = Math.atan2(y1 - cy, x1 - cx);
  const wing = (da: number) => `M ${x1} ${y1} L ${x1 - 30 * Math.cos(a + da)} ${y1 - 30 * Math.sin(a + da)}`;
  const strokes = (color: string, w: number) => (
    <g stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - line} />
      {head > 0 && (
        <>
          <path d={wing(0.5)} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - head} />
          <path d={wing(-0.5)} pathLength={1} strokeDasharray="1" strokeDashoffset={1 - head} />
        </>
      )}
    </g>
  );
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      {strokes(INK, 15)}
      {strokes(YELLOW, 8)}
    </svg>
  );
}

/** Le cercle qui bat sur le sujet désigné. */
function TargetRing({ at, age }: { at: [number, number]; age: number }) {
  if (age < 0) return null;
  const pop = sp(age, 0, true);
  const beat = 1 + 0.06 * Math.sin(age / 5);
  const r = 58 * pop * beat;
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      <circle cx={at[0]} cy={at[1]} r={r} fill="none" stroke={INK} strokeWidth={11} opacity={0.9} />
      <circle cx={at[0]} cy={at[1]} r={r} fill="none" stroke={YELLOW} strokeWidth={5} strokeDasharray="16 9" strokeDashoffset={-age * 0.8} strokeLinecap="round" />
    </svg>
  );
}

/* ── La bulle de manga ─────────────────────────────────────────────────── */

function Bubble({ text, age, style, narrow }: { text: string; age: number; style: CSSProperties; narrow: boolean }) {
  if (age < 0 || !text) return null;
  const pop = sp(age, 0, true);
  const words = text.split(" ");
  const shown = Math.ceil(ramp(age, 3, words.length * 3.2) * words.length);
  return (
    <div style={{ position: "absolute", ...style, transform: `scale(${pop}) rotate(${-2 + (1 - pop) * -8}deg)`, transformOrigin: "100% 100%" }}>
      <div style={{ position: "relative", padding: narrow ? "14px 20px" : "18px 28px", background: "#fff", border: `4px solid ${INK}`, borderRadius: "46% 54% 50% 50% / 58% 52% 48% 42%", boxShadow: `6px 7px 0 ${INK}`, fontFamily: HAND, fontWeight: 700, fontSize: narrow ? 30 : 40, lineHeight: 1.08, color: INK, textAlign: "center", minWidth: 150 }}>
        {words.map((w, i) => (
          <span key={i} style={{ opacity: i < shown ? 1 : 0 }}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
        {/* La queue de la bulle, vers le professeur. */}
        <svg width="54" height="44" viewBox="0 0 54 44" style={{ position: "absolute", right: 34, bottom: -37 }}>
          <path d="M4 2 L46 40 L30 2" fill="#fff" stroke={INK} strokeWidth="4" strokeLinejoin="round" />
          <path d="M2 0 L34 0" stroke="#fff" strokeWidth="7" />
        </svg>
      </div>
    </div>
  );
}

/* ── La formule sur une note manuscrite ────────────────────────────────── */

function FormulaNote({ tex, age, style }: { tex: string; age: number; style: CSSProperties }) {
  const parsed = useMemo(() => {
    try {
      const html = katex.renderToString(tex, { displayMode: true, throwOnError: true, output: "html", strict: false });
      const pieces = html.split(/(>[^<>]+<)/);
      const glyphs = pieces.map((piece) => (/^>[^<>]+<$/.test(piece) ? (piece.slice(1, -1).match(/&[^;]+;|[\s\S]/gu) ?? []) : null));
      return { pieces, glyphs, total: glyphs.reduce((n, g) => n + (g?.length ?? 0), 0) };
    } catch {
      return null;
    }
  }, [tex]);
  if (!parsed || age < 0) return null;
  const drop = sp(age, 0, true);
  const reveal = ramp(age, 8, Math.min(54, 16 + parsed.total * 1.8));
  const shown = Math.round(reveal * parsed.total);
  let i = 0;
  const html = parsed.pieces
    .map((piece, k) => {
      const glyphs = parsed.glyphs[k];
      if (!glyphs) return piece;
      return `>${glyphs.map((g) => `<span style="opacity:${i++ < shown ? 1 : 0}">${g}</span>`).join("")}<`;
    })
    .join("");
  const underline = ramp(age, 8 + Math.min(54, 16 + parsed.total * 1.8), 12);
  // La note grandit avec la formule, et reste dans sa place.
  const size = Math.max(26, Math.min(46, 620 / Math.max(8, parsed.total)));
  return (
    <div style={{ position: "absolute", ...style, transform: `translateY(${(1 - drop) * -40}px) rotate(${-2.5 + (1 - drop) * 6}deg)`, opacity: Math.min(1, drop * 1.6), transformOrigin: "50% 0" }}>
      <div className="anime-note" style={{ position: "relative", padding: "30px 30px 22px", background: "#FFFBEA", borderRadius: 6, boxShadow: "0 16px 34px rgb(0 0 0 / 0.38), inset 0 0 0 1px rgb(0 0 0 / 0.06)", backgroundImage: "repeating-linear-gradient(to bottom, transparent 0 33px, rgb(59 130 246 / 0.16) 33px 34px)", color: INK }}>
        <style>{".anime-note .katex-display{margin:0}.anime-note .katex{color:inherit}"}</style>
        {/* Le ruban adhésif. */}
        <div style={{ position: "absolute", top: -13, left: "50%", width: 110, height: 28, marginLeft: -55, background: "rgb(255 210 63 / 0.82)", transform: "rotate(-3deg)", boxShadow: "0 2px 4px rgb(0 0 0 / 0.18)" }} />
        <div style={{ fontSize: size, textAlign: "center", whiteSpace: "nowrap" }} dangerouslySetInnerHTML={{ __html: html }} />
        <svg viewBox="0 0 300 14" preserveAspectRatio="none" style={{ display: "block", width: "72%", height: 14, margin: "10px auto 0" }}>
          <path d="M4 8 C 60 2, 120 12, 180 6 S 270 9, 296 5" fill="none" stroke="#EF4444" strokeWidth="4" strokeLinecap="round" pathLength={1} strokeDasharray="1" strokeDashoffset={1 - underline} />
        </svg>
      </div>
    </div>
  );
}

/* ── L'objet animé : la clé sur son écrou, le levier sur son appui ─────── */

const rad = (deg: number) => (deg * Math.PI) / 180;
/** Où est le bout que la main tient, pour un pivot, une longueur et un angle. */
const barEnd = (pivot: [number, number], length: number, deg: number): [number, number] => [pivot[0] + length * Math.cos(rad(deg)), pivot[1] + length * Math.sin(rad(deg))];

/**
 * La géométrie d'un objet : le pivot (l'écrou, le sommet de l'appui) et la
 * longueur entre le pivot et la main. `grip` est le point où la main le tient
 * AU REPOS : le pivot en découle, donc l'objet arrive exactement dans le poing.
 */
function toolGeometry(tool: AnimeTool, grip: [number, number], width: number) {
  const reach = width * (tool === "wrench" ? 0.36 : 0.38);
  const rest = TOOL_ANGLES[tool][0];
  const pivot: [number, number] = [grip[0] - reach * Math.cos(rad(rest)), grip[1] - reach * Math.sin(rad(rest))];
  return { reach, rest, pivot };
}

function Mechanism({ tool, images, pivot, reach, angle, appear }: { tool: AnimeTool; images: ToolProps; pivot: [number, number]; reach: number; angle: number; appear: number }) {
  const shadow = "drop-shadow(0 10px 10px rgb(0 0 0 / 0.35))";
  const pop = { opacity: Math.min(1, appear * 1.5), transform: `scale(${0.7 + 0.3 * appear})`, transformOrigin: `${pivot[0]}px ${pivot[1]}px` };
  if (tool === "wrench") {
    // L'image de la clé : la mâchoire à gauche (son centre à 6 % de la largeur), le manche à droite.
    const w = reach / 0.9;
    const h = w * (172 / 900);
    const hex = Array.from({ length: 6 }, (_, k) => `${pivot[0] + 30 * Math.cos(rad(60 * k + angle))},${pivot[1] + 30 * Math.sin(rad(60 * k + angle))}`).join(" ");
    return (
      <div style={{ position: "absolute", inset: 0, ...pop }}>
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", filter: shadow }}>
          <circle cx={pivot[0]} cy={pivot[1]} r={52} fill="#475569" stroke={INK} strokeWidth={5} />
          <polygon points={hex} fill="#CBD5E1" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
          <circle cx={pivot[0]} cy={pivot[1]} r={9} fill="#64748B" stroke={INK} strokeWidth={3} />
        </svg>
        <Img src={images.wrench} style={{ position: "absolute", left: pivot[0] - w * 0.06, top: pivot[1] - h * 0.38, width: w, height: h, maxWidth: "none", transformOrigin: `${w * 0.06}px ${h * 0.38}px`, transform: `rotate(${angle}deg)`, filter: shadow }} />
      </div>
    );
  }
  // Le levier : la planche tourne sur le sommet de l'appui ; le bras court (à gauche) porte le rocher.
  const short = reach * 0.42;
  const w = reach + short;
  const h = w * (136 / 900) * 0.55;
  const wedgeW = reach * 0.34;
  const wedgeH = wedgeW * (583 / 754);
  const rockW = reach * 0.34;
  const rockH = rockW * (574 / 542);
  return (
    <div style={{ position: "absolute", inset: 0, ...pop }}>
      <Img src={images.wedge} style={{ position: "absolute", left: pivot[0] - wedgeW * 0.42, top: pivot[1] + h * 0.12, width: wedgeW, height: wedgeH, maxWidth: "none", filter: shadow }} />
      {/* (Le parent mesure 0 × 0 : `maxWidth: none`, sinon une règle globale « img { max-width: 100% } » efface les images.) */}
      {/* La planche et le rocher tournent ENSEMBLE autour du pivot : le rocher reste posé au bout court. */}
      <div style={{ position: "absolute", left: pivot[0], top: pivot[1], width: 0, height: 0, transform: `rotate(${angle}deg)` }}>
        <Img src={images.rock} style={{ position: "absolute", left: -short - rockW * 0.2, top: -h / 2 - rockH * 0.84, width: rockW, height: rockH, maxWidth: "none", filter: shadow }} />
        <Img src={images.plank} style={{ position: "absolute", left: -short, top: -h / 2, width: w, height: h, maxWidth: "none", filter: shadow }} />
      </div>
    </div>
  );
}

/* ── Le professeur : il attend, il parle, il montre ────────────────────── */

function Professor({ sprites, box, talking, open, point, hold, shift, zoom, frame }: { sprites: ProfessorSprites; box: { x: number; y: number; w: number; h: number }; talking: boolean; open: boolean; point: number; hold: boolean; shift: [number, number]; zoom: number; frame: number }) {
  const enter = sp(frame, 4);
  // Il respire toujours ; quand il parle, il bouge un peu plus.
  const breathe = 1 + 0.006 * Math.sin(frame / 14);
  // Quand il tient l'objet, sa main suit le manche : le corps ne se balance plus tout seul.
  const bob = hold ? 0 : (talking ? 3.5 : 1.5) * Math.sin(frame / (talking ? 5 : 16));
  const lean = hold ? shift[1] * 0.03 : talking ? 0.8 * Math.sin(frame / 9) : 0;
  const canHold = hold && Boolean(sprites.hold);
  const pose: keyof ProfessorSprites = canHold ? (open && sprites.holdTalk ? "holdTalk" : "hold") : point > 0.5 || hold ? (open ? "pointTalk" : "point") : open ? "talk" : "idle";
  // Le changement de pose a un petit rebond : on ne voit pas la coupe.
  const pop = 1 + 0.035 * Math.sin(Math.PI * Math.min(1, Math.abs(point - 0.5) * 2 < 1 ? point : 1));
  const outline = "drop-shadow(3px 0 0 #fff) drop-shadow(-3px 0 0 #fff) drop-shadow(0 -3px 0 #fff) drop-shadow(0 12px 18px rgb(0 0 0 / 0.4))";
  return (
    <div style={{ position: "absolute", left: box.x, top: box.y, width: box.w, height: box.h, transformOrigin: "70% 100%", transform: `translate(${shift[0]}px, ${(1 - enter) * box.h * 0.6 + bob + shift[1]}px) rotate(${lean}deg) scale(${(1 + zoom * 0.34) * pop}, ${(1 + zoom * 0.34) * pop * breathe})`, filter: outline }}>
      {(Object.keys(sprites) as (keyof ProfessorSprites)[]).filter((k) => sprites[k]).map((k) => (
        <Img key={k} src={sprites[k]!} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "50% 100%", opacity: k === pose ? 1 : 0 }} />
      ))}
    </div>
  );
}

/* ── Une scène : le décor et ce qui s'y passe ──────────────────────────── */

function SceneLayer({ local, first, children }: { local: number; first: boolean; children: ReactNode }) {
  // Coupe de manga : la nouvelle case entre en biais, avec un éclair blanc.
  const p = first ? 1 : easeOut(ramp(local, 0, CUT_FRAMES));
  const edge = p * 135;
  return (
    <>
      <AbsoluteFill style={p < 1 ? { clipPath: `polygon(0 0, ${edge}% 0, ${edge - 35}% 100%, 0 100%)` } : undefined}>{children}</AbsoluteFill>
      {p < 1 && <AbsoluteFill style={{ background: "#fff", opacity: (1 - p) * 0.3, pointerEvents: "none" }} />}
    </>
  );
}

export function AnimeExplanation({ audioUrl, musicUrl, durationMs, scenes, words, sceneStartsMs, sprites, props, handFontUrl }: AnimeProps) {
  const images = props ?? toolProps();
  useHandFont(handFontUrl);
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const narrow = height > width;
  const total = Math.max(ANIME_FPS, Math.ceil((durationMs / 1000) * ANIME_FPS));
  const starts = useMemo(() => scenes.map((_, i) => (i === 0 ? 0 : Math.round(((sceneStartsMs[i] ?? 0) / 1000) * ANIME_FPS))), [scenes, sceneStartsMs]);
  const spans = useMemo(() => speechSpans(words), [words]);
  const animes = useMemo(() => scenes.map((s, i) => s.anime ?? defaultAnime({ heading: s.heading, formula: s.formula }, i)), [scenes]);

  // La scène en cours.
  let current = 0;
  for (let i = 0; i < starts.length; i++) if (frame >= starts[i]!) current = i;
  const from = starts[current]!;
  const frames = (starts[current + 1] ?? total) - from;
  const local = frame - from;
  const anime = animes[current]!;
  const at = actionStart(frames, ANIME_FPS);

  // Le professeur : en bas à droite, coupé à la taille par le bord de l'image.
  const profH = narrow ? height * 0.46 : height * 0.78;
  const profW = profH * 0.75;
  const prof = { x: width - profW * (narrow ? 0.9 : 0.94), y: height - profH * 0.93, w: profW, h: profH };
  const ms = (frame / ANIME_FPS) * 1000;
  const isPointing = pointing(anime.action, local, frames, ANIME_FPS);
  const point = isPointing ? sp(local, at - 4) : 0;
  const zoom = anime.action === "zoom_sur_prof" ? easeOut(ramp(local, at, 14)) * (1 - ramp(local, frames - 8, 8)) : 0;
  const finger: [number, number] = [prof.x + prof.w * 0.13, prof.y + prof.h * 0.1];
  const target = focusPoint(anime.focus);
  const targetPx: [number, number] = [target.x * width, target.y * height];
  const out = 1 - ramp(local, frames - 7, 7);

  // L'objet animé (show_tool, use_tool). Le poing de la pose « il tient » est en haut à gauche du personnage :
  // le bout du manche y arrive au repos, puis la main SUIT le manche quand il pousse.
  const tool = anime.action === "show_tool" || anime.action === "use_tool" ? anime.tool : undefined;
  const fist: [number, number] = [prof.x + prof.w * 0.13, prof.y + prof.h * 0.25];
  const geo = tool ? toolGeometry(tool, fist, width) : null;
  const angle = tool ? toolAngle(tool, anime.action, local, frames, ANIME_FPS) : 0;
  const isHolding = holding(anime.action, local, frames, ANIME_FPS);
  const end = geo ? barEnd(geo.pivot, geo.reach, angle) : fist;
  const shift: [number, number] = isHolding ? [end[0] - fist[0], end[1] - fist[1]] : [0, 0];

  return (
    <AbsoluteFill style={{ background: "#0B1020", overflow: "hidden" }}>
      {scenes.map((_, i) => {
        const f0 = starts[i]!;
        const f1 = starts[i + 1] ?? total;
        // La scène reste sous la suivante le temps de la coupe.
        if (frame < f0 || frame >= f1 + CUT_FRAMES) return null;
        return (
          <SceneLayer key={i} local={frame - f0} first={i === 0}>
            <Decor anime={animes[i]!} index={i} local={frame - f0} frames={f1 - f0} />
          </SceneLayer>
        );
      })}

      {/* Ce que le professeur désigne. */}
      {anime.action === "fleche_pointe_objet" && (
        <div style={{ position: "absolute", inset: 0, opacity: out }}>
          <HandArrow from={[finger[0] - 14, finger[1] - 8]} to={[targetPx[0] + 62, targetPx[1] - 26]} progress={ramp(local, at + 4, 16)} />
          <TargetRing at={targetPx} age={local - at - 18} />
        </div>
      )}
      {anime.action === "personnage_pointe_du_doigt" && (
        <div style={{ position: "absolute", inset: 0, opacity: out }}>
          <TargetRing at={targetPx} age={local - at - 6} />
        </div>
      )}
      {anime.action === "formule_s_ecrit" && (
        <div style={{ position: "absolute", inset: 0, opacity: out }}>
          <FormulaNote tex={scenes[current]!.formula ?? ""} age={local - at} style={narrow ? { left: "6%", right: "6%", top: "9%" } : { left: "6%", top: "11%", minWidth: "34%", maxWidth: "58%" }} />
        </div>
      )}

      {tool && geo && (
        <div style={{ position: "absolute", inset: 0, opacity: out }}>
          <Mechanism tool={tool} images={images} pivot={geo.pivot} reach={geo.reach} angle={angle} appear={sp(local, 3, true)} />
        </div>
      )}

      <Professor sprites={sprites} box={prof} talking={speaking(words, ms)} open={mouthOpen(words, ms)} point={point} hold={isHolding} shift={shift} zoom={zoom} frame={frame} />

      {(anime.action === "bulle_de_texte" || anime.action === "zoom_sur_prof") && (
        <div style={{ position: "absolute", inset: 0, opacity: out }}>
          <Bubble text={anime.bubble} age={local - at - (anime.action === "zoom_sur_prof" ? 8 : 0)} narrow={narrow} style={narrow ? { right: prof.w * 0.5, bottom: prof.h * 0.98, maxWidth: "78%" } : { right: prof.w * (0.8 + zoom * 0.3), bottom: prof.h * (0.62 + zoom * 0.2), maxWidth: "44%" }} />
        </div>
      )}

      <Captions words={words} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgb(255 255 255 / 0.12)" }}>
        <div style={{ height: "100%", width: `${(frame / total) * 100}%`, background: YELLOW }} />
      </div>
      {audioUrl && <Audio src={audioUrl} />}
      {musicUrl && <Audio src={musicUrl} loop volume={(f) => musicGain(f / ANIME_FPS, spans, total / ANIME_FPS)} />}
    </AbsoluteFill>
  );
}
