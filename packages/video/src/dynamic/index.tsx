import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { getAudioDurationInSeconds } from "@remotion/media-utils";
import { DynamicExplanation, EXPLAINER_FPS, EXPLAINER_SIZE, explainerFrames, type ExplainerProps } from "@/video/dynamic-explanation";
import { PROFESSORS } from "../../../web/src/api/lib/professors";
import { toPayload } from "../../../web/src/api/lib/beam-tool";
import { REAL_IMAGES } from "../../../web/src/api/lib/video-visuals";
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
/** Une poutre calculée par le vrai solveur, comme le serveur en fournit une. */
const BEAM = toPayload({ laenge: 4, lager: [{ x: 0, art: "festlager", name: "A" }, { x: 4, art: "loslager", name: "B" }], streckenlasten: [{ von: 0, bis: 4, q: 2 }], einheiten: { laenge: "m", kraft: "kN" } });

const REAL = Object.fromEntries(Object.entries(REAL_IMAGES).map(([key, url]) => [key, staticFile(url.replace(/^\//, ""))])) as ExplainerProps["realImages"];

const SAMPLE: ExplainerProps = {
  audioUrl: voice,
  durationMs: 0,
  title: "Biegung eines Balkens",
  words: vo.words,
  sceneStartsMs: [0, 5200, 10400, 15600, 20800, 24600],
  backgroundImages: [bg("mechanical/mechanical-u02.webp"), bg("aerospace/aerospace-u04.webp"), bg("general/bg-01.webp")],
  professor: withStaticImage(PROFESSORS.sensei),
  labels: { eyebrow: "Digitaler Hörsaal · Erklärvideo", status: "TRED erklärt …", source: "Quelle", solver: ["Berechnet", "mit dem Löser"], example: "Beispiel aus dem Alltag", sketch: "Prinzipskizze", market: ["Angebot", "Nachfrage", "Preis", "Menge"] },
  beam: BEAM,
  backdrop: "bridge",
  realImages: REAL,
  decimalComma: true,
  scenes: [
    { heading: "Der Balken", bullets: ["Zwei Lager, eine Spannweite"], formula: "", quote: "", voiceover: "", sourceTitle: "TM2_Skript.pdf", sourceKind: "document", visual: "beam", image: null },
    { heading: "Die Last drückt nach unten", bullets: ["Der Balken biegt sich durch"], formula: "", quote: "", voiceover: "", sourceTitle: "TM2_Skript.pdf", sourceKind: "document", visual: "loads", image: null },
    { heading: "Wie eine Brücke", bullets: ["Sie trägt das Gewicht der Autos"], formula: "", quote: "", voiceover: "", sourceTitle: "", sourceKind: "analogy", visual: "real_image", image: "bridge" },
    { heading: "Querkraft und Moment", bullets: [], formula: "", quote: "", voiceover: "", sourceTitle: "Solver · balkenstatik", sourceKind: "solver", visual: "solver_plot", image: null },
    { heading: "Das größte Moment", bullets: ["In der Feldmitte"], formula: String.raw`M_{max} = \frac{q\,l^2}{8}`, quote: "", voiceover: "", sourceTitle: "TM2_Skript.pdf", sourceKind: "document", visual: "formula", image: null },
    { heading: "Merksatz", bullets: ["Die Last biegt den Balken", "Das Moment ist in der Mitte am größten"], formula: "", quote: "", voiceover: "", sourceTitle: "TM2_Skript.pdf", sourceKind: "document", visual: "text", image: null },
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
