import { useMemo } from "react";
import { AbsoluteFill, Audio, Composition, Loop, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig, type CalculateMetadataFunction } from "remotion";
import { FormulaNote } from "@/video/anime-explanation";
import { Captions } from "@/video/motion-explanation";
import type { ExplainerWord } from "@/video/dynamic-explanation";
import { musicGain, speechSpans } from "../../../web/src/api/lib/video-motion";

/**
 * Vidéos assemblées à partir des clips du fondateur (23 nov. 2026).
 *
 * Les clips animés viennent d'une IA vidéo externe (Luma, Runway…), déposés
 * dans packages/web/public/video-clips/<nom>/. Cette composition les enchaîne en
 * plein écran et pose par-dessus : la formule qui s'écrit (dans le coin choisi),
 * les sous-titres mot par mot, la voix ElevenLabs et la musique sous la voix.
 *
 * Les props sont fabriquées par scripts/clips.mjs (voix, instants des mots,
 * durée de chaque clip) : voir public/video-clips/README.md.
 */

export const CLIPS_FPS = 30;
const POSITIONS = ["top-left", "top-right", "bottom-left", "bottom-right", "top-center"] as const;
type Position = (typeof POSITIONS)[number];

export type ClipScene = {
  /** Adresse du clip, ou null s'il n'est pas encore déposé. */
  src: string | null;
  /** Durée du clip en secondes (0 si absent). */
  clipSeconds: number;
  formula: string;
  formulaPosition: string;
  label: string;
};

export type ClipsProps = {
  audioUrl: string;
  musicUrl?: string | null;
  durationMs: number;
  words: ExplainerWord[];
  sceneStartsMs: number[];
  scenes: ClipScene[];
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const CUT = 8;

/** Où la note de la formule se pose : le coin choisi par le fondateur, là où le personnage n'est pas. */
function noteStyle(position: string, narrow: boolean): React.CSSProperties {
  const p: Position = (POSITIONS as readonly string[]).includes(position) ? (position as Position) : "top-left";
  const side = narrow ? "6%" : "5%";
  const width = narrow ? { left: "6%", right: "6%" } : { minWidth: "30%", maxWidth: "46%" };
  if (narrow) return p.startsWith("bottom") ? { ...width, bottom: "24%" } : { ...width, top: "9%" };
  if (p === "top-center") return { ...width, top: "9%", left: "50%", marginLeft: "-17%" };
  return { ...width, ...(p.startsWith("top") ? { top: "9%" } : { bottom: "22%" }), ...(p.endsWith("left") ? { left: side } : { right: side }) };
}

function Clip({ scene, frames }: { scene: ClipScene; frames: number }) {
  if (!scene.src || scene.clipSeconds <= 0) {
    return (
      <AbsoluteFill style={{ background: "repeating-linear-gradient(135deg, #1E293B 0 40px, #172033 40px 80px)", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontFamily: "Inter, system-ui, sans-serif", fontSize: 34, fontWeight: 700 }}>
        Clip fehlt · {scene.label}
      </AbsoluteFill>
    );
  }
  const clipFrames = Math.max(1, Math.floor(scene.clipSeconds * CLIPS_FPS));
  // Clip plus long : coupé par la scène. Plus court : ralenti (jusqu'à 2 fois), puis il reprend au début.
  const rate = clipFrames >= frames ? 1 : Math.max(0.5, clipFrames / frames);
  const video = <OffthreadVideo src={scene.src} muted playbackRate={rate} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
  const played = Math.floor(clipFrames / rate);
  return <AbsoluteFill style={{ background: "#000" }}>{played >= frames ? video : <Loop durationInFrames={played}>{video}</Loop>}</AbsoluteFill>;
}

export function ClipsVideo({ audioUrl, musicUrl, durationMs, words, sceneStartsMs, scenes }: ClipsProps) {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const narrow = height > width;
  const total = Math.max(CLIPS_FPS, Math.ceil((durationMs / 1000) * CLIPS_FPS));
  const starts = useMemo(() => scenes.map((_, i) => (i === 0 ? 0 : Math.round(((sceneStartsMs[i] ?? 0) / 1000) * CLIPS_FPS))), [scenes, sceneStartsMs]);
  const spans = useMemo(() => speechSpans(words), [words]);

  return (
    <AbsoluteFill style={{ background: "#000", overflow: "hidden" }}>
      {scenes.map((scene, i) => {
        const from = starts[i]!;
        const to = starts[i + 1] ?? total;
        if (frame < from || frame >= to + CUT) return null;
        const local = frame - from;
        const frames = to - from;
        // Fondu court d'un clip à l'autre ; le clip suivant est au-dessus.
        const opacity = i === 0 ? 1 : interpolate(local, [0, CUT], [0, 1], clamp);
        const noteAt = Math.round(Math.min(frames * 0.2, CLIPS_FPS));
        const out = interpolate(local, [frames - 6, frames], [1, 0], clamp);
        return (
          <AbsoluteFill key={i} style={{ opacity }}>
            <Clip scene={scene} frames={frames + CUT} />
            {scene.formula && (
              <AbsoluteFill style={{ opacity: out }}>
                <FormulaNote tex={scene.formula} age={local - noteAt} style={noteStyle(scene.formulaPosition, narrow)} />
              </AbsoluteFill>
            )}
          </AbsoluteFill>
        );
      })}
      {/* Le bas s'assombrit un peu : les sous-titres restent lisibles sur tout clip. */}
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgb(0 0 0 / 0.5), transparent 24%)" }} />
      <Captions words={words} />
      {audioUrl && <Audio src={audioUrl} />}
      {musicUrl && <Audio src={musicUrl} loop volume={(f) => musicGain(f / CLIPS_FPS, spans, total / CLIPS_FPS)} />}
    </AbsoluteFill>
  );
}

