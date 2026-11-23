import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import katex from "katex";
import { AbsoluteFill, Audio, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  MOTION_ICONS,
  blockSize,
  defaultMotion,
  layoutBlocks,
  markTexParts,
  musicGain,
  resolveTimeline,
  speechSpans,
  titleFont,
  type BlockTiming,
  type CurveName,
  type MotionBlock,
  type MotionColor,
  type MotionScene,
  type Rect,
  type TimedAction,
  type Transition,
} from "../../api/lib/video-motion";
import type { Stage } from "../../api/lib/video-visuals";
import type { ExplainerScene, ExplainerWord } from "./dynamic-explanation";

/**
 * « Als Video erklären » en motion design — la composition.
 *
 * Jouée en direct par le lecteur Remotion (aucun rendu côté serveur), et
 * enregistrée dans packages/video pour l'export MP4.
 *
 * Le modèle ne dessine rien : chaque scène porte des BLOCS (titre, carte,
 * icône, formule, étapes, liste, courbe, barres, levier) et des ACTIONS calées
 * sur les mots de la voix (api/lib/video-motion.ts). Ici :
 *
 *   · la place de chaque bloc est calculée (`layoutBlocks`) — jamais de
 *     chevauchement — et quand un bloc entre ou sort, les autres GLISSENT vers
 *     leur nouvelle place (ressort) ;
 *   · chaque bloc se construit : le titre arrive mot à mot, la formule s'écrit,
 *     la courbe se trace, les barres poussent, le levier penche ;
 *   · les scènes s'enchaînent par un fondu, un volet, un glissement ou un zoom,
 *     et le plan avance lentement (zoom de 3 %) ;
 *   · la musique passe sous la voix (−20 dB) et remonte dans les silences.
 */

export const MOTION_FPS = 30;

// `type` et non `interface` : Remotion exige des props assignables à Record<string, unknown>.
export type MotionProps = {
  /** La voix (MP3). Vide : la composition se joue sans son. */
  audioUrl: string;
  /** La boucle de fond, ou null (VIDEO_MUSIC=off). */
  musicUrl?: string | null;
  durationMs: number;
  title: string;
  scenes: ExplainerScene[];
  words: ExplainerWord[];
  sceneStartsMs: number[];
  labels: { source: string; example: string; solver: string; stages?: Record<Stage, string> };
  /** Virgule décimale (allemand, français…) ou point (anglais). */
  decimalComma?: boolean;
};

const FONT = "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";
const INK = "#F8FAFC";
const MUTED = "#94A3B8";
const HUE: Record<MotionColor, string> = { white: "#F8FAFC", yellow: "#FACC15", blue: "#60A5FA", green: "#34D399", red: "#F87171" };
/** Un bloc « blanc » garde un accent pour ses traits (icône, courbe, étapes). */
const accentOf = (c: MotionColor) => (c === "white" ? HUE.blue : HUE[c]);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ramp = (f: number, from: number, len: number) => interpolate(f, [from, from + Math.max(1, len)], [0, 1], clamp);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** Ressort de Remotion : 0 avant `at`, puis vers 1. `bounce` : avec dépassement. */
const sp = (f: number, at: number, bounce = false) =>
  f < at ? 0 : spring({ frame: f - at, fps: MOTION_FPS, config: bounce ? { damping: 9, stiffness: 140, mass: 0.7 } : { damping: 16, stiffness: 120, mass: 0.8 } });

const TRANSITION_FRAMES = 14;

/* ── Le fond ───────────────────────────────────────────────────────────── */

function Backdrop() {
  const frame = useCurrentFrame();
  const t = frame / MOTION_FPS;
  const blob = (x: number, y: number, color: string, size: number): CSSProperties => ({
    position: "absolute",
    left: `${x}%`,
    top: `${y}%`,
    width: `${size}%`,
    aspectRatio: "1",
    transform: "translate(-50%, -50%)",
    background: `radial-gradient(circle, ${color} 0%, transparent 65%)`,
  });
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 95% at 22% 0%, #18244A 0%, #0B1226 52%, #060A16 100%)", overflow: "hidden" }}>
      <div style={blob(24 + Math.sin(t * 0.21) * 9, 26 + Math.cos(t * 0.17) * 8, "rgb(59 130 246 / 0.22)", 62)} />
      <div style={blob(80 + Math.cos(t * 0.16) * 7, 78 + Math.sin(t * 0.23) * 7, "rgb(250 204 21 / 0.10)", 54)} />
      {/* Une trame de points qui dérive lentement : le fond n'est jamais figé. */}
      <AbsoluteFill style={{ backgroundImage: "radial-gradient(rgb(148 163 184 / 0.16) 1px, transparent 1.4px)", backgroundSize: "26px 26px", backgroundPosition: `${(t * 3) % 26}px ${(t * 2) % 26}px` }} />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgb(3 6 14 / 0.55) 100%)" }} />
    </AbsoluteFill>
  );
}

/* ── Les blocs ─────────────────────────────────────────────────────────── */

interface BlockProps {
  block: MotionBlock;
  /** Images écoulées depuis l'entrée du bloc. */
  age: number;
  /** L'entrée est « write » : le contenu se construit plus lentement, mot à mot. */
  written: boolean;
  accent: string;
  narrow: boolean;
  /** Les mots de la voix après l'entrée du bloc (images depuis l'entrée) : étapes et points arrivent quand la voix les nomme. */
  cues: { text: string; at: number }[];
  /** Images restant avant la fin de la scène. */
  room: number;
  actions: TimedAction[];
  /** Image locale de la scène (pour les actions du bloc). */
  local: number;
  decimalComma: boolean;
}

