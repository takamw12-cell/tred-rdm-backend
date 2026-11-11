import { useMemo, type ReactNode } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { NIGHT, SceneFrame, s, useImagesReady, type Enter } from "../promo/kit";
import { Outro } from "../promo/parts";
import { Captions, Soundtrack, planVoice, splitPhrases, type Cue, type VoFile } from "../promo/voice";
import { SFX, type SfxKind } from "../series/engine";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxSuccess from "../assets/sfx-success.wav";

/**
 * Le moteur de la campagne « parle comme un ami » (30 s, 2026-11-11).
 *
 * Différence avec la série de 45 s : la voix n'est PAS ré-espacée. Elle joue
 * telle qu'ElevenLabs l'a dite, avec ses respirations — c'est ce qui la rend
 * naturelle. Chaque scène s'ouvre sur une phrase (ou plusieurs : `span`), puis
 * une scène finale (montage, résultat…) occupe l'image jusqu'à l'outro.
 *
 * Minutage : voix à 0,7 s → ~11-16 s ; finale jusqu'à 25,5 s ; outro 25,5-30 s.
 */

export const CAMPAIGN_FRAMES = s(30);
const VOICE_AT = 0.7; // s
const OUTRO_AT = 25.5; // s
const LEAD = 0.3; // une scène s'ouvre juste avant sa phrase (s)

export type CampCtx = {
  /** Durée de la scène (images). */
  dur: number;
  /** Image (relative à la scène) où la voix prononce ce mot. */
  f: (word: string, nth?: number) => number;
  /** Image (relative à la scène) où commence la première phrase de la scène. */
  voiceAt: number;
};

export type CampScene = {
  name: string;
  /** Nombre de phrases couvertes par la scène (défaut 1). */
  span?: number;
  enter?: Enter;
  background?: string;
  render: (ctx: CampCtx) => ReactNode;
  cues?: (ctx: CampCtx) => { at: number; kind: SfxKind; volume?: number }[];
};

export function CampaignVideo({
  vo,
  voice,
  music,
  scenes,
  finale,
  outro,
}: {
  vo: VoFile;
  voice: string;
  music: string;
  scenes: CampScene[];
  /** Après la dernière phrase, jusqu'à l'outro. */
  finale: CampScene;
  outro: { tagline: ReactNode; sub?: string };
}) {
  useImagesReady();

  const { plan, cuts, finaleFrom } = useMemo(() => {
    const groups = splitPhrases(vo);
    const total = scenes.reduce((n, sc) => n + (sc.span ?? 1), 0);
    if (total !== groups.length) throw new Error(`${vo.id} : ${groups.length} phrases, mais les scènes en couvrent ${total}`);
    // La voix telle qu'enregistrée : chaque phrase garde son instant d'origine.
    const starts = groups.map((g) => VOICE_AT + g[0].startMs / 1000);
    const p = planVoice(vo, starts);
    const firsts: number[] = [];
    let k = 0;
    for (const sc of scenes) {
      firsts.push(k);
      k += sc.span ?? 1;
    }
    const cutFrames = firsts.map((gi, i) => (i === 0 ? 0 : s(starts[gi] - LEAD)));
    const lastEnd = VOICE_AT + groups[groups.length - 1][groups[groups.length - 1].length - 1].endMs / 1000;
    return { plan: p, cuts: cutFrames, finaleFrom: s(lastEnd + 0.35) };
  }, [vo, scenes]);

  const outroFrom = s(OUTRO_AT);
  const bounds = [
    ...cuts.map((from, i) => ({ from, to: i < cuts.length - 1 ? cuts[i + 1] : finaleFrom })),
    { from: finaleFrom, to: outroFrom },
  ];
  const all = [...scenes, finale];
  const ctxs: CampCtx[] = bounds.map(({ from, to }, i) => ({
    dur: to - from,
    f: (w, nth) => plan.frameOf(w, nth) - from,
    voiceAt: i < scenes.length ? plan.sentenceFrame(scenes.slice(0, i).reduce((n, sc) => n + (sc.span ?? 1), 0)) - from : 0,
  }));

  const sfx: Cue[] = [
    ...bounds.slice(1).map(({ from }) => ({ frame: from - 5, src: sfxWhoosh, volume: 0.26 })),
    { frame: outroFrom - 5, src: sfxWhoosh, volume: 0.3 },
    { frame: outroFrom + 10, src: sfxSuccess, volume: 0.28 },
    ...all.flatMap((sc, i) =>
      (sc.cues?.(ctxs[i]) ?? []).map((c) => ({ frame: bounds[i].from + c.at, src: SFX[c.kind], volume: c.volume ?? 0.4 })),
    ),
  ];

  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {all.map((sc, i) => (
        <Sequence key={sc.name} from={bounds[i].from} durationInFrames={bounds[i].to - bounds[i].from} name={sc.name}>
          <SceneFrame dur={bounds[i].to - bounds[i].from} enter={i === 0 ? "fade" : (sc.enter ?? "zoom")} background={sc.background}>
            {sc.render(ctxs[i])}
          </SceneFrame>
        </Sequence>
      ))}
      <Sequence from={outroFrom} name="Outro">
        <SceneFrame dur={CAMPAIGN_FRAMES - outroFrom} enter="wipe" exitFrames={0}>
          <Outro tagline={outro.tagline} taglineAt={10} sub={outro.sub} />
        </SceneFrame>
      </Sequence>
      <Captions plan={plan} hideFrom={finaleFrom} />
      <Soundtrack plan={plan} voice={voice} music={music} sfx={sfx} musicVolume={0.42} duckedVolume={0.11} />
    </AbsoluteFill>
  );
}
