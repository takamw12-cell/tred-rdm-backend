import { useMemo, type ReactNode } from "react";
import { TransitionSeries, linearTiming, type TransitionPresentation } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { AbsoluteFill } from "remotion";
import { Soundtrack, planVoice, type Cue, type VoFile } from "../promo/voice";
import { BigCaptions } from "./captions";
import { NIGHT, s } from "./kit";
import { SLASH_FRAMES, slashCut } from "./slash";

/**
 * Le moteur des pilotes « Survive Your Klausur ».
 *
 * Une vidéo = une voix off (ElevenLabs, horodatée mot par mot), des scènes
 * calées sur elle, et des transitions de @remotion/transitions. Chaque phrase
 * de la voix est posée à l'instant voulu (`starts`, en secondes) : l'image
 * décide du rythme, la voix la suit. Les sous-titres et la bande-son se
 * déduisent du même plan.
 *
 * La transition « slash » est la signature de la campagne (slash.tsx) : la
 * scène sortante se fige, le trait orange la traverse, TRED apparaît dessous.
 */

export type SceneCtx = {
  /** Durée visible de la scène (images), hors transition de sortie. */
  dur: number;
  /** Image (relative à la scène) où la voix prononce ce mot. */
  f: (word: string, nth?: number) => number;
};

export type SurviveScene = {
  name: string;
  /** Instant (s) où la scène commence — c'est aussi le début de sa transition d'entrée. */
  at: number;
  /** Transition d'entrée : coupe douce, glissement, ou la signature de la campagne. */
  enter?: "fade" | "slide" | "slash";
  render: (ctx: SceneCtx) => ReactNode;
};

const ENTER_FRAMES = { fade: 5, slide: 7, slash: SLASH_FRAMES } as const;
type AnyPresentation = TransitionPresentation<Record<string, unknown>>;

export function SurviveVideo({
  vo,
  voice,
  music,
  starts,
  rate = 1,
  seconds,
  scenes,
  captionsY,
  captionsUntil,
  sfx,
}: {
  vo: VoFile;
  voice: string;
  music: string;
  /** Instant de départ de chaque phrase de la voix (s). */
  starts: number[];
  /** Vitesse de lecture de la voix (hauteur conservée). */
  rate?: number;
  /** Durée de la vidéo (s). */
  seconds: number;
  scenes: SurviveScene[];
  /** Centre vertical des sous-titres, selon l'image (les écrans de TRED les font descendre). */
  captionsY: (frame: number) => number;
  /** Image à partir de laquelle il n'y a plus de sous-titres (carte de fin). */
  captionsUntil?: number;
  sfx: Cue[];
}) {
  const plan = useMemo(() => planVoice(vo, starts, [], rate), [vo, starts, rate]);
  const total = s(seconds);
  const from = scenes.map((sc) => s(sc.at));

  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <TransitionSeries>
        {scenes.flatMap((sc, i) => {
          const next = scenes[i + 1];
          const visible = (next ? from[i + 1] : total) - from[i];
          // Une scène dure jusqu'au début de la suivante, plus la transition qu'elles partagent.
          const overlap = next?.enter ? ENTER_FRAMES[next.enter] : 0;
          const ctx: SceneCtx = { dur: visible, f: (w, nth) => plan.frameOf(w, nth) - from[i] };
          const presentation: AnyPresentation | null = !sc.enter
            ? null
            : sc.enter === "slash"
              ? (slashCut({ freezeFrame: from[i] - from[i - 1] }) as unknown as AnyPresentation)
              : sc.enter === "slide"
                ? (slide({ direction: "from-bottom" }) as unknown as AnyPresentation)
                : (fade() as unknown as AnyPresentation);
          return [
            ...(presentation && sc.enter ? [<TransitionSeries.Transition key={`t-${sc.name}`} presentation={presentation} timing={linearTiming({ durationInFrames: ENTER_FRAMES[sc.enter] })} />] : []),
            <TransitionSeries.Sequence key={sc.name} durationInFrames={visible + overlap} name={sc.name}>
              <AbsoluteFill style={{ background: NIGHT }}>{sc.render(ctx)}</AbsoluteFill>
            </TransitionSeries.Sequence>,
          ];
        })}
      </TransitionSeries>
      <BigCaptions plan={plan} y={captionsY} hideFrom={captionsUntil} />
      <Soundtrack plan={plan} voice={voice} music={music} sfx={sfx} musicVolume={0.17} duckedVolume={0.06} />
    </AbsoluteFill>
  );
}