/** Le texte arrive MOT À MOT : chaque mot monte et se pose. */
function Kinetic({ text, age, step, style }: { text: string; age: number; step: number; style?: CSSProperties }) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span style={style}>
      {words.map((w, i) => {
        const s = sp(age, i * step);
        return (
          <span key={i} style={{ display: "inline-block", whiteSpace: "pre", opacity: Math.min(1, s * 1.6), transform: `translateY(${(1 - s) * 0.5}em)` }}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </span>
  );
}

function TitleBlock({ block, age, written, narrow, accent }: BlockProps) {
  const size = titleFont(block.text, narrow);
  const words = block.text.split(/\s+/).filter(Boolean).length;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, textAlign: "center" }}>
      <Kinetic
        text={block.text}
        age={age}
        step={written ? 4 : 2}
        style={{ fontFamily: FONT, fontWeight: 700, fontSize: size, lineHeight: 1.14, letterSpacing: "-0.03em", color: HUE[block.color], textWrap: "balance", textShadow: "0 6px 30px rgb(0 0 0 / 0.45)" } as CSSProperties}
      />
      {/* Un trait d'accent se tire sous le titre une fois la phrase posée. */}
      <span style={{ width: 84, height: 5, borderRadius: 5, background: accent, transform: `scaleX(${sp(age, words * (written ? 4 : 2) + 6)})`, boxShadow: `0 0 18px ${accent}` }} />
    </div>
  );
}

function TextBlock({ block, age, accent }: BlockProps) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: "18px 22px 18px 26px",
        borderRadius: 20,
        background: "linear-gradient(160deg, rgb(255 255 255 / 0.10), rgb(255 255 255 / 0.04))",
        boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.13), 0 24px 50px -28px rgb(0 0 0 / 0.9)",
        display: "flex",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 5, background: accent, transform: `scaleY(${sp(age, 2)})`, transformOrigin: "top" }} />
      <Kinetic text={block.text} age={age - 3} step={2} style={{ fontFamily: FONT, fontWeight: 500, fontSize: 22, lineHeight: 1.32, letterSpacing: "-0.012em", color: "#E8EEF8" }} />
    </div>
  );
}

/** Le mouvement propre de l'icône, une fois tracée (le même que dans la bibliothèque : tourne, bat, oscille…). */
function idle(anim: string, t: number): string {
  switch (anim) {
    case "spin":
      return `rotate(${t * 60}deg)`;
    case "pulse":
      return `scale(${1 + Math.sin(t * 5) * 0.07})`;
    case "sway":
      return `rotate(${Math.sin(t * 2.4) * 9}deg)`;
    case "bounce":
      return `translateY(${-Math.abs(Math.sin(t * 3.2)) * 7}px)`;
    case "float":
      return `translateY(${Math.sin(t * 2) * 5}px)`;
    default:
      return "";
  }
}

function IconBlock({ block, age, accent }: BlockProps) {
  const icon = MOTION_ICONS[block.icon];
  if (!icon) return null;
  const drawn = easeOut(ramp(age, 2, 20));
  const t = Math.max(0, age - 22) / MOTION_FPS;
  const settle = ramp(age, 22, 12);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ width: 122, height: 122, borderRadius: 34, display: "grid", placeItems: "center", background: `radial-gradient(circle at 30% 25%, ${accent}3d, ${accent}12 70%)`, boxShadow: `inset 0 0 0 1.5px ${accent}66, 0 22px 44px -22px ${accent}aa` }}>
        <svg viewBox="0 0 24 24" width={74} height={74} fill="none" stroke={accent} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" style={{ transform: settle > 0 ? idle(icon.anim, t * settle) : undefined, opacity: icon.anim === "blink" ? 1 - 0.35 * (0.5 + 0.5 * Math.sin(t * 6)) * settle : 1 }}>
          {icon.paths.map((d, i) => (
            <path key={i} d={d} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - Math.min(1, drawn * 1.25 - (i / Math.max(1, icon.paths.length)) * 0.25)} />
          ))}
        </svg>
      </div>
      {block.text && (
        <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 17, lineHeight: 1.25, letterSpacing: "-0.01em", color: INK, textAlign: "center", opacity: ramp(age, 10, 10), transform: `translateY(${(1 - sp(age, 10)) * 10}px)` }}>{block.text}</span>
      )}
    </div>
  );
}

/**
 * La formule KaTeX, écrite signe après signe (on allume ses glyphes dans
 * l'ordre). Les morceaux désignés par « annotate » prennent une couleur, et
 * leur étiquette descend sous eux au bout d'un trait.
 */