const SAMPLE: ClipsProps = {
  audioUrl: "",
  musicUrl: null,
  durationMs: 9000,
  words: [],
  sceneStartsMs: [0, 3000, 6000],
  scenes: [
    { src: null, clipSeconds: 0, formula: "", formulaPosition: "top-left", label: "01.mp4" },
    { src: null, clipSeconds: 0, formula: "", formulaPosition: "top-left", label: "02.mp4" },
    { src: null, clipSeconds: 0, formula: String.raw`M = F \cdot l`, formulaPosition: "top-left", label: "03.mp4" },
  ],
};

const calculate: CalculateMetadataFunction<ClipsProps> = ({ props }) => ({
  durationInFrames: Math.max(CLIPS_FPS, Math.ceil((props.durationMs / 1000) * CLIPS_FPS) + 12),
  // Les adresses du fichier de props sont relatives au dossier public de l'app.
  props: { ...props, audioUrl: props.audioUrl && !/^https?:|^\//.test(props.audioUrl) ? staticFile(props.audioUrl) : props.audioUrl, musicUrl: props.musicUrl && !/^https?:|^\//.test(props.musicUrl) ? staticFile(props.musicUrl) : props.musicUrl, scenes: props.scenes.map((s) => ({ ...s, src: s.src && !/^https?:|^\//.test(s.src) ? staticFile(s.src) : s.src })) },
});

export function ClipsCompositions() {
  return (
    <>
      <Composition id="ClipsVideo" component={ClipsVideo} fps={CLIPS_FPS} width={960} height={540} durationInFrames={CLIPS_FPS} defaultProps={SAMPLE} calculateMetadata={calculate} />
      <Composition id="ClipsVideo-Portrait" component={ClipsVideo} fps={CLIPS_FPS} width={540} height={960} durationInFrames={CLIPS_FPS} defaultProps={SAMPLE} calculateMetadata={calculate} />
    </>
  );
}
