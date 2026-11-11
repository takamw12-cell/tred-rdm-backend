import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { DynamicExplanation, EXPLAINER_FPS, EXPLAINER_SIZE, explainerFrames, type ExplainerProps } from "@/video/dynamic-explanation";
import { PROFESSORS } from "../../../web/src/api/lib/professors";
import { withStaticImage } from "../promo/kit";
import vo from "../assets/vo-c3-de.json";
import voice from "../assets/vo-c3-de.mp3";

/**
 * « Als Video erklären » — la composition de l'app (packages/web/src/web/video),
 * enregistrée ici pour l'aperçu dans le Studio et un futur export MP4.
 *
 * La durée n'est écrite nulle part : `calculateMetadata` la calcule à partir
 * des props (`durationMs`, fourni par le serveur avec l'horodatage de la
 * voix) et, s'il manque, mesure le fichier audio lui-même.
 */
const TAIL_MS = 1500;

export const calculateExplainerMetadata: CalculateMetadataFunction<ExplainerProps> = async ({ props }) => {
  let durationMs = props.durationMs;
  if (!(durationMs > 0) && props.audioUrl) {
    durationMs = Math.round((await getAudioDurationInSeconds(props.audioUrl)) * 1000) + TAIL_MS;
  }
  return { durationInFrames: explainerFrames(durationMs), props: { ...props, durationMs } };
};

const bg = (name: string) => staticFile(`backgrounds/${name}`);

/**
 * Exemple pour l'aperçu : la voix d'une vidéo de campagne et trois scènes
 * d'essai. En production, tout vient de GET /api/video/:id. `durationMs: 0`
 * fait exprès de laisser la composition mesurer l'audio.
 */
const SAMPLE: ExplainerProps = {
  audioUrl: voice,
  durationMs: 0,
  title: "Balken auf zwei Lagern",
  words: vo.words,
  sceneStartsMs: [0, 9400, 19800],
  backgroundImages: [bg("mechanical/mechanical-u02.webp"), bg("aerospace/aerospace-u04.webp"), bg("general/bg-01.webp")],
  professor: withStaticImage(PROFESSORS.sensei),
  labels: { eyebrow: "Digitaler Hörsaal · Erklärvideo", status: "TRED erklärt …", source: "Quelle", solver: ["Berechnet", "mit dem Löser"] },
  scenes: [
    {
      heading: "Worum es geht",
      bullets: ["Gleichstreckenlast q über die Länge l", "Zwei Lager tragen die Last"],
      formula: "",
      quote: "tragen beide Lager die Last zu gleichen Teilen",
      voiceover: "",
      sourceTitle: "TM2_Skript.pdf",
      sourceKind: "document",
    },
    {
      heading: "Die Lagerkräfte",
      bullets: ["Beide Lager teilen sich die Last"],
      formula: String.raw`A = B = \frac{q\,l}{2}`,
      quote: "A = B = q·l/2",
      voiceover: "",
      sourceTitle: "TM2_Skript.pdf",
      sourceKind: "document",
    },
    {
      heading: "Das Ergebnis",
      bullets: ["q = 2 kN/m, l = 4 m"],
      formula: String.raw`A = B = 4\,\mathrm{kN}`,
      quote: "",
      voiceover: "",
      sourceTitle: "Solver · balkenstatik",
      sourceKind: "solver",
    },
  ],
};

export function DynamicExplanationCompositions() {
  return (
    <>
      <Composition id="DynamicExplanation" component={DynamicExplanation} fps={EXPLAINER_FPS} {...EXPLAINER_SIZE.portrait} durationInFrames={EXPLAINER_FPS} defaultProps={SAMPLE} calculateMetadata={calculateExplainerMetadata} />
      <Composition id="DynamicExplanation-Landscape" component={DynamicExplanation} fps={EXPLAINER_FPS} {...EXPLAINER_SIZE.landscape} durationInFrames={EXPLAINER_FPS} defaultProps={SAMPLE} calculateMetadata={calculateExplainerMetadata} />
    </>
  );
}