function FormulaBlock({ block, age, written, actions, local }: BlockProps) {
  const notes = useMemo(() => actions.filter((a) => a.action === "annotate").slice(0, 3), [actions]);
  const parsed = useMemo(() => {
    const marked = markTexParts(block.tex, notes.map((n) => n.target));
    try {
      const html = katex.renderToString(marked.tex, { displayMode: true, throwOnError: true, output: "html", trust: true, strict: false });
      const pieces = html.split(/(>[^<>]+<)/);
      const glyphs = pieces.map((piece) => (/^>[^<>]+<$/.test(piece) ? (piece.slice(1, -1).match(/&[^;]+;|[\s\S]/gu) ?? []) : null));
      return { pieces, glyphs, total: glyphs.reduce((n, g) => n + (g?.length ?? 0), 0), ok: marked.ok };
    } catch {
      return null;
    }
  }, [block.tex, notes]);

  // La formule tient toujours dans son bloc : mesurée une fois, réduite s'il le faut.
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(".katex-html");
    const room = box.current?.clientWidth ?? 0;
    if (el && room > 0) setFit(Math.min(1, (room - 16) / Math.max(1, el.scrollWidth)));
  }, [parsed]);

  if (!parsed) return null;
  const reveal = written ? ramp(age, 2, Math.min(48, 14 + parsed.total * 1.6)) : ramp(age, 0, 8);
  const shown = Math.round(reveal * parsed.total);
  let i = 0;
  const html = parsed.pieces
    .map((piece, k) => {
      const glyphs = parsed.glyphs[k];
      if (!glyphs) return piece;
      return `>${glyphs.map((g) => `<span style="opacity:${i++ < shown ? 1 : 0}">${g}</span>`).join("")}<`;
    })
    .join("");

  const vars: Record<string, string | number> = { "--tex-rule": interpolate(reveal, [0.25, 0.6], [0, 1], clamp) };
  let css = ".mg-f .katex-display{margin:0}.mg-f .katex{color:inherit}";
  notes.forEach((n, k) => {
    if (!parsed.ok[k]) return;
    const on = sp(local, n.at);
    const stem = 10 + (k % 2) * 26;
    vars[`--mg-p${k}-o`] = Math.min(1, on * 1.4);
    vars[`--mg-p${k}-t`] = JSON.stringify(n.text);
    vars[`--mg-p${k}-s`] = on;
    const color = HUE[n.color];
    css += `.mg-f .mg-p${k}{position:relative;display:inline-block;color:color-mix(in srgb, ${color} calc(var(--mg-p${k}-o) * 100%), currentColor)}`;
    css += `.mg-f .mg-p${k}::before{content:"";position:absolute;left:50%;top:calc(100% + 4px);width:2px;height:${stem}px;margin-left:-1px;background:${color};opacity:var(--mg-p${k}-o);transform:scaleY(var(--mg-p${k}-s));transform-origin:top}`;
    css += `.mg-f .mg-p${k}::after{content:var(--mg-p${k}-t);position:absolute;left:50%;top:calc(100% + ${stem + 7}px);transform:translateX(-50%);white-space:nowrap;font:600 15px/1 ${FONT};letter-spacing:0;color:${color};opacity:var(--mg-p${k}-o)}`;
  });

  return (
    <div ref={box} className="mg-f" style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: notes.length > 0 ? "flex-start" : "center", paddingTop: notes.length > 0 ? 18 : 0, boxSizing: "border-box", color: HUE[block.color], ...(vars as CSSProperties) }}>
      <style>{css}</style>
      <div className="tred-tex" style={{ fontSize: 40, transform: `scale(${fit})`, transformOrigin: notes.length > 0 ? "top center" : "center" }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/**
 * Quand la voix nomme chaque libellé (images depuis l'entrée du bloc) : son
 * premier mot significatif, cherché dans l'ordre. Sinon, à intervalles
 * réguliers. Toujours croissant.
 */
function itemCues(items: string[], cues: BlockProps["cues"], room: number): number[] {
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");
  const span = Math.max(20, Math.min(room - 30, items.length * 50));
  const out: number[] = [];
  let cursor = 0;
  items.forEach((item, i) => {
    const tokens = item.split(/[^\p{L}\p{N}]+/u).map(norm).filter((t) => t.length >= 4);
    let at = Number.NaN;
    for (let k = cursor; k < cues.length && Number.isNaN(at); k++) {
      if (tokens.some((t) => norm(cues[k]!.text).startsWith(t.slice(0, 6)))) {
        at = cues[k]!.at - 4;
        cursor = k + 1;
      }
    }
    const min = i === 0 ? 4 : out[i - 1]! + 12;
    const wanted = Number.isNaN(at) ? 4 + (i * span) / items.length : at;
    out.push(Math.round(Math.max(min, Math.min(wanted, Math.max(min, room - 24 - (items.length - 1 - i) * 12)))));
  });
  return out;
}

function StepsBlock({ block, age, accent, narrow, cues, room }: BlockProps) {
  const at = useMemo(() => itemCues(block.items, cues, room), [block.items, cues, room]);
  const current = at.filter((a) => age >= a).length - 1;
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: narrow ? "column" : "row", alignItems: "center", justifyContent: "space-between" }}>
      {block.items.map((item, i) => {
        const s = sp(age, at[i]!, true);
        const line = easeOut(ramp(age, at[i]! - 8, 10));
        return (
          <div key={i} style={{ display: "contents" }}>
            {i > 0 && (
              <svg width={narrow ? 20 : 44} height={narrow ? 30 : 20} viewBox={narrow ? "0 0 20 30" : "0 0 44 20"} style={{ flex: "none", opacity: line }}>
                {narrow ? (
                  <path d={`M10 2 V${2 + 22 * line} m-5 -6 l5 6 l5 -6`} fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d={`M4 10 H${4 + 34 * line} m-6 -5 l6 5 l-6 5`} fill="none" stroke={accent} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            )}
            <div
              style={{
                flex: "none",
                width: narrow ? 300 : 176,
                height: narrow ? 62 : 78,
                boxSizing: "border-box",
                padding: "0 12px",
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: item.length > 18 ? 15 : 17,
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
                color: INK,
                background: i === current ? `${accent}38` : "rgb(255 255 255 / 0.07)",
                boxShadow: `inset 0 0 0 1.5px ${i === current ? accent : "rgb(255 255 255 / 0.16)"}${i === current ? `, 0 0 34px -8px ${accent}` : ""}`,
                opacity: Math.min(1, s * 1.5),
                transform: `scale(${0.6 + 0.4 * s})`,
              }}
            >
              <span>
                <span style={{ color: accent, marginRight: 6, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                {item}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListBlock({ block, age, accent, cues, room }: BlockProps) {
  const at = useMemo(() => itemCues(block.items, cues, room), [block.items, cues, room]);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
      {block.items.map((item, i) => {
        const s = sp(age, at[i]!);
        const check = easeOut(ramp(age, at[i]! + 6, 10));
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", borderRadius: 16, background: "rgb(255 255 255 / 0.06)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.11)", opacity: Math.min(1, s * 1.5), transform: `translateX(${(1 - s) * 46}px)` }}>
            <svg width={30} height={30} viewBox="0 0 30 30" style={{ flex: "none" }}>
              <circle cx={15} cy={15} r={13} fill={`${accent}2e`} stroke={accent} strokeWidth={1.6} />
              <path d="M9 15.5l4 4 8-9" fill="none" stroke={accent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - check} />
            </svg>
            <span style={{ fontFamily: FONT, fontWeight: 500, fontSize: 21, lineHeight: 1.3, letterSpacing: "-0.012em", color: "#E8EEF8" }}>{item}</span>
          </div>
        );
      })}
    </div>
  );
}

/** La forme de chaque courbe de principe, de [0, 1] vers [0, 1]. */
const CURVE_FN: Record<CurveName, (x: number) => number> = {
  linear: (x) => 0.16 + 0.68 * x,
  proportional: (x) => 0.92 * x,
  inverse: (x) => Math.min(0.96, 0.085 / (x + 0.088)),
  quadratic: (x) => 0.94 * x * x,
  exponential: (x) => (0.94 * (Math.exp(3.2 * x) - 1)) / (Math.exp(3.2) - 1),
  decay: (x) => 0.94 * Math.exp(-3.4 * x),
  saturation: (x) => 0.9 * (1 - Math.exp(-4.2 * x)),
  sine: (x) => 0.5 + 0.38 * Math.sin(x * Math.PI * 3),
  bell: (x) => 0.92 * Math.exp(-(((x - 0.5) / 0.17) ** 2)),
  step: (x) => (x < 0.5 ? 0.22 : 0.8),
};

const axisLabel: CSSProperties = { fontFamily: FONT, fontWeight: 600, fontSize: 14, letterSpacing: "0.01em", fill: MUTED };

function ChartBlock({ block, age, accent }: BlockProps) {
  const fn = CURVE_FN[(block.curve || "linear") as CurveName];
  const X0 = 46, Y0 = 214, W = 320, H = 170;
  const points = useMemo(() => Array.from({ length: 81 }, (_, i) => [X0 + (i / 80) * W, Y0 - fn(i / 80) * H] as const), [fn]);
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const axes = easeOut(ramp(age, 0, 14));
  const drawn = easeOut(ramp(age, 12, 44));
  const tip = points[Math.round(drawn * 80)]!;
  return (
    <svg viewBox="0 0 400 264" width="100%" height="100%" style={{ overflow: "visible" }}>
      {block.text && (
        <text x={200} y={18} textAnchor="middle" style={{ ...axisLabel, fontSize: 16, fill: INK }} opacity={ramp(age, 4, 10)}>
          {block.text}
        </text>
      )}
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={X0} x2={X0 + W * axes} y1={Y0 - H * g} y2={Y0 - H * g} stroke="rgb(148 163 184 / 0.14)" strokeWidth={1} />
      ))}
      <path d={`M${X0} ${Y0} V${Y0 - (H + 14) * axes} m-5 7 l5 -7 l5 7`} fill="none" stroke={MUTED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M${X0} ${Y0} H${X0 + (W + 14) * axes} m-7 -5 l7 5 l-7 5`} fill="none" stroke={MUTED} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <text x={X0 + W + 10} y={Y0 + 24} textAnchor="end" style={axisLabel} opacity={axes}>
        {block.items[0]}
      </text>
      <text x={X0 - 12} y={Y0 - H - 22} textAnchor="start" style={axisLabel} opacity={axes}>
        {block.items[1]}
      </text>
      <path d={d} fill="none" stroke={accent} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - drawn} style={{ filter: `drop-shadow(0 0 8px ${accent})` }} />
      {drawn > 0 && (
        <>
          <circle cx={tip[0]} cy={tip[1]} r={11 + Math.sin(age / 5) * 2} fill={accent} opacity={0.22} />
          <circle cx={tip[0]} cy={tip[1]} r={5.5} fill="#fff" stroke={accent} strokeWidth={2.5} />
        </>
      )}
    </svg>
  );
}

function BarsBlock({ block, age, accent, decimalComma }: BlockProps) {
  const max = Math.max(...block.values);
  const n = block.values.length;
  const slot = 320 / n;
  const width = Math.min(72, slot - 22);
  const show = (v: number) => (decimalComma ? String(v).replace(".", ",") : String(v));
  return (
    <svg viewBox="0 0 400 264" width="100%" height="100%" style={{ overflow: "visible" }}>
      {block.text && (
        <text x={200} y={18} textAnchor="middle" style={{ ...axisLabel, fontSize: 16, fill: INK }} opacity={ramp(age, 2, 10)}>
          {block.text}
        </text>
      )}
      <line x1={30} x2={30 + 340 * easeOut(ramp(age, 0, 12))} y1={214} y2={214} stroke={MUTED} strokeWidth={2} strokeLinecap="round" />
      {block.values.map((v, i) => {
        const s = sp(age, 8 + i * 9, true);
        const h = Math.max(6, (v / max) * 160) * s;
        const x = 40 + slot * i + (slot - width) / 2;
        const lead = v === max;
        return (
          <g key={i}>
            <rect x={x} y={214 - h} width={width} height={h} rx={10} fill={lead ? accent : `${accent}73`} style={lead ? { filter: `drop-shadow(0 0 12px ${accent}99)` } : undefined} />
            <text x={x + width / 2} y={214 - h - 10} textAnchor="middle" style={{ fontFamily: FONT, fontWeight: 700, fontSize: 19, fill: INK }} opacity={ramp(age, 16 + i * 9, 8)}>
              {show(v)}
            </text>
            <text x={x + width / 2} y={238} textAnchor="middle" style={axisLabel} opacity={ramp(age, 6 + i * 9, 8)}>
              {block.items[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Le premier nombre d'un texte (« F = 120 N » → 120), ou null. */
const firstNumber = (text: string): number | null => {
  const m = /\d+(?:[.,]\d+)?/.exec(text);
  return m ? Number(m[0].replace(",", ".")) : null;
};

/**
 * Le levier : une barre sur son pivot, une force à chaque bout. Le pivot est
 * placé selon la proportion des bras ; « rotate » fait pencher la barre. Les
 * flèches ont la même longueur, sauf si les deux textes portent une valeur :
 * elles sont alors proportionnelles à ces valeurs (affichées, donc contrôlées).
 */
function LeverBlock({ block, age, accent, actions, local, narrow }: BlockProps) {
  const W = narrow ? 440 : 540;
  const [a, b] = [block.values[0] ?? 1, block.values[1] ?? 1];
  const L = W - 150;
  const px = 75 + (L * a) / (a + b);
  const py = 168;
  // L'angle : chaque « rotate » fixe une nouvelle inclinaison, atteinte en ressort.
  let angle = 0;
  let prev = 0;
  for (const act of actions) {
    if (act.action !== "rotate") continue;
    angle += (act.angle - prev) * sp(local, act.at, true);
    prev = act.angle;
  }
  const rad = (angle * Math.PI) / 180;
  const end = (dx: number) => [px + dx * Math.cos(rad), py + dx * Math.sin(rad)] as const;
  const left = end(-(L * a) / (a + b));
  const right = end((L * b) / (a + b));
  const grow = easeOut(ramp(age, 6, 16));
  const [v1, v2] = [firstNumber(block.items[0] ?? ""), firstNumber(block.items[1] ?? "")];
  const len = (v: number | null) => (v1 && v2 ? 34 + 58 * ((v ?? 0) / Math.max(v1, v2)) : 62);
  const force = (p: readonly [number, number], length: number, label: string, at: number, color: string, anchor: "start" | "end") => {
    const s = sp(age, at, true);
    const top = p[1] - 12 - length;
    return (
      <g opacity={Math.min(1, s * 1.5)} transform={`translate(0 ${(1 - s) * -26})`}>
        <path d={`M${p[0]} ${top} V${p[1] - 14} m-7 -9 l7 9 l7 -9`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 7px ${color}aa)` }} />
        <text x={p[0]} y={top - 12} textAnchor={anchor === "start" ? "start" : "end"} dx={anchor === "start" ? -14 : 14} style={{ fontFamily: FONT, fontWeight: 700, fontSize: 18, letterSpacing: "-0.01em", fill: INK }}>
          {label}
        </text>
      </g>
    );
  };
  const base = sp(age, 0, true);
  return (
    <svg viewBox={`0 0 ${W} 250`} width="100%" height="100%" style={{ overflow: "visible" }}>
      <line x1={px - 90} x2={px + 90} y1={py + 62} y2={py + 62} stroke={MUTED} strokeWidth={2.5} strokeLinecap="round" opacity={base} />
      <path d={`M${px} ${py + 6} l-30 56 h60 z`} fill="rgb(148 163 184 / 0.22)" stroke={MUTED} strokeWidth={2.5} strokeLinejoin="round" opacity={base} transform={`translate(0 ${(1 - base) * 20})`} />
      {/* Les deux bras, dans deux couleurs : on VOIT lequel est le plus long. */}
      <line x1={px} y1={py} x2={px + (left[0] - px) * grow} y2={py + (left[1] - py) * grow} stroke={accent} strokeWidth={9} strokeLinecap="round" />
      <line x1={px} y1={py} x2={px + (right[0] - px) * grow} y2={py + (right[1] - py) * grow} stroke={HUE.yellow} strokeWidth={9} strokeLinecap="round" />
      <circle cx={px} cy={py} r={9} fill="#0B1226" stroke={INK} strokeWidth={3} opacity={base} />
      {force(left, len(v1), block.items[0] ?? "", 20, accent, "start")}
      {force(right, len(v2), block.items[1] ?? "", 28, HUE.yellow, "end")}
    </svg>
  );
}

