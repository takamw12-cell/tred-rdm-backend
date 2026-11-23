import { Composition, staticFile, type CalculateMetadataFunction } from "remotion";
import { AnimeExplanation, ANIME_FPS, type AnimeProps } from "@/video/anime-explanation";
import { EXPLAINER_SIZE, explainerFrames } from "@/video/dynamic-explanation";

/**
 * « Als Video erklären » en style anime — la composition de l'app
 * (packages/web/src/web/video/anime-explanation.tsx), enregistrée ici pour
 * l'aperçu dans le Studio et l'export MP4 :
 *
 *   remotion render src/index.ts AnimeExplanation out/anime.mp4 --props=video.json --scale=2
 *
 * `video.json` : ce que rend GET /api/video/:id (scenes avec `anime.image`,
 * words, sceneStartsMs, durationMs) plus `audioUrl`. Les poses du professeur,
 * la police manuscrite et la musique viennent du dossier public de l'app.
 */
const sprites = { idle: staticFile("avatars/video/mentor-idle.webp"), talk: staticFile("avatars/video/mentor-talk.webp"), point: staticFile("avatars/video/mentor-point.webp"), pointTalk: staticFile("avatars/video/mentor-point-talk.webp"), hold: staticFile("avatars/video/mentor-hold.webp"), holdTalk: staticFile("avatars/video/mentor-hold-talk.webp") };
const toolImages = { wrench: staticFile("video-props/wrench.webp"), plank: staticFile("video-props/plank.webp"), rock: staticFile("video-props/rock.webp"), wedge: staticFile("video-props/wedge.webp") };
const music = staticFile("audio/video-focus.mp3");

const calculate: CalculateMetadataFunction<AnimeProps> = ({ props }) => ({
  durationInFrames: explainerFrames(props.durationMs),
  props: { ...props, sprites: props.sprites ?? sprites, props: props.props ?? toolImages, handFontUrl: props.handFontUrl ?? staticFile("fonts/caveat-latin.woff2"), musicUrl: props.musicUrl === null ? null : (props.musicUrl ?? music) },
});

const scene = (heading: string, anime: NonNullable<AnimeProps["scenes"][number]["anime"]>, formula = ""): AnimeProps["scenes"][number] => ({ stage: "step", heading, bullets: [], formula, quote: "", voiceover: "", sourceTitle: "TM1_Skript.pdf", sourceKind: "document", anime });

/** Sans props : trois scènes d'essai, sans image (le fond de secours) ni voix. */
const SAMPLE: AnimeProps = {
  audioUrl: "",
  musicUrl: music,
  durationMs: 18_000,
  title: "Das Hebelgesetz",
  scenes: [
    scene("Die Frage", { decor: "parc", action: "zoom_sur_prof", focus: "center", prompt: "", bubble: "Warum hebt ein Kind einen Felsen?" }),
    scene("Der Hebel", { decor: "parc", action: "use_tool", tool: "lever", focus: "left", prompt: "", bubble: "" }),
    scene("Das Moment", { decor: "atelier", action: "formule_s_ecrit", focus: "center", prompt: "", bubble: "" }, String.raw`M = F \cdot l`),
  ],
  words: [],
  sceneStartsMs: [0, 6000, 12_000],
  sprites,
  props: toolImages,
  handFontUrl: staticFile("fonts/caveat-latin.woff2"),
};

export function AnimeExplanationCompositions() {
  return (
    <>
      <Composition id="AnimeExplanation" component={AnimeExplanation} fps={ANIME_FPS} {...EXPLAINER_SIZE.landscape} durationInFrames={ANIME_FPS} defaultProps={SAMPLE} calculateMetadata={calculate} />
      <Composition id="AnimeExplanation-Portrait" component={AnimeExplanation} fps={ANIME_FPS} {...EXPLAINER_SIZE.portrait} durationInFrames={ANIME_FPS} defaultProps={SAMPLE} calculateMetadata={calculate} />
    </>
  );
}
