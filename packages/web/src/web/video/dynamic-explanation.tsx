import { useMemo } from "react";
import katex from "katex";
import { AbsoluteFill, Audio, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BoardStatus, GlassBoard, PaperNote, SolverStamp } from "@/components/hoersaal";
import { HoersaalStage } from "@/components/hoersaal-stage";
import { HologramProfessor } from "@/components/hologram-professor";
import { parseBeamPayload, renderBeamSvg } from "@/lib/beam-svg";
import { payloadToProblem, type BeamDiagramPayload } from "../../api/lib/beam-tool";
import { solveMechanicsSafe } from "../../api/lib/mechanics-solver";
import { BEAM_VISUALS, tiePunctuation, type ChartKey, type RealImageKey, type Stage, type Visual, type VisualCue } from "../../api/lib/video-visuals";
import type { Professor } from "../../api/lib/professors";
import { beamPen, loadCueFrame, type PenPoint } from "./marker-hand";

/**
 * « Als Video erklären » — la composition de la vidéo explicative.
 *
 * Jouée en direct dans le navigateur par le lecteur Remotion (chat, tableau
 * de bord), et enregistrée telle quelle dans packages/video pour un futur
 * export MP4. Elle est faite des vrais composants du Digitaler Hörsaal
 * (GlassBoard, PaperNote, KaTeX, professeur) : la vidéo ressemble à l'app.
 *
 * ── La durée vient de la voix ─────────────────────────────────────────────
 * Rien n'est fixé ici : `explainerFrames(durationMs)` donne le nombre
 * d'images, et `durationMs` est la durée de l'audio (30 s à 3 min).
 *
 * ── Le rythme vient de la voix ────────────────────────────────────────────
 * Chaque scène commence au premier mot de sa voix off (`sceneStartsMs`) ;
 * ses points apparaissent quand la voix avance, la formule s'écrit, et les
 * sous-titres suivent les mots horodatés.
 *
 * ── Une démonstration, pas des diapositives ───────────────────────────────
 * Chaque scène porte une directive visuelle (`visual`, liste fermée dans
 * api/lib/video-visuals.ts) : la poutre qui se dessine, les charges qui
 * arrivent flèche après flèche, le vrai schéma du solveur, une image du monde
 * réel, la formule en grand. Le visuel occupe le tableau ; l'explication est
 * dite par la voix et suivie par les sous-titres, en bas.
 *
 * ── Une mini-leçon, façon vidéo d'explication ─────────────────────────────
 * Chaque scène porte sa place dans la leçon (`stage`) : la question mystère
 * qui s'écrit en grand, l'explication pas à pas, l'exemple concret, puis le
 * récapitulatif qui se coche point par point. Les visuels « de texte » se
 * jouent sur un fond sombre à halos jaunes ; les sous-titres suivent la voix
 * mot à mot, en bas.
 *
 * ── Rien n'est inventé à l'écran ──────────────────────────────────────────
 * Le modèle choisit un visuel, il ne dessine pas. La poutre vient d'un calcul
 * du solveur (`beam`) : positions, charges et valeurs sont les siennes, et le
 * schéma Q(x) / M(x) est recalculé ici par le même solveur. Sans calcul, la
 * poutre est un croquis de principe sans aucune valeur, et aucun diagramme
 * n'est tracé. Les formules passent par KaTeX ; chaque scène affiche sa
 * source — le document cité, le tampon du solveur, ou « exemple ».
 */

export const EXPLAINER_FPS = 30;

/** Nombre d'images de la vidéo : la durée de l'audio, jamais une valeur fixe. */
export const explainerFrames = (durationMs: number): number => Math.max(EXPLAINER_FPS, Math.ceil((durationMs / 1000) * EXPLAINER_FPS));

/** Vertical (téléphone) ou horizontal (ordinateur) : mêmes points logiques que l'app. */
export const EXPLAINER_SIZE = {
  portrait: { width: 540, height: 960 },
  landscape: { width: 960, height: 540 },
} as const;
export type ExplainerOrientation = keyof typeof EXPLAINER_SIZE;

export interface ExplainerScene {
  heading: string;
  bullets: string[];
  formula: string;
  quote: string;
  voiceover: string;
  sourceTitle: string;
  sourceKind: "document" | "solver" | "analogy";
  /** Ce que la scène montre. Absent (anciennes vidéos) : la feuille de texte. */
  visual?: Visual;
  image?: RealImageKey | null;
  /** Diagramme de flux : les étapes, dans l'ordre. */
  steps?: string[];
  /** Texte surligné : les mots-clés de la citation. */
  keywords?: string[];
  /** Courbe de principe. */
  chart?: ChartKey | null;
  /** La place dans la mini-leçon. Absent (anciennes vidéos) : aucune étiquette. */
  stage?: Stage;
  /** L'ordre visuel exécuté (draw_flowchart, write_equation, show_beam…). Informatif : `visual` décide. */
  visual_cues?: VisualCue[];
}

export interface ExplainerWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface ExplainerLabels {
  /** « Digitaler Hörsaal · Erklärvideo ». */
  eyebrow: string;
  /** « TRED erklärt … ». */
  status: string;
  /** « Quelle » — devant le titre du document cité. */
  source: string;
  /** Tampon du solveur : [« Berechnet », « mit dem Löser »]. */
  solver: [string, string];
  /** « Beispiel aus dem Alltag » — sur une scène d'exemple. */
  example: string;
  /** « Prinzipskizze » — sous une poutre sans valeurs. */
  sketch: string;
  /** Courbe d'offre et de demande : [offre, demande, prix, quantité]. */
  market: [string, string, string, string];
  /** Les quatre temps de la leçon : « Die Frage », « Schritt », « Beispiel », « Merke ». */
  stages?: Record<Stage, string>;
}

// `type` et non `interface` : Remotion exige des props assignables à Record<string, unknown>.
export type ExplainerProps = {
  /** La voix (MP3). Vide : la composition se joue sans son (aperçus). */
  audioUrl: string;
  /** Durée de l'audio + marge : c'est elle qui fixe la durée de la vidéo. */
  durationMs: number;
  title: string;
  scenes: ExplainerScene[];
  words: ExplainerWord[];
  sceneStartsMs: number[];
  /** Les fonds de la filière de l'étudiant ; ils tournent en fondu. */
  backgroundImages: string[];
  professor: Professor;
  labels: ExplainerLabels;
  /** La poutre calculée par le solveur (ou null : croquis de principe, aucun diagramme). */
  beam?: BeamDiagramPayload | null;
  /** Mot-clé → URL des images du monde réel (fournies par l'hôte : app ou paquet vidéo). */
  realImages?: Partial<Record<RealImageKey, string>>;
  /** Virgule décimale (allemand, français…) ou point (anglais). */
  decimalComma?: boolean;
  /** L'image de contexte de la vidéo (tribunal, bloc opératoire, pont…), très sombre, derrière les visuels. */
  backdrop?: RealImageKey | null;
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = (t: number) => 1 - (1 - t) ** 3;
const progress = (frame: number, from: number, to: number) => ease(interpolate(frame, [from, Math.max(from + 1, to)], [0, 1], clamp));

/** Chaque fond reste 9 s, fondu d'une seconde vers le suivant. */
const BG_HOLD = 9 * EXPLAINER_FPS;
const BG_FADE = EXPLAINER_FPS;

function Backgrounds({ images }: { images: string[] }) {
  const frame = useCurrentFrame();
  if (images.length === 0) return null;
  const n = Math.floor(frame / BG_HOLD);
  const local = frame - n * BG_HOLD;
  const fade = images.length > 1 ? interpolate(local, [BG_HOLD - BG_FADE, BG_HOLD], [0, 1], clamp) : 0;
  const layer = (src: string, opacity: number, zoomFrom: number) => (
    <Img
      src={src}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity, transform: `scale(${1.04 + (zoomFrom / BG_HOLD) * 0.05})` }}
    />
  );
  return (
    <AbsoluteFill style={{ background: "#070B14", overflow: "hidden" }}>
      {layer(images[n % images.length]!, 1, local)}
      {fade > 0 && layer(images[(n + 1) % images.length]!, fade, local - BG_HOLD)}
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgb(7 11 20 / 0.55), rgb(7 11 20 / 0.35) 45%, rgb(7 11 20 / 0.6))" }} />
    </AbsoluteFill>
  );
}