const BLOCKS: Record<MotionBlock["type"], (p: BlockProps) => ReactNode> = {
  title: TitleBlock,
  text: TextBlock,
  icon: IconBlock,
  formula: FormulaBlock,
  steps: StepsBlock,
  list: ListBlock,
  chart: ChartBlock,
  bars: BarsBlock,
  lever: LeverBlock,
};

/* ── Une scène ─────────────────────────────────────────────────────────── */

interface SceneProps {
  scene: ExplainerScene;
  motion: MotionScene;
  /** Image locale (0 = premier mot de la scène) et durée de la scène. */
  local: number;
  frames: number;
  words: { text: string; at: number }[];
  labels: MotionProps["labels"];
  index: number;
  decimalComma: boolean;
}

/** La place de chaque bloc à l'image `f` : les mises en page successives, reliées par des ressorts. */
function usePlacement(motion: MotionScene, timing: Record<string, BlockTiming>, area: { x: number; y: number; w: number; h: number }, narrow: boolean, gap: number) {
  return useMemo(() => {
    const events = [...new Set(Object.values(timing).flatMap((t) => [t.enter, t.exit]).filter(Number.isFinite))].sort((x, y) => x - y);
    const layouts = events.map((at) => {
      const visible = motion.blocks.filter((b) => timing[b.id] && timing[b.id]!.enter <= at && at < timing[b.id]!.exit);
      const rects = layoutBlocks(visible.map((b) => blockSize(b, narrow)), area, 1.35, gap);
      return { at, rects: Object.fromEntries(visible.map((b, i) => [b.id, rects[i]!])) as Record<string, Rect> };
    });
    return (id: string, f: number): Rect | null => {
      const first = layouts.findIndex((l) => l.rects[id]);
      if (first < 0) return null;
      const rect = { ...layouts[first]!.rects[id]! };
      let before = layouts[first]!.rects[id]!;
      for (let k = first + 1; k < layouts.length && layouts[k]!.at <= f; k++) {
        const next = layouts[k]!.rects[id];
        if (!next) break;
        const s = sp(f, layouts[k]!.at);
        rect.x += (next.x - before.x) * s;
        rect.y += (next.y - before.y) * s;
        rect.scale += (next.scale - before.scale) * s;
        before = next;
      }
      return rect;
    };
  }, [motion, timing, area, narrow, gap]);
}

