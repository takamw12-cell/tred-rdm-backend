import { useMemo } from "react";
import katex from "katex";
import { AbsoluteFill, Audio, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { BoardStatus, GlassBoard, PaperNote, SolverStamp } from "@/components/hoersaal";
import { HoersaalStage } from "@/components/hoersaal-stage";
import { HologramProfessor } from "@/components/hologram-professor";
import type { Professor } from "../../api/lib/professors";

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
 * ── Rien n'est inventé à l'écran ──────────────────────────────────────────
 * La composition n'affiche que ce que le serveur a validé : le texte des
 * scènes, la formule (KaTeX), et la source de chacune — le document cité, ou
 * le tampon du solveur.
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
  sourceKind: "document" | "solver";
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

/** Une formule KaTeX qui « s'écrit » de gauche à droite. Une formule illisible n'est pas affichée. */
function Formula({ tex, reveal }: { tex: string; reveal: number }) {
  const html = useMemo(() => {
    try {
      return katex.renderToString(tex, { displayMode: true, throwOnError: true });
    } catch {
      return null;
    }
  }, [tex]);
  if (!html) return null;
  return (
    <div
      className="[&_.katex-display]:my-1.5"
      style={{ clipPath: `inset(-10% ${(1 - reveal) * 100}% -10% 0)`, fontSize: "1.15em" }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Une scène : la feuille posée sur le tableau, qui se remplit au rythme de la voix. */
function SceneNote({ scene, local, dur, labels, index, topGap }: { scene: ExplainerScene; local: number; dur: number; labels: ExplainerLabels; index: number; topGap: number }) {
  const enter = progress(local, 0, 10);
  const exit = 1 - progress(local, dur - 7, dur);
  // Les points se répartissent sur les deux premiers tiers de la scène : la voix les amène.
  const slot = (dur * 0.62) / Math.max(1, scene.bullets.length + (scene.formula ? 1 : 0));
  const at = (k: number) => 10 + k * slot;
  const formulaAt = at(scene.bullets.length);
  const isSolver = scene.sourceKind === "solver";
  return (
    <div className="w-full" style={{ opacity: enter * exit, transform: `translateY(${(1 - enter) * 22}px)`, paddingTop: topGap }}>
      <PaperNote
        title={scene.heading}
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

export function DynamicExplanation({ audioUrl, title, scenes, words, sceneStartsMs, backgroundImages, professor, labels }: ExplainerProps) {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const landscape = width > height;

  const starts = useMemo(() => scenes.map((_, i) => Math.round(((sceneStartsMs[i] ?? 0) / 1000) * EXPLAINER_FPS)), [scenes, sceneStartsMs]);
  let current = 0;
  starts.forEach((s, i) => {
    if (frame >= s) current = i;
  });
  const scene = scenes[current];
  const from = current === 0 ? 0 : starts[current]!;
  const to = current < scenes.length - 1 ? starts[current + 1]! : durationInFrames;

  return (
    <AbsoluteFill style={{ background: "#070B14", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
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
                {scene && <SceneNote key={current} scene={scene} local={frame - from} dur={to - from} labels={labels} index={current} topGap={landscape ? 0 : 34} />}
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