/** Rebond d'apparition (pop-in), piloté par `spring` de Remotion. */
const pop = (frame: number, at: number, damping = 13) => (frame < at ? 0 : spring({ frame: frame - at, fps: EXPLAINER_FPS, config: { damping, stiffness: 150, mass: 0.7 } }));

/**
 * Une formule KaTeX qui s'écrit CARACTÈRE PAR CARACTÈRE, comme à la machine.
 * Le rendu reste celui de KaTeX : on ne fait qu'allumer ses glyphes un à un,
 * dans l'ordre du texte. Les traits (barre de fraction, racine) apparaissent
 * quand l'écriture les atteint. Une formule illisible n'est pas affichée.
 */
function Formula({ tex, reveal, color }: { tex: string; reveal: number; color?: string }) {
  const parsed = useMemo(() => {
    try {
      const html = katex.renderToString(tex, { displayMode: true, throwOnError: true, output: "html" });
      // Le HTML, découpé en balises et en textes : seuls les textes sont des glyphes à taper.
      const pieces = html.split(/(>[^<>]+<)/);
      const glyphs = pieces.map((piece) => (/^>[^<>]+<$/.test(piece) ? (piece.slice(1, -1).match(/&[^;]+;|[\s\S]/gu) ?? []) : null));
      return { pieces, glyphs, total: glyphs.reduce((n, g) => n + (g?.length ?? 0), 0) };
    } catch {
      return null;
    }
  }, [tex]);
  if (!parsed) return null;
  const shown = Math.round(Math.max(0, Math.min(1, reveal)) * parsed.total);
  let i = 0;
  const html = parsed.pieces
    .map((piece, k) => {
      const glyphs = parsed.glyphs[k];
      if (!glyphs) return piece;
      return `>${glyphs.map((g) => `<span style="opacity:${i++ < shown ? 1 : 0}">${g}</span>`).join("")}<`;
    })
    .join("");
  return (
    <div
      className="tred-tex [&_.katex-display]:my-1.5"
      style={{ fontSize: "1.15em", color, ["--tex-rule" as string]: String(interpolate(reveal, [0.25, 0.6], [0, 1], clamp)) }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * À quelle image (dans la scène) la voix prononce chaque libellé : on cherche
 * son premier mot significatif dans les mots horodatés de la scène. Un libellé
 * que la voix ne dit pas tel quel (autre langue) prend sa place à intervalles
 * réguliers. Toujours croissant : les étapes arrivent dans l'ordre.
 */
function cueFrames(labels: string[], words: ExplainerWord[], from: number, to: number): number[] {
  const dur = to - from;
  const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[^\p{L}\p{N}]/gu, "");
  const inScene = words.map((w) => ({ t: norm(w.text), f: Math.round((w.startMs / 1000) * EXPLAINER_FPS) })).filter((w) => w.f >= from && w.f < to);
  const even = (i: number) => 10 + (i * dur * 0.72) / Math.max(1, labels.length);
  const cues: number[] = [];
  let cursor = 0;
  labels.forEach((label, i) => {
    const tokens = label.split(/[^\p{L}\p{N}]+/u).map(norm).filter((t) => t.length >= 4);
    let at = Number.NaN;
    for (let k = cursor; k < inScene.length && Number.isNaN(at); k++) {
      if (tokens.some((t) => inScene[k]!.t.startsWith(t.slice(0, 6)))) {
        at = inScene[k]!.f - from - 5;
        cursor = k + 1;
      }
    }
    const min = i === 0 ? 6 : cues[i - 1]! + 14;
    const wanted = Number.isNaN(at) ? even(i) : at;
    cues.push(Math.round(Math.max(min, Math.min(wanted, dur - 26 - (labels.length - 1 - i) * 14))));
  });
  return cues;
}

/* ── La poutre : dessinée d'après le calcul du solveur ─────────────────── */

const BLUE = "#2563EB";
const BODY = "#1E293B";
const GREY = "#64748B";

const fmt = (v: number, comma: boolean) => {
  const t = String(Number(v.toPrecision(4)));
  return comma ? t.replace(".", ",") : t;
};
const FORCE = { N: 1, kN: 1e3, MN: 1e6 } as const;
const LENGTH = { m: 1, cm: 0.01, mm: 0.001 } as const;

/**
 * La poutre, ses appuis et ses charges. `draw` (0→1) trace la poutre et pose
 * les appuis ; `loads` (0→1) fait arriver les flèches une à une et fléchir la
 * poutre. Avec `payload`, positions et valeurs sont celles du solveur ; sans
 * lui, un croquis de principe (q, l) sans aucun nombre.
 */
/**
 * La main-feutre : un feutre tenu par une main, dont la pointe est posée sur
 * `pen`. Dessinée dans le repère du schéma ; elle tremble très légèrement,
 * comme une main qui écrit. Purement décorative : elle ne trace rien.
 */
function MarkerHand({ pen, frame }: { pen: PenPoint; frame: number }) {
  if (pen.opacity <= 0) return null;
  const wobble = Math.sin(frame / 2.3) * 1.2;
  return (
    <g transform={`translate(${pen.x} ${pen.y}) rotate(${wobble})`} opacity={pen.opacity} style={{ filter: "drop-shadow(0 5px 6px rgb(15 23 42 / 0.28))" }}>
      {/* Le feutre : pointe à l'origine, corps vers le bas à droite. */}
      <g transform="rotate(38)">
        <path d="M 0 0 L 9 -3.4 L 9 3.4 Z" fill="#0F172A" />
        <rect x={9} y={-5.2} width={10} height={10.4} rx={1.6} fill="#EAB308" />
        <rect x={19} y={-6.4} width={78} height={12.8} rx={5} fill="#1B2A4A" />
        <rect x={19} y={-6.4} width={78} height={4} rx={2} fill="#33466F" />
      </g>
      {/* La main : le poing qui tient le feutre, puis le poignet et la manche. */}
      <g transform="rotate(38)">
        <path d="M 34 -13 C 44 -19, 60 -18, 66 -9 C 72 -2, 72 10, 64 17 C 54 25, 38 24, 31 16 C 26 10, 27 -6, 34 -13 Z" fill="#F1C7A0" stroke="#B98A63" strokeWidth={1.2} />
        <path d="M 37 -8 C 43 -11, 50 -11, 55 -7 M 36 -1 C 42 -4, 50 -4, 56 0 M 36 6 C 42 4, 49 4, 55 8" fill="none" stroke="#B98A63" strokeWidth={1.1} strokeLinecap="round" />
        <path d="M 60 -12 C 74 -16, 96 -12, 118 -4 L 110 30 C 92 30, 74 26, 62 16 Z" fill="#F1C7A0" stroke="#B98A63" strokeWidth={1.2} />
        <path d="M 100 -11 L 150 6 L 138 44 L 92 30 Z" fill="#0F172A" />
        <path d="M 100 -11 L 106 -9 L 97 31 L 92 30 Z" fill="#EAB308" />
      </g>
    </g>
  );
}

function BeamStage({ payload, draw, loads, comma, sketchLabel, frame = 0 }: { payload: BeamDiagramPayload | null; draw: number; loads: number; comma: boolean; sketchLabel: string; frame?: number }) {
  const X0 = 56;
  const X1 = 424;
  const Y = 132;
  const p = payload?.problem;
  const L = p?.length ?? 1;
  const sx = (x: number) => X0 + (x / L) * (X1 - X0);
  const uF = payload ? FORCE[payload.units.force] : 1;
  const uL = payload ? LENGTH[payload.units.length] : 1;

  const supports = p ? p.supports : [{ x: 0, kind: "festlager", name: "A" }, { x: 1, kind: "loslager", name: "B" }];
  const distributed = p ? p.distributedLoads : [{ from: 0, to: 1, q: 1 }];
  const points = p ? p.pointLoads : [];

  // La flèche de la poutre : une courbe de principe, pas une valeur calculée.
  const sag = 13 * ease(Math.max(0, (loads - 0.45) / 0.55));
  const beamPath = `M ${X0} ${Y} Q ${(X0 + X1) / 2} ${Y + sag * 2} ${X1} ${Y}`;
  const yAt = (x: number) => {
    const u = (sx(x) - X0) / (X1 - X0);
    return Y + sag * 4 * u * (1 - u);
  };
  const length = X1 - X0;

  // Toutes les flèches, de gauche à droite : elles tombent l'une après l'autre.
  const arrows: { x: number; top: number; strong: boolean }[] = [];
  for (const d of distributed) {
    const n = Math.max(3, Math.round(((sx(d.to) - sx(d.from)) / length) * 11));
    for (let i = 0; i <= n; i++) arrows.push({ x: d.from + ((d.to - d.from) * i) / n, top: 62, strong: false });
  }
  for (const f of points) arrows.push({ x: f.x, top: 36, strong: true });
  arrows.sort((u, v) => u.x - v.x);

  const supportsIn = ease(Math.max(0, (draw - 0.55) / 0.45));
  // La main-feutre suit le bout du trait : mêmes positions que le tracé ci-dessous.
  const firstLoad = distributed[0];
  const pen = beamPen({
    draw,
    loads,
    x0: X0,
    x1: X1,
    y: Y,
    supportXs: supports.map((sp) => sx(sp.x)),
    loadLine: firstLoad ? { from: sx(firstLoad.from), to: sx(firstLoad.to), top: 62 } : undefined,
    arrows: arrows.map((a) => ({ x: sx(a.x), top: a.top, tip: yAt(a.x) - 5 })),
  });
  return (
    <svg viewBox="0 0 480 236" style={{ width: "100%", height: "100%", overflow: "visible" }} fontFamily="Inter, ui-sans-serif, system-ui, sans-serif">
      {/* Charges réparties : le trait du haut, puis les flèches. */}
      {distributed.map((d, i) => (
        <g key={`d${i}`} opacity={Math.min(1, loads * 3)}>
          <line x1={sx(d.from)} y1={62} x2={sx(d.from) + (sx(d.to) - sx(d.from)) * Math.min(1, loads * 2.2)} y2={62} stroke={BLUE} strokeWidth={2.5} strokeLinecap="round" />
          <text x={(sx(d.from) + sx(d.to)) / 2} y={48} textAnchor="middle" fontSize={15} fontWeight={700} fill={BLUE} opacity={ease(Math.max(0, (loads - 0.5) * 2))}>
            {payload ? `q = ${fmt((d.q * uL) / uF, comma)} ${payload.units.force}/${payload.units.length}` : "q"}
          </text>
        </g>
      ))}
      {arrows.map((a, i) => {
        const k = ease(Math.max(0, Math.min(1, loads * (arrows.length + 4) * 0.6 - i * 0.55)));
        const tip = yAt(a.x) - 5;
        const x = sx(a.x);
        return (
          <g key={`a${i}`} opacity={k} transform={`translate(0 ${(1 - k) * -26})`}>
            <line x1={x} y1={a.top} x2={x} y2={tip - 7} stroke={BLUE} strokeWidth={a.strong ? 3.5 : 2} strokeLinecap="round" />
            <path d={`M ${x - 5} ${tip - 9} L ${x} ${tip} L ${x + 5} ${tip - 9} Z`} fill={BLUE} />
          </g>
        );
      })}
      {points.map((f, i) => (
        <text key={`f${i}`} x={sx(f.x) + 9} y={34} fontSize={15} fontWeight={700} fill={BLUE} opacity={ease(Math.max(0, (loads - 0.5) * 2))}>
          F = {fmt(f.F / uF, comma)} {payload?.units.force}
        </text>
      ))}

      {/* La poutre : un trait qui se dessine de gauche à droite. */}
      <path d={beamPath} fill="none" stroke={BODY} strokeWidth={7} strokeLinecap="round" strokeDasharray={length + 20} strokeDashoffset={(1 - ease(Math.min(1, draw / 0.6))) * (length + 20)} />

      {/* Les appuis, à leur vraie position. */}
      {supports.map((sp, i) => {
        const x = sx(sp.x);
        return (
          <g key={`s${i}`} opacity={supportsIn} transform={`translate(0 ${(1 - supportsIn) * 12})`}>
            {sp.kind === "einspannung" ? (
              <>
                <line x1={x} y1={Y - 26} x2={x} y2={Y + 26} stroke={BODY} strokeWidth={4} />
                {[-20, -8, 4, 16].map((dy) => (
                  <line key={dy} x1={x} y1={Y + dy} x2={x + (sp.x <= L / 2 ? -10 : 10)} y2={Y + dy + 9} stroke={BODY} strokeWidth={1.6} />
                ))}
              </>
            ) : (
              <>
                <path d={`M ${x} ${Y + 4} L ${x - 13} ${Y + 26} L ${x + 13} ${Y + 26} Z`} fill="#FFFFFF" stroke={BODY} strokeWidth={2.4} strokeLinejoin="round" />
                {sp.kind === "loslager" ? (
                  <>
                    <circle cx={x - 7} cy={Y + 30.5} r={3.4} fill="#FFFFFF" stroke={BODY} strokeWidth={1.8} />
                    <circle cx={x + 7} cy={Y + 30.5} r={3.4} fill="#FFFFFF" stroke={BODY} strokeWidth={1.8} />
                    <line x1={x - 18} y1={Y + 36} x2={x + 18} y2={Y + 36} stroke={BODY} strokeWidth={2} />
                  </>
                ) : (
                  <line x1={x - 18} y1={Y + 27} x2={x + 18} y2={Y + 27} stroke={BODY} strokeWidth={2} />
                )}
              </>
            )}
            <text x={x} y={Y + 58} textAnchor="middle" fontSize={16} fontWeight={700} fill={BODY}>
              {sp.name}
            </text>
          </g>
        );
      })}

      {/* La portée. */}
      <g opacity={supportsIn}>
        <line x1={X0} y1={Y + 78} x2={X1} y2={Y + 78} stroke={GREY} strokeWidth={1.4} />
        {[X0, X1].map((x) => (
          <line key={x} x1={x} y1={Y + 71} x2={x} y2={Y + 85} stroke={GREY} strokeWidth={1.4} />
        ))}
        <text x={(X0 + X1) / 2} y={Y + 96} textAnchor="middle" fontSize={15} fontWeight={600} fill={GREY}>
          {payload ? `l = ${fmt(L / uL, comma)} ${payload.units.length}` : "l"}
        </text>
      </g>
      {!payload && (
        <text x={X1} y={18} textAnchor="end" fontSize={11} fill={GREY} letterSpacing={1.2} opacity={supportsIn}>
          {sketchLabel.toUpperCase()}
        </text>
      )}
      {/* Par-dessus tout le reste : la main qui tient le feutre. */}
      <MarkerHand pen={pen} frame={frame} />
    </svg>
  );
}

/**
 * Le vrai schéma du solveur (système, Q(x), M(x)), recalculé ici. Les courbes
 * se TRACENT de gauche à droite, comme au feutre : un trait jaune marque
 * l'endroit où la pointe se trouve.
 */
function SolverPlot({ payload, reveal }: { payload: BeamDiagramPayload; reveal: number }) {
  const svg = useMemo(() => {
    const parsed = parseBeamPayload(JSON.stringify(payload));
    if (!parsed) return null;
    const r = solveMechanicsSafe(payloadToProblem(parsed.problem));
    return r.ok ? renderBeamSvg(parsed, r) : null;
  }, [payload]);
  if (!svg) return null;
  return (
    <div className="relative h-full w-full">
      <div
        className="h-full w-full [&_svg]:mx-auto [&_svg]:block [&_svg]:h-full [&_svg]:max-w-full"
        style={{ clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {reveal > 0 && reveal < 1 && (
        <span
          style={{ position: "absolute", top: "4%", bottom: "4%", left: `${reveal * 100}%`, width: 3, borderRadius: 2, background: "#EAB308", boxShadow: "0 0 14px 3px rgb(234 179 8 / 0.65)" }}
        />
      )}
    </div>
  );
}

/* ── La bibliothèque universelle : flux, surlignage, courbe ───────────── */

/**
 * Un enchaînement d'étapes qui se construit AVEC la voix :
 *  - chaque case surgit (pop-in avec rebond) au moment où la voix la nomme ;
 *  - la flèche se trace vers la suivante (stroke-dashoffset) ;
 *  - la case dont la voix parle s'illumine d'un halo jaune qui respire, puis
 *    s'éteint quand on passe à la suivante.
 * Vertical sur téléphone, horizontal sur ordinateur.
 */
function Flowchart({ steps, local, cues, landscape }: { steps: string[]; local: number; cues: number[]; landscape: boolean }) {
  const n = steps.length;
  const horizontal = landscape;
  // Des étapes longues s'écrivent plus petit : la case ne déborde jamais.
  const longest = Math.max(...steps.map((x) => x.length));
  const ARROW = 22;
  return (
    <div className="flex h-full w-full items-center justify-center" style={{ flexDirection: horizontal ? "row" : "column", gap: 0 }}>
      {steps.map((step, i) => {
        const at = cues[i]!;
        const next = cues[i + 1];
        const k = pop(local, at);
        // Allumée à son tour, éteinte en douceur quand la suivante arrive.
        const lit = Math.min(1, k) * (next === undefined ? 1 : 1 - progress(local, next - 2, next + 12));
        const breath = 0.5 + 0.5 * Math.sin((local - at) / 5);
        const arrow = next === undefined ? 0 : progress(local, at + 9, Math.max(at + 20, next - 2));
        return (
          <div key={i} className="flex items-center" style={{ flexDirection: horizontal ? "row" : "column", flex: horizontal ? "1 1 0" : undefined, minWidth: 0 }}>
            <div
              style={{
                position: "relative",
                opacity: Math.min(1, k * 1.4),
                transform: `${horizontal ? `translateY(${(1 - Math.min(1, k)) * 18}px)` : `translateX(${(1 - Math.min(1, k)) * -26}px)`} scale(${0.82 + 0.18 * k + 0.035 * lit})`,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: horizontal ? "10px 12px" : n > 4 ? "6px 14px" : "9px 16px",
                minWidth: horizontal ? 0 : 250,
                maxWidth: horizontal ? "100%" : 400,
                borderRadius: 14,
                background: "#FFFFFF",
                border: "2px solid rgb(27 42 74 / 0.16)",
                boxShadow: `0 8px 18px -14px rgb(27 42 74 / 0.5), 0 0 ${(14 + 16 * breath) * lit}px ${(2 + 4 * breath) * lit}px rgb(234 179 8 / ${0.75 * lit})`,
                color: "#1B2A4A",
              }}
            >
              {/* Le fond jaune de la case active, par-dessus le blanc : il s'allume et s'éteint. */}
              <span style={{ position: "absolute", inset: -2, borderRadius: 14, background: "#FEF3C7", border: "2px solid #EAB308", opacity: lit }} />
              <span style={{ position: "relative", display: "grid", placeItems: "center", flexShrink: 0, width: 26, height: 26, borderRadius: 13, background: lit > 0.5 ? "#EAB308" : "#1B2A4A", color: lit > 0.5 ? "#0F172A" : "#FFFFFF", fontSize: 13, fontWeight: 800 }}>{i + 1}</span>
              <span style={{ position: "relative", fontSize: horizontal ? (longest > 26 ? 12.5 : 15) : longest > 34 ? 14.5 : 18, fontWeight: 700, lineHeight: 1.15 }}>{step}</span>
            </div>
            {i < n - 1 && (
              <svg width={horizontal ? 26 : 20} height={horizontal ? 20 : n > 4 ? 15 : 22} viewBox="0 0 26 22" style={{ flexShrink: 0, transform: horizontal ? undefined : "rotate(90deg)" }}>
                <line x1={2} y1={11} x2={2 + ARROW - 6} y2={11} stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeDasharray={ARROW} strokeDashoffset={ARROW * (1 - arrow)} />
                <path d="M16 5 L24 11 L16 17 Z" fill="currentColor" opacity={progress(arrow, 0.75, 1)} transform={`translate(${(1 - progress(arrow, 0.6, 1)) * -6} 0)`} />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** La phrase du cours, en grand ; ses mots-clés se surlignent en jaune l'un après l'autre, d'un coup de feutre. */
function HighlightText({ text, keywords, local, dur, dark }: { text: string; keywords: string[]; local: number; dur: number; dark: boolean }) {
  const parts = useMemo(() => {
    if (keywords.length === 0) return [{ text, key: -1 }];
    const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length);
    const re = new RegExp(`(${escaped.join("|")})`, "gi");
    return text.split(re).filter(Boolean).map((chunk) => ({ text: chunk, key: keywords.findIndex((k) => k.toLowerCase() === chunk.toLowerCase()) }));
  }, [text, keywords]);
  const slot = (dur * 0.6) / Math.max(1, keywords.length);
  const size = text.length > 220 ? 17 : text.length > 130 ? 20 : 24;
  // Le texte arrive mot par mot, puis les mots-clés s'allument.
  const typed = interpolate(local, [3, Math.min(dur * 0.3, 50)], [0, text.length], clamp);
  let seen = 0;
  return (
    <div className="grid h-full w-full place-items-center">
      <p className="font-display" style={{ margin: 0, fontSize: size, lineHeight: 1.5, fontWeight: 500, color: dark ? "#F8FAFC" : "#1B2A4A", textAlign: "left" }}>
        <span style={{ color: "#EAB308", fontSize: "1.6em", lineHeight: 0, verticalAlign: "-0.25em", marginRight: 4 }}>“</span>
        {parts.map((part, i) => {
          const start = seen;
          seen += part.text.length;
          const visible = Math.max(0, Math.min(part.text.length, Math.round(typed - start)));
          const shown = part.text.slice(0, visible);
          const hidden = part.text.slice(visible);
          if (part.key < 0) {
            return (
              <span key={i}>
                {shown}
                <span style={{ opacity: 0 }}>{hidden}</span>
              </span>
            );
          }
          const at = Math.max(Math.min(dur * 0.3, 50), 16) + part.key * slot;
          const k = progress(local, at, at + 12);
          const hit = pop(local, at, 9);
          return (
            <span
              key={i}
              style={{
                display: "inline",
                fontWeight: 700,
                color: dark && k > 0.5 ? "#0F172A" : undefined,
                backgroundImage: dark ? "linear-gradient(#FACC15, #FACC15)" : "linear-gradient(transparent 52%, rgb(234 179 8 / 0.65) 52%)",
                backgroundRepeat: "no-repeat",
                backgroundSize: `${k * 100}% 100%`,
                borderRadius: dark ? 4 : 0,
                padding: "0 3px",
                boxShadow: `0 0 ${18 * Math.max(0, 1.25 - hit) * k}px rgb(234 179 8 / ${0.9 * Math.max(0, 1.25 - hit) * k})`,
              }}
            >
              {shown}
              <span style={{ opacity: 0 }}>{hidden}</span>
            </span>
          );
        })}
      </p>
    </div>
  );
}

/** Offre et demande : la figure de manuel, sans aucune valeur. Les axes, puis les deux droites, puis l'équilibre. */
function MarketChart({ local, labels, dark }: { local: number; labels: [string, string, string, string]; dark: boolean }) {
  const BODY = dark ? "#E2E8F0" : "#1E293B";
  const GREY = dark ? "#94A3B8" : "#64748B";
  const BLUE = dark ? "#60A5FA" : "#2563EB";
  const [supply, demand, price, quantity] = labels;
  const axes = progress(local, 4, 26);
  const d = progress(local, 26, 60);
  const sp = progress(local, 54, 88);
  const eq = progress(local, 90, 104);
  const line = (x1: number, y1: number, x2: number, y2: number, k: number, color: string) => (
    <line x1={x1} y1={y1} x2={x1 + (x2 - x1) * k} y2={y1 + (y2 - y1) * k} stroke={color} strokeWidth={4} strokeLinecap="round" />
  );
  return (
    <svg viewBox="0 0 480 300" style={{ width: "100%", height: "100%" }} fontFamily="Inter, ui-sans-serif, system-ui, sans-serif">
      <line x1={70} y1={250} x2={70} y2={250 - 215 * axes} stroke={BODY} strokeWidth={2.5} strokeLinecap="round" />
      <line x1={70} y1={250} x2={70 + 360 * axes} y2={250} stroke={BODY} strokeWidth={2.5} strokeLinecap="round" />
      <text x={56} y={36} textAnchor="end" fontSize={15} fontWeight={700} fill={BODY} opacity={axes}>{price}</text>
      <text x={430} y={276} textAnchor="end" fontSize={15} fontWeight={700} fill={BODY} opacity={axes}>{quantity}</text>
      {line(100, 60, 400, 225, d, "#DC2626")}
      {line(100, 225, 400, 60, sp, BLUE)}
      <text x={404} y={232} fontSize={15} fontWeight={700} fill="#DC2626" opacity={d}>{demand}</text>
      <text x={404} y={58} fontSize={15} fontWeight={700} fill={BLUE} opacity={sp}>{supply}</text>
      <g opacity={eq}>
        <line x1={70} y1={142.5} x2={250} y2={142.5} stroke={GREY} strokeWidth={1.5} strokeDasharray="5 5" />
        <line x1={250} y1={142.5} x2={250} y2={250} stroke={GREY} strokeWidth={1.5} strokeDasharray="5 5" />
        <circle cx={250} cy={142.5} r={5 + 5 * eq} fill="#EAB308" stroke={BODY} strokeWidth={2} />
      </g>
    </svg>
  );
}

/** Les halos jaunes du fond sombre : deux lueurs qui dérivent très lentement. */
function Halos({ local }: { local: number }) {
  const a = Math.sin(local / 38);
  const b = Math.cos(local / 47);
  return (
    <>
      <div style={{ position: "absolute", left: `${-20 + a * 4}%`, top: `${-34 + b * 4}%`, width: "72%", height: "92%", background: "radial-gradient(closest-side, rgb(234 179 8 / 0.5), rgb(234 179 8 / 0) 74%)" }} />
      <div style={{ position: "absolute", right: `${-24 + b * 4}%`, bottom: `${-40 + a * 4}%`, width: "78%", height: "96%", background: "radial-gradient(closest-side, rgb(250 204 21 / 0.32), rgb(250 204 21 / 0) 74%)" }} />
    </>
  );
}

/**
 * La question mystère : un grand point d'interrogation surgit, puis la
 * question s'écrit lettre après lettre, comme à la machine, avec son curseur.
 */
function QuestionCard({ text, local, dur }: { text: string; local: number; dur: number }) {
  const chars = [...text];
  const mark = pop(local, 4, 9);
  const typeEnd = Math.min(14 + chars.length * 1.35, Math.max(24, dur * 0.62));
  const shown = Math.round(interpolate(local, [14, typeEnd], [0, chars.length], clamp));
  const typing = shown < chars.length;
  const caret = typing || Math.floor(local / 14) % 2 === 0 ? 1 : 0;
  const breath = 0.5 + 0.5 * Math.sin(local / 9);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center" style={{ gap: 14, padding: "0 10px" }}>
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 76,
          height: 76,
          borderRadius: 38,
          background: "#EAB308",
          color: "#0F172A",
          fontSize: 50,
          fontWeight: 900,
          lineHeight: 1,
          opacity: Math.min(1, mark * 1.5),
          transform: `scale(${0.4 + 0.6 * mark}) rotate(${(1 - Math.min(1, mark)) * -24 + Math.sin(local / 16) * 3}deg)`,
          boxShadow: `0 0 ${26 + 18 * breath}px ${4 + 6 * breath}px rgb(234 179 8 / 0.45)`,
        }}
      >
        ?
      </span>
      <p className="font-hand" style={{ margin: 0, textAlign: "center", color: "#F8FAFC", fontSize: chars.length > 70 ? 27 : 33, fontWeight: 700, lineHeight: 1.18, minHeight: "2.4em" }}>
        {chars.slice(0, shown).join("")}
        <span style={{ display: "inline-block", width: 3, height: "0.95em", marginLeft: 3, verticalAlign: "-0.12em", borderRadius: 2, background: "#EAB308", opacity: local < 14 ? 0 : caret }} />
      </p>
    </div>
  );
}

/**
 * Le récapitulatif : chaque point arrive quand la voix le dit, sa case se
 * coche d'un trait jaune (le trait se trace), puis le texte s'écrit.
 */
function RecapList({ bullets, local, cues }: { bullets: string[]; local: number; cues: number[] }) {
  const CHECK = 26;
  return (
    <div className="flex h-full w-full flex-col justify-center" style={{ gap: 14, padding: "0 6px" }}>
      {bullets.map((b, i) => {
        const at = cues[i] ?? 10 + i * 30;
        const k = pop(local, at);
        const tick = progress(local, at + 6, at + 20);
        return (
          <div key={i} className="flex items-center" style={{ gap: 14, opacity: Math.min(1, k * 1.4), transform: `translateX(${(1 - Math.min(1, k)) * -22}px)` }}>
            <svg width={38} height={38} viewBox="0 0 38 38" style={{ flexShrink: 0 }}>
              <circle cx={19} cy={19} r={16} fill={`rgb(234 179 8 / ${0.16 + 0.84 * tick})`} stroke="#EAB308" strokeWidth={2.5} />
              <path d="M11 19.5 L17 25 L27.5 13.5" fill="none" stroke="#0F172A" strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={CHECK} strokeDashoffset={CHECK * (1 - tick)} />
            </svg>
            <p className="font-hand" style={{ margin: 0, color: "#F8FAFC", fontSize: 25, fontWeight: 700, lineHeight: 1.2, clipPath: `inset(-20% ${(1 - progress(local, at + 2, at + 18)) * 100}% -20% 0)` }}>
              {b}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** L'étiquette du temps de la leçon : « Die Frage », « Schritt 2 », « Beispiel », « Merke ». */
function StageChip({ scenes, index, labels, opacity }: { scenes: ExplainerScene[]; index: number; labels: ExplainerLabels; opacity: number }) {
  const stage = scenes[index]?.stage;
  if (!stage || !labels.stages) return null;
  const n = scenes.slice(0, index + 1).filter((sc) => sc.stage === "step").length;
  return (
    <span
      className="rounded-full font-mono font-bold uppercase"
      // `alignSelf` en style : dans la colonne du tableau, l'étiquette ne doit jamais s'étirer.
      style={{ alignSelf: "flex-start", display: "inline-block", width: "fit-content", opacity, padding: "4px 11px", fontSize: 10.5, letterSpacing: "0.12em", background: "#0F172A", color: "#FACC15", boxShadow: "inset 0 0 0 1px rgb(234 179 8 / 0.5)" }}
    >
      {labels.stages[stage]}
      {stage === "step" ? ` ${n}` : ""}
    </span>
  );
}

/** Une image du monde réel, avec un lent travelling. */
function RealImage({ src, local }: { src: string; local: number }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", borderRadius: 18, background: "#070B14", boxShadow: "0 22px 44px -22px rgb(0 0 0 / 0.7)" }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.06 + local * 0.0009})` }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, rgb(7 11 20 / 0.55))" }} />
    </div>
  );
}

type SceneTiming = { from: number; to: number };
type VisualProps = Pick<ExplainerProps, "beam" | "realImages" | "decimalComma" | "labels" | "backdrop" | "words">;

/**
 * Les visuels « de texte » se jouent sur un fond sombre à halos jaunes (avec,
 * quand elle existe, l'image de contexte de la filière en dessous) ; les
 * schémas techniques (poutre, courbes du solveur) restent sur fond clair.
 */
const DARK_VISUALS: readonly Visual[] = ["flowchart", "highlight", "formula", "chart", "question", "recap"];
const backdropUrl = (props: VisualProps) => (props.backdrop ? props.realImages?.[props.backdrop] : undefined);
const isDarkStage = (scene: ExplainerScene, _props?: VisualProps) => DARK_VISUALS.includes(scene.visual ?? "text");

/** Le visuel d'une scène, à l'image `frame`. `end` : son état final (pour le fondu de sortie). */
function SceneVisual({
  scenes,
  index,
  timings,
  frame,
  landscape,
  props,
}: {
  scenes: ExplainerScene[];
  index: number;
  timings: SceneTiming[];
  frame: number;
  landscape: boolean;
  props: VisualProps;
}) {
  const scene = scenes[index]!;
  const { from, to } = timings[index]!;
  const local = frame - from;
  const visual = scene.visual ?? "text";
  const dark = isDarkStage(scene, props);
  const beam = props.beam ?? null;

  if (BEAM_VISUALS.includes(visual)) {
    // La même poutre reste à l'écran d'une scène à l'autre : on repart du début de la série.
    let first = index;
    while (first > 0 && BEAM_VISUALS.includes(scenes[first - 1]!.visual ?? "text")) first--;
    let loadsAt: number | null = null;
    for (let j = first; j <= index; j++) if (scenes[j]!.visual === "loads" && loadsAt === null) loadsAt = timings[j]!.from;
    const start = timings[first]!.from;
    // Poutre et charges dans la même scène : les charges arrivent quand la VOIX
    // en parle (au plus tôt une fois la poutre et ses appuis dessinés), et non
    // à une image fixe. Sans mot repère, elles suivent le tracé de la poutre.
    const sameScene = loadsAt === start;
    const sceneEnd = timings[index]!.to;
    const cue = sameScene ? loadCueFrame(props.words, start, sceneEnd, EXPLAINER_FPS) : undefined;
    const loadsFrom = loadsAt === null ? 0 : sameScene ? start + Math.min(Math.max(50, cue ?? 50), Math.max(50, sceneEnd - start - 90)) : loadsAt + 6;
    return (
      <BeamStage
        payload={beam}
        frame={frame}
        draw={interpolate(frame, [start + 4, start + 44], [0, 1], clamp)}
        loads={loadsAt === null ? 0 : interpolate(frame, [loadsFrom, loadsFrom + 64], [0, 1], clamp)}
        comma={props.decimalComma ?? true}
        sketchLabel={props.labels.sketch}
      />
    );
  }
  if (visual === "solver_plot" && beam) return <SolverPlot payload={beam} reveal={progress(local, 6, Math.min(to - from - 10, 110))} />;
  if (visual === "real_image" && scene.image && props.realImages?.[scene.image]) return <RealImage src={props.realImages[scene.image]!} local={local} />;
  if (visual === "formula" && scene.formula) {
    // Plusieurs lignes (séparées par \\\\) s'écrivent l'une après l'autre.
    const lines = scene.formula.split(/\\\\(?![a-zA-Z])/).map((l) => l.trim()).filter(Boolean);
    const slot = Math.min(46, ((to - from) * 0.7) / lines.length);
    return (
      <div className="flex h-full w-full flex-col items-center justify-center" style={{ fontSize: lines.length > 2 ? "1.2em" : "1.5em" }}>
        {lines.map((tex, i) => (
          // Linéaire : chaque caractère prend le même temps, comme une frappe régulière.
          <Formula key={i} tex={tex} color={dark ? "#F8FAFC" : "#1B2A4A"} reveal={interpolate(local, [8 + i * slot, 8 + i * slot + Math.min(44, slot * 0.9)], [0, 1], clamp)} />
        ))}
      </div>
    );
  }
  if (visual === "flowchart" && scene.steps?.length) {
    return (
      <div className="h-full w-full" style={{ color: dark ? "#FACC15" : "#1B2A4A" }}>
        <Flowchart steps={scene.steps} local={local} cues={cueFrames(scene.steps, props.words, from, to)} landscape={landscape} />
      </div>
    );
  }
  if (visual === "question") return <QuestionCard text={tiePunctuation(scene.heading)} local={local} dur={to - from} />;
  if (visual === "recap" && scene.bullets.length) {
    const bullets = scene.bullets.slice(0, 3);
    // Chaque point arrive quand la voix le dit, mais jamais trop tard : si la
    // voix garde ses points pour la fin, le tableau ne reste pas vide en attendant.
    const dur = to - from;
    const cues = cueFrames(bullets, props.words, from, to).map((at, i) => Math.min(at, Math.round(dur * (0.22 + 0.18 * i))));
    return <RecapList bullets={bullets} local={local} cues={cues} />;
  }
  if (visual === "highlight" && scene.quote) return <HighlightText text={scene.quote} keywords={scene.keywords ?? []} local={local} dur={to - from} dark={dark} />;
  if (visual === "chart" && scene.chart === "supply_demand") return <MarketChart local={local} labels={props.labels.market} dark={dark} />;
  return null;
}

/** Deux scènes voisines montrent-elles le même visuel (la même poutre) ? Alors pas de fondu entre elles. */
const sameVisual = (a: ExplainerScene | undefined, b: ExplainerScene | undefined) =>
  !!a && !!b && BEAM_VISUALS.includes(a.visual ?? "text") && BEAM_VISUALS.includes(b.visual ?? "text");

/** Une scène de texte : la feuille posée sur le tableau, qui se remplit au rythme de la voix. */
function SceneNote({ scene, scenes, local, dur, labels, index, topGap }: { scene: ExplainerScene; scenes: ExplainerScene[]; local: number; dur: number; labels: ExplainerLabels; index: number; topGap: number }) {
  const enter = progress(local, 0, 10);
  const exit = 1 - progress(local, dur - 7, dur);
  // Les points se répartissent sur les deux premiers tiers de la scène : la voix les amène.
  const slot = (dur * 0.62) / Math.max(1, scene.bullets.length + (scene.formula ? 1 : 0));
  const at = (k: number) => 10 + k * slot;
  const formulaAt = at(scene.bullets.length);
  const isSolver = scene.sourceKind === "solver";
  return (
    <div className="flex w-full flex-col gap-2" style={{ opacity: enter * exit, transform: `translateY(${(1 - enter) * 22}px)`, paddingTop: topGap }}>
      <StageChip scenes={scenes} index={index} labels={labels} opacity={1} />
      <PaperNote
        title={tiePunctuation(scene.heading)}
        tilt={index % 2 ? 0.5 : -0.5}
        highlight={isSolver}
        stamp={
          isSolver ? (
            <span style={{ display: "inline-flex", opacity: progress(local, 12, 20), transform: `scale(${2 - progress(local, 12, 22)})` }}>
              <SolverStamp label={labels.solver[0]} sublabel={labels.solver[1]} />
            </span>
          ) : undefined
        }
      >
        {scene.bullets.map((b, k) => (
          <p
            key={k}
            className="font-hand text-[22px] leading-snug"
            style={{ margin: "4px 0", clipPath: `inset(-20% ${(1 - progress(local, at(k), at(k) + 14)) * 100}% -20% 0)` }}
          >
            {b}
          </p>
        ))}
        {scene.formula && <Formula tex={scene.formula} reveal={progress(local, formulaAt, formulaAt + 26)} />}
        {!isSolver && scene.sourceTitle && (
          <p
            className="mt-2 truncate font-mono text-[11px] tracking-[0.08em] text-[color:var(--board-muted)] uppercase"
            style={{ opacity: progress(local, 6, 16) }}
          >
            {labels.source}: {scene.sourceTitle}
          </p>
        )}
      </PaperNote>
    </div>
  );
}

/** Sous-titres : des groupes de quelques mots, le mot prononcé en jaune. */
function Captions({ words, bottom }: { words: ExplainerWord[]; bottom: number }) {
  const frame = useCurrentFrame();
  const now = (frame / EXPLAINER_FPS) * 1000;
  const pages = useMemo(() => {
    const out: ExplainerWord[][] = [];
    let cur: ExplainerWord[] = [];
    let chars = 0;
    for (const w of words) {
      const gap = cur.length ? w.startMs - cur[cur.length - 1]!.endMs : 0;
      if (cur.length && (chars + w.text.length > 30 || gap > 600)) {
        out.push(cur);
        cur = [];
        chars = 0;
      }
      cur.push(w);
      chars += w.text.length + 1;
      if (/[.!?…]$/.test(w.text)) {
        out.push(cur);
        cur = [];
        chars = 0;
      }
    }
    if (cur.length) out.push(cur);
    return out;
  }, [words]);
  const page = pages.find((p, i) => now >= p[0]!.startMs && now < Math.min(p[p.length - 1]!.endMs + 350, pages[i + 1]?.[0]!.startMs ?? Infinity));
  if (!page) return null;
  const k = progress(frame, (page[0]!.startMs / 1000) * EXPLAINER_FPS, (page[0]!.startMs / 1000) * EXPLAINER_FPS + 5);
  return (
    <div style={{ position: "absolute", left: 20, right: 20, bottom, display: "flex", justifyContent: "center", pointerEvents: "none", opacity: k, transform: `translateY(${(1 - k) * 8}px)` }}>
      <p
        style={{
          margin: 0,
          padding: "9px 15px 11px",
          borderRadius: 16,
          background: "rgb(15 23 42 / 0.88)",
          border: "1px solid rgb(255 255 255 / 0.12)",
          boxShadow: "0 18px 40px -16px rgb(0 0 0 / 0.8)",
          color: "#FFFFFF",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          fontSize: 23,
          fontWeight: 800,
          lineHeight: 1.22,
          textAlign: "center",
          letterSpacing: "-0.01em",
          maxWidth: 480,
        }}
      >
        {page.map((w, i) => (
          <span key={i} style={{ color: now >= w.startMs && now < w.endMs ? "#FACC15" : now >= w.startMs ? "#FFFFFF" : "rgb(255 255 255 / 0.55)" }}>
            {i ? " " : ""}
            {w.text}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * Une scène de démonstration : le visuel occupe le tableau, le titre et deux
 * points au plus l'accompagnent. Le visuel précédent s'efface en fondu pendant
 * que le nouveau apparaît (du schéma à l'exemple réel, par exemple).
 */
function DemoScene({
  scenes,
  index,
  timings,
  frame,
  landscape,
  props,
}: {
  scenes: ExplainerScene[];
  index: number;
  timings: SceneTiming[];
  frame: number;
  landscape: boolean;
  props: VisualProps;
}) {
  const scene = scenes[index]!;
  const { from, to } = timings[index]!;
  const local = frame - from;
  const prev = scenes[index - 1];
  const continued = sameVisual(prev, scene);
  const fade = continued ? 1 : progress(local, 0, 14);
  const prevIsDemo = !!prev && (prev.visual ?? "text") !== "text";
  const textIn = progress(local, 2, 12) * (1 - progress(local, to - from - 6, to - from));
  const isSolver = scene.visual === "solver_plot";
  const isPhoto = scene.visual === "real_image";
  // Un diagramme de flux de plus de trois étapes a besoin de hauteur sur téléphone.
  const isTall = scene.visual === "flowchart" && (scene.steps?.length ?? 0) > 3;
  const isQuestion = scene.visual === "question";
  // La citation surlignée, la question et la liste cochée SONT le contenu : on n'en répète pas les points dessous.
  // Le schéma du solveur occupe toute la hauteur : des points dessous passeraient sous les sous-titres.
  const quiet = scene.visual === "highlight" || scene.visual === "flowchart" || isQuestion || scene.visual === "recap" || isSolver;
  const bullets = quiet ? [] : scene.bullets.slice(0, 2);
  const dark = isDarkStage(scene, props);
  const context = backdropUrl(props);
  const slot = ((to - from) * 0.55) / Math.max(1, bullets.length);
  return (
    <div className="flex w-full flex-col gap-3" style={{ paddingTop: landscape ? 0 : 30 }}>
      <StageChip scenes={scenes} index={index} labels={props.labels} opacity={textIn} />
      <div className="flex items-center gap-3" style={{ opacity: textIn, paddingRight: landscape ? 0 : 96, display: isQuestion ? "none" : undefined }}>
        <h2 className="font-hand font-bold" style={{ color: "#1B2A4A", fontSize: 34, lineHeight: 1, margin: 0 }}>
          {tiePunctuation(scene.heading)}
        </h2>
        {scene.sourceKind === "analogy" && (
          <span className="shrink-0 rounded-full bg-[#EAB308] px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.1em] text-[#0F172A] uppercase">{props.labels.example}</span>
        )}
      </div>

      {/* La scène du visuel : sa taille est fixe, le rendu est le même partout. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: landscape ? 232 : isSolver ? 520 : isTall || isQuestion ? 430 : 330,
          borderRadius: 18,
          // La main-feutre dépasse du cadre quand elle trace près du bord, comme une vraie main.
          overflow: BEAM_VISUALS.includes(scene.visual ?? "text") ? "visible" : "hidden",
          background: isPhoto ? "#070B14" : dark ? "linear-gradient(160deg, #0F172A, #070B14 70%)" : "rgb(255 255 255 / 0.78)",
          boxShadow: isPhoto ? "none" : "inset 0 0 0 1px rgb(27 42 74 / 0.08), 0 18px 36px -24px rgb(27 42 74 / 0.45)",
          padding: isPhoto ? 0 : 12,
        }}
      >
        {/* Le contexte : l'image de la filière (tribunal, bloc opératoire, pont…), très sombre, qui dérive lentement. */}
        {dark && context && (
          <>
            <Img src={context} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: fade, transform: `scale(${1.08 + local * 0.0006}) translateX(${-local * 0.03}px)` }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgb(7 11 20 / 0.86), rgb(7 11 20 / 0.74) 50%, rgb(7 11 20 / 0.9))" }} />
          </>
        )}
        {/* Les halos jaunes, par-dessus le fond sombre et sous le visuel. */}
        {dark && <Halos local={local} />}
        {!continued && prevIsDemo && fade < 1 && (
          <div style={{ position: "absolute", inset: isPhoto ? 0 : 12, opacity: 1 - fade }}>
            <SceneVisual scenes={scenes} index={index - 1} timings={timings} frame={timings[index - 1]!.to} landscape={landscape} props={props} />
          </div>
        )}
        <div style={{ position: "absolute", inset: isPhoto ? 0 : 12, opacity: fade }}>
          <SceneVisual scenes={scenes} index={index} timings={timings} frame={frame} landscape={landscape} props={props} />
        </div>
        {isSolver && (
          <span style={{ position: "absolute", right: 14, top: 12, display: "inline-flex", opacity: progress(local, 30, 40), transform: `scale(${2 - progress(local, 30, 42)})`, ["--board-stamp" as string]: "#1D4ED8" }}>
            <SolverStamp label={props.labels.solver[0]} sublabel={props.labels.solver[1]} />
          </span>
        )}
      </div>

      <div style={{ opacity: textIn }}>
        {bullets.map((b, k) => (
          <p key={k} className="font-hand" style={{ margin: "2px 0", fontSize: 23, lineHeight: 1.3, color: "#1B2A4A", clipPath: `inset(-20% ${(1 - progress(local, 14 + k * slot, 28 + k * slot)) * 100}% -20% 0)` }}>
            {b}
          </p>
        ))}
        {scene.sourceKind === "document" && scene.sourceTitle && (
          <p className="mt-1 truncate font-mono text-[11px] tracking-[0.08em] text-[color:var(--board-muted)] uppercase">
            {props.labels.source}: {scene.sourceTitle}
          </p>
        )}
      </div>
    </div>
  );
}

export function DynamicExplanation({ audioUrl, title, scenes, words, sceneStartsMs, backgroundImages, professor, labels, beam = null, realImages, decimalComma = true, backdrop = null }: ExplainerProps) {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const landscape = width > height;

  const starts = useMemo(() => scenes.map((_, i) => Math.round(((sceneStartsMs[i] ?? 0) / 1000) * EXPLAINER_FPS)), [scenes, sceneStartsMs]);
  let current = 0;
  starts.forEach((s, i) => {
    if (frame >= s) current = i;
  });
  const timings: SceneTiming[] = useMemo(
    () => scenes.map((_, i) => ({ from: i === 0 ? 0 : starts[i]!, to: i < scenes.length - 1 ? starts[i + 1]! : durationInFrames })),
    [scenes, starts, durationInFrames],
  );
  const scene = scenes[current];
  const { from, to } = timings[current] ?? { from: 0, to: durationInFrames };

  return (
    <AbsoluteFill style={{ background: "#070B14", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {/* Les traits d'une formule (barre de fraction, racine) apparaissent quand l'écriture les atteint. */}
      <style>{".tred-tex .frac-line, .tred-tex svg, .tred-tex .overline-line, .tred-tex .underline-line { opacity: var(--tex-rule, 1); }"}</style>
      <Backgrounds images={backgroundImages} />
      <AbsoluteFill>
        <HoersaalStage
          className="bg-transparent"
          board={
            <GlassBoard eyebrow={labels.eyebrow} title={title} status={<BoardStatus>{labels.status}</BoardStatus>}>
              {/* Une colonne à largeur fixe : le rendu est le même dans le lecteur et à l'export. */}
              <div className="flex w-full flex-col gap-5 self-start" style={{ maxWidth: landscape ? 640 : undefined }}>
                {/* Où en est l'explication : un point par scène. */}
                <div className="flex items-center gap-1.5" style={{ paddingRight: landscape ? 0 : 108 }}>
                  {scenes.map((_, i) => (
                    <span
                      key={i}
                      style={{ height: 6, flex: i === current ? 2.2 : 1, maxWidth: i === current ? 44 : 20, borderRadius: 3, background: i <= current ? "#EAB308" : "rgb(27 42 74 / 0.18)" }}
                    />
                  ))}
                </div>
                {scene && (scene.visual ?? "text") === "text" && (
                  <SceneNote key={current} scene={scene} scenes={scenes} local={frame - from} dur={to - from} labels={labels} index={current} topGap={landscape ? 0 : 34} />
                )}
                {scene && (scene.visual ?? "text") !== "text" && (
                  <DemoScene scenes={scenes} index={current} timings={timings} frame={frame} landscape={landscape} props={{ beam, realImages, decimalComma, labels, backdrop, words }} />
                )}
              </div>
            </GlassBoard>
          }
        >
          {/* Le professeur flottant, comme dans le Hörsaal. */}
          <div className="absolute right-3 z-20 flex flex-col items-center gap-2" style={{ top: landscape ? 72 : 64 }}>
            <HologramProfessor professor={professor} pose="idle" size="float" />
            <div className="flex max-w-[15rem] items-center rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)] backdrop-blur-md">
              <p className="font-display truncate text-xs font-semibold">{professor.name}</p>
            </div>
          </div>
        </HoersaalStage>
      </AbsoluteFill>
      <Captions words={words} bottom={landscape ? 26 : 96} />
      {audioUrl && <Audio src={audioUrl} />}
    </AbsoluteFill>
  );
}