/** Le point où le segment centre → centre sort du rectangle (avec une marge). */
function edgePoint(from: Rect, to: Rect, margin: number): [number, number] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const hw = (from.w * from.scale) / 2 + margin;
  const hh = (from.h * from.scale) / 2 + margin;
  const k = Math.min(Math.abs(dx) > 0.01 ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY, Math.abs(dy) > 0.01 ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY);
  return [from.x + dx * Math.min(k, 0.5), from.y + dy * Math.min(k, 0.5)];
}

function SceneContent({ scene, motion, local, frames, words, labels, index, decimalComma }: SceneProps) {
  const { width, height } = useVideoConfig();
  const narrow = height > width;
  const area = useMemo(() => (narrow ? { x: 30, y: 150, w: width - 60, h: height - 150 - 230 } : { x: 44, y: 86, w: width - 88, h: height - 86 - 108 }), [narrow, width, height]);
  const timeline = useMemo(() => resolveTimeline(motion, words, frames, MOTION_FPS), [motion, words, frames]);
  const hasArrows = timeline.actions.some((a) => a.action === "pointTo");
  const placeOf = usePlacement(motion, timeline.blocks, area, narrow, hasArrows ? 64 : 30);

  // La question mystère est déjà écrite en grand par son bloc « title » : pas deux fois à l'écran.
  const titled = motion.blocks.some((b) => b.type === "title" && (scene.stage === "hook" || b.text.trim() === scene.heading.trim()));
  const stage = scene.stage ? labels.stages?.[scene.stage] : undefined;
  const source = scene.sourceKind === "document" ? `${labels.source} · ${scene.sourceTitle}` : scene.sourceKind === "solver" ? labels.solver : scene.stage === "example" ? labels.example : "";
  const head = sp(local, 2);

  const placed = motion.blocks.map((block) => ({ block, timing: timeline.blocks[block.id], rect: placeOf(block.id, local) })).filter((p) => p.timing && p.rect && local >= p.timing.enter - 1);

  return (
    <AbsoluteFill style={{ transform: `scale(${1 + 0.03 * Math.min(1, local / Math.max(1, frames))})` }}>
      {/* L'en-tête : le temps de la leçon et le titre de la scène. */}
      <div style={{ position: "absolute", left: area.x, right: area.x, top: narrow ? 56 : 26, display: "flex", alignItems: "center", gap: 12, opacity: Math.min(1, head * 1.4), transform: `translateX(${(1 - head) * -30}px)` }}>
        {stage && (
          <span style={{ flex: "none", fontFamily: FONT, fontWeight: 700, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "#0B1226", background: HUE.yellow, padding: "6px 11px", borderRadius: 999 }}>
            {stage}
            {scene.stage === "step" ? ` ${index}` : ""}
          </span>
        )}
        <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
          {!titled && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: scene.heading.length > 44 ? 17 : narrow ? 19 : 21, lineHeight: 1.15, letterSpacing: "-0.02em", color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{scene.heading}</span>}
          {/* La source de la scène : le document cité, le solveur, ou « exemple ». */}
          {source && <span style={{ fontFamily: FONT, fontWeight: 500, fontSize: 11.5, lineHeight: 1.1, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: ramp(local, 12, 12) }}>{source}</span>}
        </span>
      </div>

      {placed.map(({ block, timing, rect }, order) => {
        const t = timing!;
        const r = rect!;
        const age = local - t.enter;
        const mine = timeline.actions.filter((a) => a.element === block.id);
        const View = BLOCKS[block.type];

        // L'entrée.
        const soft = sp(local, t.enter);
        const bouncy = sp(local, t.enter, true);
        let opacity = ramp(local, t.enter, 7);
        let dx = 0;
        let dy = 0;
        let scale = 1;
        if (t.entrance === "slideUp") dy = (1 - bouncy) * 54;
        else if (t.entrance === "slideLeft") dx = (1 - bouncy) * 120;
        else if (t.entrance === "popIn") scale = bouncy;
        else if (t.entrance === "fadeIn") scale = 0.94 + 0.06 * soft;
        // Une fois posé, le bloc flotte à peine : rien n'est jamais figé à l'écran.
        dy += Math.sin(((local + order * 37) / MOTION_FPS) * 1.15) * 3 * ramp(local, t.enter + 18, 24);
        // La sortie.
        if (Number.isFinite(t.exit)) {
          const out = ramp(local, t.exit, 10);
          opacity *= 1 - out;
          scale *= 1 - 0.06 * out;
        }
        // Les accents.
        let rotate = 0;
        let glow = "";
        let accent = accentOf(block.color);
        const frames_: { color: string; p: number }[] = [];
        for (const a of mine) {
          if (local < a.at) continue;
          const p = ramp(local, a.at, 18);
          if (a.action === "pulse") {
            scale *= 1 + 0.13 * Math.sin(Math.PI * p);
            accent = HUE[a.color];
            glow = `drop-shadow(0 0 ${14 + 16 * Math.sin(Math.PI * p)}px ${HUE[a.color]}${p < 1 ? "cc" : "66"})`;
          } else if (a.action === "shake") dx += Math.sin(p * Math.PI * 7) * 9 * (1 - p);
          else if (a.action === "rotate" && block.type !== "lever") rotate += a.angle * sp(local, a.at, true);
          else if (a.action === "highlight") frames_.push({ color: HUE[a.color], p: easeOut(ramp(local, a.at, 20)) });
        }
        const w = r.w;
        const h = r.h;
        return (
          <div
            key={block.id}
            style={{ position: "absolute", left: r.x - w / 2, top: r.y - h / 2, width: w, height: h, opacity, transform: `translate(${dx}px, ${dy}px) scale(${r.scale * scale}) rotate(${rotate}deg)`, filter: glow || undefined, willChange: "transform" }}
          >
            <View block={block} age={age} written={t.entrance === "write"} accent={accent} narrow={narrow} cues={words.filter((x) => x.at >= t.enter).map((x) => ({ text: x.text, at: x.at - t.enter }))} room={frames - t.enter} actions={mine} local={local} decimalComma={decimalComma} />
            {/* « highlight » : l'encadré se trace autour du bloc. */}
            {frames_.map((fr, k) => (
              <svg key={k} width={w + 28} height={h + 28} style={{ position: "absolute", left: -14, top: -14, overflow: "visible", pointerEvents: "none" }}>
                <rect x={1.5} y={1.5} width={w + 25} height={h + 25} rx={20} fill={`${fr.color}14`} fillOpacity={fr.p} stroke={fr.color} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - fr.p} style={{ filter: `drop-shadow(0 0 10px ${fr.color}88)` }} />
              </svg>
            ))}
          </div>
        );
      })}

      {/* « pointTo » : une flèche part d'un bloc et rejoint l'autre. */}
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}>
        {timeline.actions.map((a, k) => {
          if (a.action !== "pointTo" || local < a.at) return null;
          const from = placeOf(a.element, local);
          const to = placeOf(a.target, local);
          const [tf, tt] = [timeline.blocks[a.element], timeline.blocks[a.target]];
          if (!from || !to || !tf || !tt || local >= tf.exit || local >= tt.exit || local < tt.enter) return null;
          const [x1, y1] = edgePoint(from, to, 10);
          const [x2, y2] = edgePoint(to, from, 14);
          const length = Math.hypot(x2 - x1, y2 - y1);
          if (length < 16) return null;
          const p = easeOut(ramp(local, a.at, 16));
          const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
          const [hx, hy] = [x1 + (x2 - x1) * p, y1 + (y2 - y1) * p];
          const color = HUE[a.color];
          // Un point parcourt la flèche, encore et encore : le lien reste vivant.
          const run = ((local - a.at - 16) % 50) / 50;
          return (
            <g key={k} style={{ filter: `drop-shadow(0 0 7px ${color}aa)` }}>
              <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={color} strokeWidth={3.5} strokeLinecap="round" />
              <path d={`M${hx - ux * 13 - uy * 8} ${hy - uy * 13 + ux * 8} L${hx} ${hy} L${hx - ux * 13 + uy * 8} ${hy - uy * 13 - ux * 8}`} fill="none" stroke={color} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
              {p >= 1 && run >= 0 && <circle cx={x1 + (x2 - x1) * run} cy={y1 + (y2 - y1) * run} r={4.5} fill="#fff" opacity={Math.sin(Math.PI * run)} />}
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
}

/** Une scène et son arrivée : fondu, volet, glissement ou zoom. Opaque : elle recouvre la précédente. */
function SceneLayer({ transition, local, first, children }: { transition: Transition; local: number; first: boolean; children: ReactNode }) {
  const { width } = useVideoConfig();
  const p = first ? 1 : easeOut(ramp(local, 0, TRANSITION_FRAMES));
  const style: CSSProperties =
    transition === "wipe"
      ? { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` }
      : transition === "slide"
        ? { transform: `translateX(${(1 - p) * 100}%)` }
        : transition === "zoom"
          ? { opacity: Math.min(1, p * 1.6), transform: `scale(${1.16 - 0.16 * p})` }
          : { opacity: p };
  return (
    <>
      <AbsoluteFill style={style}>
        <Backdrop />
        {children}
      </AbsoluteFill>
      {/* Le volet a un bord lumineux : on voit la nouvelle scène balayer l'ancienne. */}
      {transition === "wipe" && p < 1 && <div style={{ position: "absolute", top: 0, bottom: 0, left: p * width - 2, width: 4, background: HUE.yellow, boxShadow: `0 0 26px 6px ${HUE.yellow}99`, opacity: Math.sin(Math.PI * p) }} />}
    </>
  );
}

/* ── Les sous-titres : la phrase en cours, le mot dit en jaune ─────────── */

function captionChunks(words: ExplainerWord[]): ExplainerWord[][] {
  const chunks: ExplainerWord[][] = [];
  let cur: ExplainerWord[] = [];
  let chars = 0;
  words.forEach((w, i) => {
    cur.push(w);
    chars += w.text.length + 1;
    const next = words[i + 1];
    const pause = next ? next.startMs - w.endMs > 420 : true;
    if (pause || chars > 40 || (/[.!?:;]$/.test(w.text) && chars > 14) || (w.text.endsWith(",") && chars > 26)) {
      chunks.push(cur);
      cur = [];
      chars = 0;
    }
  });
  if (cur.length) chunks.push(cur);
  return chunks;
}

export function Captions({ words }: { words: ExplainerWord[] }) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const narrow = height > width;
  const chunks = useMemo(() => captionChunks(words), [words]);
  const ms = (frame / MOTION_FPS) * 1000;
  const chunk = chunks.find((c) => ms >= c[0]!.startMs - 120 && ms <= c[c.length - 1]!.endMs + 380);
  if (!chunk) return null;
  const inFrame = Math.round(((chunk[0]!.startMs - 120) / 1000) * MOTION_FPS);
  const s = sp(frame, inFrame);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: narrow ? 92 : 34, display: "flex", justifyContent: "center", padding: "0 28px", opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 10}px)` }}>
      <div style={{ maxWidth: narrow ? "100%" : "78%", padding: "9px 18px", borderRadius: 14, background: "rgb(4 8 18 / 0.62)", boxShadow: "inset 0 0 0 1px rgb(255 255 255 / 0.08)", fontFamily: FONT, fontWeight: 600, fontSize: narrow ? 21 : 22, lineHeight: 1.3, letterSpacing: "-0.012em", textAlign: "center" }}>
        {chunk.map((w, i) => {
          const said = ms >= w.startMs;
          const now = said && ms <= w.endMs + 90;
          return (
            <span key={i} style={{ color: now ? HUE.yellow : said ? INK : "rgb(248 250 252 / 0.42)" }}>
              {w.text}
              {i < chunk.length - 1 ? " " : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ── La composition ────────────────────────────────────────────────────── */

export function MotionExplanation({ audioUrl, musicUrl, durationMs, scenes, words, sceneStartsMs, labels, decimalComma = false }: MotionProps) {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const total = Math.max(MOTION_FPS, Math.ceil((durationMs / 1000) * MOTION_FPS));
  const starts = useMemo(() => scenes.map((_, i) => (i === 0 ? 0 : Math.round(((sceneStartsMs[i] ?? 0) / 1000) * MOTION_FPS))), [scenes, sceneStartsMs]);
  const spans = useMemo(() => speechSpans(words), [words]);
  // Les mots de chaque scène, en images depuis son début.
  const sceneWords = useMemo(
    () =>
      scenes.map((_, i) => {
        const from = starts[i]!;
        const to = starts[i + 1] ?? total;
        return words.map((w) => ({ text: w.text, at: Math.round((w.startMs / 1000) * MOTION_FPS) })).filter((w) => w.at >= from && w.at < to).map((w) => ({ text: w.text, at: w.at - from }));
      }),
    [scenes, starts, words, total],
  );
  // Une scène sans mise en scène (ancienne vidéo, bloc refusé) : celle fabriquée par le code.
  const motions = useMemo(() => scenes.map((s, i) => s.motion ?? defaultMotion({ heading: s.heading, bullets: s.bullets, formula: s.formula, steps: s.steps, visual: s.visual, stage: s.stage }, i)), [scenes]);

  let stepNo = 0;
  const stepIndex = scenes.map((s) => (s.stage === "step" ? ++stepNo : 0));

  return (
    <AbsoluteFill style={{ background: "#060A16", overflow: "hidden" }}>
      {scenes.map((scene, i) => {
        const from = starts[i]!;
        const to = starts[i + 1] ?? total;
        // La scène reste sous la suivante le temps de sa transition.
        if (frame < from || frame >= to + TRANSITION_FRAMES) return null;
        return (
          <SceneLayer key={i} transition={motions[i]!.transition} local={frame - from} first={i === 0}>
            <SceneContent scene={scene} motion={motions[i]!} local={frame - from} frames={to - from} words={sceneWords[i]!} labels={labels} index={stepIndex[i]!} decimalComma={decimalComma} />
          </SceneLayer>
        );
      })}
      <Captions words={words} />
      {/* L'avancement de la leçon, et un repère par scène. */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgb(255 255 255 / 0.08)" }}>
        <div style={{ height: "100%", width: `${(frame / total) * 100}%`, background: `linear-gradient(90deg, ${HUE.blue}, ${HUE.yellow})` }} />
        {starts.slice(1).map((s, i) => (
          <span key={i} style={{ position: "absolute", top: 0, bottom: 0, left: (s / total) * width - 1, width: 2, background: "#060A16" }} />
        ))}
      </div>
      {audioUrl && <Audio src={audioUrl} />}
      {musicUrl && <Audio src={musicUrl} loop volume={(f) => musicGain(f / MOTION_FPS, spans, total / MOTION_FPS)} />}
    </AbsoluteFill>
  );
}
