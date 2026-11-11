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
 * Les textes font 70-75 mots : la voix couvre TOUTE la vidéo. Les phrases
 * (`splitPhrases`) sont réparties régulièrement entre VOICE_AT et VOICE_END
 * (`planVoice`) : s'il reste de la marge, elle devient des respirations entre
 * les phrases ; si la parole est plus longue que la fenêtre, la voix est lue
 * un peu plus vite (`rate`, hauteur conservée). Une scène s'ouvre par phrase
 * (ou plusieurs : `span`). Les `outroSpan` dernières phrases sont dites sur
 * l'outro ; sinon l'outro tombe à OUTRO_AT, sur la fin de la dernière phrase.
 */

export const CAMPAIGN_FRAMES = s(30);
const VOICE_AT = 0.4; // s
const VOICE_END = 28.9; // s — la voix s'arrête ici, 1 s avant la fin
const OUTRO_AT = 28.0; // s — outro par défaut (sans phrase dédiée)
const MIN_GAP = 0.18; // respiration minimale entre deux phrases (s)
const MAX_GAP = 1.1; // au-delà, la voix « attendrait » (s)
const LEAD = 0.3; // une scène s'ouvre juste avant sa phrase (s)
// Avec une intro (carte logo + titre) : la voix commence après elle, et l'outro
// (logo + tred-tutor.de) dure 3,5 s. Sert aux textes courts des démonstrations.
const INTRO_S = 2.4;
const INTRO_VOICE_AT = 2.7;
const INTRO_OUTRO_AT = 26.5;
const INTRO_VOICE_END = 26.2; // la voix finit avant l'outro…
const INTRO_VOICE_END_ON_OUTRO = 28.7; // …sauf si sa dernière phrase est dite dessus

/** Répartit les phrases sur la fenêtre : instants de départ (s) et vitesse de lecture. */
export function spreadVoice(durs: number[], maxGap = MAX_GAP, from = VOICE_AT, to = VOICE_END): { starts: number[]; rate: number; end: number } {
  const window = to - from;
  const sum = durs.reduce((a, b) => a + b, 0);
  const gaps = Math.max(1, durs.length - 1);
  const rate = Math.max(1, Math.ceil(((sum + gaps * MIN_GAP) / window) * 1000) / 1000);
  const gap = Math.min(maxGap, (window - sum / rate) / gaps);
  const starts: number[] = [];
  let t = from;
  for (const d of durs) {
    starts.push(t);
    t += d / rate + gap;
  }
  return { starts, rate, end: t - gap };
}

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
  outro,
  outroSpan = 0,
  maxGap,
  intro,
}: {
  vo: VoFile;
  voice: string;
  music: string;
  scenes: CampScene[];
  /** `word` : la signature apparaît quand la voix dit ce mot (phrase dite sur l'outro). */
  outro: { tagline: ReactNode; sub?: string; word?: string };
  /** Nombre de phrases finales dites sur l'outro. */
  outroSpan?: number;
  /** Pause maximale entre deux phrases (s). Les démonstrations l'allongent : l'écran agit pendant la pause. */
  maxGap?: number;
  /** Carte d'ouverture (logo + titre) de 2,4 s avant la première scène. */
  intro?: { title: ReactNode };
}) {
  useImagesReady();

  const { plan, cuts, outroFrom, firsts } = useMemo(() => {
    const groups = splitPhrases(vo);
    const total = scenes.reduce((n, sc) => n + (sc.span ?? 1), 0) + outroSpan;
    if (total !== groups.length) throw new Error(`${vo.id} : ${groups.length} phrases, mais les scènes en couvrent ${total}`);
    const { starts, rate } = spreadVoice(
      groups.map((g) => (g[g.length - 1].endMs - g[0].startMs) / 1000),
      maxGap,
      intro ? INTRO_VOICE_AT : VOICE_AT,
      intro ? (outroSpan > 0 ? INTRO_VOICE_END_ON_OUTRO : INTRO_VOICE_END) : VOICE_END,
    );
    const p = planVoice(vo, starts, [], rate);
    const first: number[] = [];
    let k = 0;
    for (const sc of scenes) {
      first.push(k);
      k += sc.span ?? 1;
    }
    return {
      plan: p,
      firsts: first,
      cuts: first.map((gi, i) => (i === 0 ? (intro ? s(INTRO_S) : 0) : s(starts[gi] - LEAD))),
      outroFrom: outroSpan > 0 ? s(starts[groups.length - outroSpan] - LEAD) : s(intro ? INTRO_OUTRO_AT : OUTRO_AT),
    };
  }, [vo, scenes, outroSpan, maxGap, intro]);

  const bounds = cuts.map((from, i) => ({ from, to: i < cuts.length - 1 ? cuts[i + 1] : outroFrom }));
  const ctxs: CampCtx[] = bounds.map(({ from, to }, i) => ({
    dur: to - from,
    f: (w, nth) => plan.frameOf(w, nth) - from,
    voiceAt: plan.sentenceFrame(firsts[i]) - from,
  }));
  const taglineAt = outro.word ? Math.max(6, plan.frameOf(outro.word) - outroFrom - 4) : 10;

  const sfx: Cue[] = [
    ...bounds.slice(intro ? 0 : 1).map(({ from }) => ({ frame: from - 5, src: sfxWhoosh, volume: 0.22 })),
    ...(intro ? [{ frame: 8, src: sfxSuccess, volume: 0.22 }] : []),
    { frame: outroFrom - 5, src: sfxWhoosh, volume: 0.3 },
    { frame: outroFrom + taglineAt, src: sfxSuccess, volume: 0.28 },
    ...scenes.flatMap((sc, i) =>
      (sc.cues?.(ctxs[i]) ?? []).map((c) => ({ frame: bounds[i].from + c.at, src: SFX[c.kind], volume: c.volume ?? 0.4 })),
    ),
  ];

  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      {intro && (
        <Sequence durationInFrames={s(INTRO_S)} name="Intro">
          <SceneFrame dur={s(INTRO_S)} enter="fade">
            <Outro tagline={intro.title} taglineAt={8} />
          </SceneFrame>
        </Sequence>
      )}
      {scenes.map((sc, i) => (
        <Sequence key={sc.name} from={bounds[i].from} durationInFrames={bounds[i].to - bounds[i].from} name={sc.name}>
          <SceneFrame dur={bounds[i].to - bounds[i].from} enter={i === 0 ? (intro ? "wipe" : "fade") : (sc.enter ?? "zoom")} background={sc.background}>
            {sc.render(ctxs[i])}
          </SceneFrame>
        </Sequence>
      ))}
      <Sequence from={outroFrom} name="Outro">
        <SceneFrame dur={CAMPAIGN_FRAMES - outroFrom} enter="wipe" exitFrames={0}>
          <Outro tagline={outro.tagline} taglineAt={taglineAt} sub={outro.sub} />
        </SceneFrame>
      </Sequence>
      {/* Les sous-titres suivent la voix jusqu'au bout, outro compris. */}
      <Captions plan={plan} />
      <Soundtrack plan={plan} voice={voice} music={music} sfx={sfx} musicVolume={0.42} duckedVolume={0.11} />
    </AbsoluteFill>
  );
}
