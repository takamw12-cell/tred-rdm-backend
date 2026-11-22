import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { MotionExplanation, MOTION_FPS, type MotionProps } from "@/video/motion-explanation";
import { EXPLAINER_SIZE, explainerFrames } from "@/video/dynamic-explanation";
import { defaultMotion } from "../../../web/src/api/lib/video-motion";

/** La boucle de fond : le fichier public de l'app (packages/web/public/audio). */
const music = staticFile("audio/video-focus.mp3");

/**
 * « Als Video erklären » en motion design — la composition de l'app
 * (packages/web/src/web/video/motion-explanation.tsx), enregistrée ici pour
 * l'aperçu dans le Studio et l'export MP4 :
 *
 *   remotion render src/index.ts MotionExplanation out/motion.mp4 --props=video.json --scale=2
 *
 * `video.json` : ce que rend GET /api/video/:id (scenes, words, sceneStartsMs,
 * durationMs) plus `audioUrl`. Sans props : trois scènes d'essai, sans voix.
 */
const calculate: CalculateMetadataFunction<MotionProps> = ({ props }) => ({ durationInFrames: explainerFrames(props.durationMs), props: { ...props, musicUrl: props.musicUrl === null ? null : (props.musicUrl ?? music) } });

const scene = (stage: "hook" | "step" | "recap", heading: string, extra: Partial<MotionProps["scenes"][number]> = {}): MotionProps["scenes"][number] => ({ stage, heading, bullets: [], formula: "", quote: "", voiceover: "", sourceTitle: "TM1_Skript.pdf", sourceKind: stage === "hook" ? "analogy" : "document", ...extra });

const SAMPLE_SCENES: MotionProps["scenes"] = [
  scene("hook", "Warum löst ein langer Schlüssel die Mutter leichter?", { visual: "question" }),
  {
    ...scene("step", "Das Moment einer Kraft"),
    motion: {
      transition: "wipe",
      blocks: [
        { id: "hebel", type: "lever", text: "", icon: "", tex: "", items: ["kleine Kraft", "große Last"], values: [4, 1], curve: "", color: "blue" },
        { id: "moment", type: "formula", text: "", icon: "", tex: String.raw`M = F \cdot l`, items: [], values: [], curve: "", color: "white" },
        { id: "kurve", type: "chart", text: "", icon: "", tex: "", items: ["Hebelarm", "Moment"], values: [], curve: "proportional", color: "yellow" },
      ],
      actions: [
        { action: "popIn", element: "hebel", word: "", target: "", text: "", angle: 0, color: "yellow" },
        { action: "rotate", element: "hebel", word: "", target: "", text: "", angle: -10, color: "yellow" },
        { action: "write", element: "moment", word: "", target: "", text: "", angle: 0, color: "yellow" },
        { action: "annotate", element: "moment", word: "", target: "F", text: "Kraft", angle: 0, color: "blue" },
        { action: "annotate", element: "moment", word: "", target: "l", text: "Hebelarm", angle: 0, color: "yellow" },
        { action: "pointTo", element: "hebel", word: "", target: "moment", text: "", angle: 0, color: "yellow" },
        { action: "slideLeft", element: "kurve", word: "", target: "", text: "", angle: 0, color: "yellow" },
        { action: "highlight", element: "moment", word: "", target: "", text: "", angle: 0, color: "yellow" },
      ],
    },
  },
  scene("recap", "Merke", { visual: "recap", bullets: ["Moment gleich Kraft mal Hebelarm", "Längerer Hebelarm, kleinere Kraft"] }),
];

const SAMPLE: MotionProps = {
  audioUrl: "",
  musicUrl: music,
  durationMs: 24_000,
  title: "Das Hebelgesetz",
  scenes: SAMPLE_SCENES.map((s, i) => ({ ...s, motion: s.motion ?? defaultMotion({ heading: s.heading, bullets: s.bullets, formula: s.formula, steps: s.steps, visual: s.visual, stage: s.stage }, i) })),
  words: [],
  sceneStartsMs: [0, 5000, 18_000],
  labels: { source: "Quelle", example: "Beispiel aus dem Alltag", solver: "Berechnet mit dem Löser", stages: { hook: "Die Frage", step: "Schritt", example: "Beispiel", recap: "Merke" } },
  decimalComma: true,
};

export function MotionExplanationCompositions() {
  return (
    <>
      <Composition id="MotionExplanation" component={MotionExplanation} fps={MOTION_FPS} {...EXPLAINER_SIZE.landscape} durationInFrames={MOTION_FPS} defaultProps={SAMPLE} calculateMetadata={calculate} />
      <Composition id="MotionExplanation-Portrait" component={MotionExplanation} fps={MOTION_FPS} {...EXPLAINER_SIZE.portrait} durationInFrames={MOTION_FPS} defaultProps={SAMPLE} calculateMetadata={calculate} />
    </>
  );
}
