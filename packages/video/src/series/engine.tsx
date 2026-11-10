import { useMemo, type ReactNode } from "react";
import { AbsoluteFill, Sequence } from "remotion";
import { NIGHT, SceneFrame, s, useImagesReady, type Enter } from "../promo/kit";
import { Outro } from "../promo/parts";
import { Captions, Soundtrack, planVoice, splitPhrases, type Cue, type VoFile } from "../promo/voice";
import sfxPop from "../assets/sfx-pop.wav";
import sfxClick from "../assets/sfx-click.wav";
import sfxSuccess from "../assets/sfx-success.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxType from "../assets/sfx-type.wav";

/**
 * Le moteur de la série « université universelle » (45 s).
 *
 * La voix off est découpée en segments (phrases, et virgules choisies) ; chaque
 * segment ouvre une scène. Les segments sont répartis régulièrement sur la
 * vidéo : la voix respire, et entre deux segments l'image continue de
 * travailler (le tableau s'écrit, les courbes se tracent) pendant que la
 * musique remonte. Le dernier segment (la signature) tombe sur l'outro.
 */

export const SERIES_FRAMES = s(45);
const FIRST = 1.0; // début de la première phrase (s)
const LAST_MID_END = 36.0; // fin de la dernière phrase avant l'outro (s)
const OUTRO_AT = 38.6; // la signature (s)
const LEAD = 0.45; // une scène commence un peu avant sa phrase (s)

export const SFX = { pop: sfxPop, click: sfxClick, success: sfxSuccess, whoosh: sfxWhoosh, type: sfxType };
export type SfxKind = keyof typeof SFX;

export type SceneCtx = {
  /** Durée de la scène (images). */
  dur: number;
  /** Image (relative à la scène) où la voix prononce ce mot. */
  f: (word: string, nth?: number) => number;
  /** Image (relative à la scène) où commence le segment de voix de la scène. */
  voiceAt: number;
};

export type SceneDef = {
  name: string;
  enter?: Enter;
  background?: string;
  render: (ctx: SceneCtx) => ReactNode;
  /** Effets sonores (images relatives à la scène). */
  cues?: (ctx: SceneCtx) => { at: number; kind: SfxKind; volume?: number }[];
};

export function SeriesVideo({
  vo,
  voice,
  music,
  breaks = [],
  scenes,
  outro,
  signatureInVoice = true,
}: {
  vo: VoFile;
  voice: string;
  music: string;
  breaks?: string[];
  /** Une scène par segment de voix (hors signature). */
  scenes: SceneDef[];
  outro: { tagline: ReactNode; sub?: string; word?: string };
  /** Le dernier segment de la voix est la signature (« TRED: … »), dite sur l'outro. */
  signatureInVoice?: boolean;
}) {
  useImagesReady();

  const { plan, cuts, outroFrom } = useMemo(() => {
    const groups = splitPhrases(vo, breaks);
    const durs = groups.map((g) => (g[g.length - 1].endMs - g[0].startMs) / 1000);
    const mid = signatureInVoice ? durs.slice(0, -1) : durs;
    if (mid.length !== scenes.length) {
      throw new Error(`${vo.id} : ${mid.length} segments de voix, mais ${scenes.length} scènes`);
    }
    const gap = mid.length > 1 ? (LAST_MID_END - FIRST - mid.reduce((a, b) => a + b, 0)) / (mid.length - 1) : 0;
    const starts: number[] = [];
    let t = FIRST;
    for (const d of mid) {
      starts.push(t);
      t += d + gap;
    }
    if (signatureInVoice) starts.push(OUTRO_AT);
    const p = planVoice(vo, starts, breaks);
    const cutFrames = starts.slice(0, mid.length).map((st, i) => (i === 0 ? 0 : s(st - LEAD)));
    return { plan: p, cuts: cutFrames, outroFrom: s(OUTRO_AT - LEAD - 0.6) };
  }, [vo, breaks, scenes.length, signatureInVoice]);

  const bounds = cuts.map((from, i) => ({ from, to: i < cuts.length - 1 ? cuts[i + 1] : outroFrom }));
  const ctxs: SceneCtx[] = bounds.map(({ from, to }, i) => ({
    dur: to - from,
    f: (w, nth) => plan.frameOf(w, nth) - from,
    voiceAt: plan.sentenceFrame(i) - from,
  }));

  const sfx: Cue[] = [
    ...bounds.slice(1).map(({ from }) => ({ frame: from - 6, src: sfxWhoosh, volume: 0.3 })),
    { frame: outroFrom - 6, src: sfxWhoosh, volume: 0.32 },
    ...scenes.flatMap((sc, i) =>
      (sc.cues?.(ctxs[i]) ?? []).map((c) => ({ frame: bounds[i].from + c.at, src: SFX[c.kind], volume: c.volume ?? 0.4 })),
    ),
  ];
  const taglineAt = outro.word ? plan.frameOf(outro.word) - outroFrom : 14;
  sfx.push({ frame: outroFrom + taglineAt, src: sfxSuccess, volume: 0.3 });

  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {scenes.map((sc, i) => (
        <Sequence key={sc.name} from={bounds[i].from} durationInFrames={bounds[i].to - bounds[i].from} name={sc.name}>
          <SceneFrame dur={bounds[i].to - bounds[i].from} enter={i === 0 ? "fade" : (sc.enter ?? "zoom")} background={sc.background}>
            {sc.render(ctxs[i])}
          </SceneFrame>
        </Sequence>
      ))}
      <Sequence from={outroFrom} name="Outro">
        <SceneFrame dur={SERIES_FRAMES - outroFrom} enter="wipe" exitFrames={0}>
          <Outro tagline={outro.tagline} taglineAt={taglineAt} sub={outro.sub} />
        </SceneFrame>
      </Sequence>
      <Captions plan={plan} hideFrom={outroFrom} />
      <Soundtrack plan={plan} voice={voice} music={music} sfx={sfx} />
    </AbsoluteFill>
  );
}
