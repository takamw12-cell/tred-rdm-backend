import { useMemo } from "react";
import { Player } from "@remotion/player";
import { DEFAULT_PROFESSOR, PROFESSORS, isProfessorId } from "../../api/lib/professors";
import { useT } from "@/i18n";
import { useUserStore } from "@/stores/user";
import { backgroundsFor, categoryForProgram, portraitOf, shuffled } from "@/lib/background-sets";
import type { ExplainerVideo } from "@/lib/explainer-video";
import { DynamicExplanation, EXPLAINER_FPS, EXPLAINER_SIZE, explainerFrames, type ExplainerOrientation, type ExplainerProps } from "./dynamic-explanation";

/**
 * Le lecteur de la vidéo explicative : la composition jouée en direct par le
 * lecteur Remotion, sans MP4. Chargé à la demande (`React.lazy`) : le reste de
 * l'app ne télécharge pas Remotion.
 *
 * Vertical sur téléphone, horizontal sur ordinateur. La durée du lecteur est
 * celle de la voix (`durationMs`).
 */
export default function ExplainerPlayer({ video, orientation, autoPlay = true }: { video: ExplainerVideo; orientation: ExplainerOrientation; autoPlay?: boolean }) {
  const { t } = useT();
  const program = useUserStore((s) => s.profile.degree);
  const size = EXPLAINER_SIZE[orientation];

  // Les fonds de la filière de l'étudiant, tirés une fois par vidéo.
  const backgroundImages = useMemo(() => {
    const images = shuffled(backgroundsFor(categoryForProgram(program))).slice(0, 8);
    return orientation === "portrait" ? images.map(portraitOf) : images;
  }, [program, orientation, video.id]);

  const inputProps: ExplainerProps = useMemo(
    () => ({
      audioUrl: video.audioUrl,
      durationMs: video.durationMs,
      title: video.title,
      scenes: video.scenes,
      words: video.words,
      sceneStartsMs: video.sceneStartsMs,
      backgroundImages,
      professor: PROFESSORS[isProfessorId(video.professor) ? video.professor : DEFAULT_PROFESSOR],
      labels: {
        eyebrow: t("explainer.eyebrow"),
        status: t("explainer.status"),
        source: t("explainer.source"),
        solver: [t("explainer.solver1"), t("explainer.solver2")],
      },
    }),
    [video, backgroundImages, t],
  );

  return (
    <Player
      component={DynamicExplanation}
      inputProps={inputProps}
      durationInFrames={explainerFrames(video.durationMs)}
      fps={EXPLAINER_FPS}
      compositionWidth={size.width}
      compositionHeight={size.height}
      controls
      autoPlay={autoPlay}
      clickToPlay
      acknowledgeRemotionLicense
      style={{ width: "100%", aspectRatio: `${size.width} / ${size.height}`, borderRadius: 16, overflow: "hidden", background: "#070B14" }}
    />
  );
}
