import { useMemo } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Cog, FileText, Scale, Stethoscope, TrendingUp } from "lucide-react";
import { PaperNote, StepChecklist } from "@/components/hoersaal";
import { PROFESSORS } from "../../../web/src/api/lib/professors";
import { Appear, HandLine, HoersaalBoard, Tex } from "../promo/board";
import { NIGHT, SceneFrame, YELLOW, interpolateScroll, rise, s, useImagesReady, withStaticImage } from "../promo/kit";
import { Outro, SubjectTile } from "../promo/parts";
import { Captions, Soundtrack, planVoice, type Cue } from "../promo/voice";
import voFile from "../assets/vo-fr.json";
import voice from "../assets/vo-fr.mp3";
import music from "../assets/music-fr.mp3";
import sfxPop from "../assets/sfx-pop.wav";
import sfxClick from "../assets/sfx-click.wav";
import sfxSuccess from "../assets/sfx-success.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";

/**
 * Vidéo 1 (FR) — « TRED n'est pas que pour les ingénieurs » : médecine, droit, économie.
 * Chaque phrase de la voix off démarre à l'instant indiqué ; les scènes suivent.
 */
export const FR_FRAMES = s(30);
const STARTS = [1.0, 4.4, 10.6, 18.0, 25.0];
const CUT = { law: s(10.6), med: s(18.0), outro: s(25.0) };

export function FrMedizinRecht() {
  useImagesReady();
  const plan = useMemo(() => planVoice(voFile, STARTS), []);
  const f = plan.frameOf;

  const sfx: Cue[] = [
    { frame: f("ingénieurs") - 2, src: sfxPop, volume: 0.35 },
    { frame: f("médecine"), src: sfxPop, volume: 0.45 },
    { frame: f("droit"), src: sfxPop, volume: 0.45 },
    { frame: f("économie"), src: sfxPop, volume: 0.45 },
    { frame: f("filière"), src: sfxSuccess, volume: 0.4 },
    { frame: CUT.law - 8, src: sfxWhoosh, volume: 0.35 },
    { frame: f("structurer"), src: sfxClick, volume: 0.35 },
    { frame: f("documents"), src: sfxClick, volume: 0.4 },
    { frame: f("examens"), src: sfxSuccess, volume: 0.35 },
    { frame: CUT.med - 8, src: sfxWhoosh, volume: 0.35 },
    { frame: CUT.med + s(4.3), src: sfxSuccess, volume: 0.35 },
    { frame: CUT.outro - 8, src: sfxWhoosh, volume: 0.35 },
    { frame: f("université"), src: sfxSuccess, volume: 0.3 },
  ];

  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <Sequence from={0} durationInFrames={CUT.law} name="Filières">
        <Subjects at={{ med: f("médecine"), law: f("droit"), eco: f("économie"), check: f("filière") }} dur={CUT.law} />
      </Sequence>
      <Sequence from={CUT.law} durationInFrames={CUT.med - CUT.law} name="Droit — Gutachten">
        <LawBoard
          dur={CUT.med - CUT.law}
          at={{ reason: f("structurer") - CUT.law, docs: f("documents") - CUT.law, exams: f("examens") - CUT.law }}
        />
      </Sequence>
      <Sequence from={CUT.med} durationInFrames={CUT.outro - CUT.med} name="Médecine — Herzzyklus">
        <MedBoard dur={CUT.outro - CUT.med} />
      </Sequence>
      <Sequence from={CUT.outro} name="Outro">
        <SceneFrame dur={FR_FRAMES - CUT.outro} enter="wipe" exitFrames={0}>
          <Outro
            tagline={
              <>
                L'université <span className="bg-[linear-gradient(transparent_58%,#EAB30866_58%)] px-1">dans ta poche</span>.
              </>
            }
            taglineAt={f("université") - CUT.outro}
            sub="Médecine, droit, économie, ingénierie."
          />
        </SceneFrame>
      </Sequence>

      <Captions plan={plan} hideFrom={CUT.outro} />
      <Soundtrack plan={plan} voice={voice} music={music} sfx={sfx} />
    </AbsoluteFill>
  );
}

/* ── Scène 1 : les filières s'allument quand la voix les nomme ───────── */

function Subjects({ at, dur }: { at: { med: number; law: number; eco: number; check: number }; dur: number }) {
  const frame = useCurrentFrame();
  return (
    <SceneFrame dur={dur} enter="fade">
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 50% at 50% 40%, rgb(234 179 8 / 0.13), transparent 70%), ${NIGHT}`,
          alignItems: "center",
          paddingTop: 110,
          gap: 30,
        }}
      >
        <h1
          className="font-display text-center"
          style={{ ...rise(frame, 4), margin: 0, color: "#FFFFFF", fontSize: 44, lineHeight: 1.08, fontWeight: 600 }}
        >
          Ta filière.
          <br />
          <span style={{ color: YELLOW }}>Ton tuteur.</span>
        </h1>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <SubjectTile icon={<Cog size={54} />} label="Ingénierie" at={8} check={at.check} />
          <SubjectTile icon={<Stethoscope size={54} />} label="Médecine" at={at.med} check={at.check + 3} />
          <SubjectTile icon={<Scale size={54} />} label="Droit" at={at.law} check={at.check + 6} />
          <SubjectTile icon={<TrendingUp size={54} />} label="Économie" at={at.eco} check={at.check + 9} />
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
}

/* ── Scène 2 : un cas de droit pénal, au tableau, en Gutachtenstil ───── */

function LawBoard({ dur, at }: { dur: number; at: { reason: number; docs: number; exams: number } }) {
  const frame = useCurrentFrame();
  const aiko = useMemo(() => withStaticImage(PROFESSORS.examiner), []);
  const step = frame >= at.exams ? 4 : frame >= at.docs ? 3 : frame >= at.reason + 14 ? 2 : frame >= at.reason ? 1 : 0;
  const labels = ["Obersatz", "Definition", "Subsumtion", "Ergebnis"];
  return (
    <SceneFrame dur={dur} enter="zoom">
      <HoersaalBoard
        lang="fr"
        eyebrow="Digitaler Hörsaal · Strafrecht"
        title="Gutachtenstil"
        professor={aiko}
        backdrop="backgrounds/general/bg-02.webp"
        scroll={interpolateScroll(frame, at.docs + 4, at.docs + 22, 0, 150)}
      >
        <div className="w-full pr-24">
          <StepChecklist steps={labels.map((label, i) => ({ label, done: i < step }))} />
        </div>
        <PaperNote title="Fall — § 242 I StGB">
          <HandLine muted reveal={rise(frame, 4).opacity as number}>
            A nimmt das Fahrrad des B mit, um es zu behalten.
          </HandLine>
          <Appear at={at.reason}>
            <HandLine>
              <b>Obersatz:</b> A könnte sich wegen Diebstahls gem. § 242 I StGB strafbar gemacht haben.
            </HandLine>
          </Appear>
          <Appear at={at.reason + 14}>
            <HandLine>
              <b>Definition:</b> Wegnahme = Bruch fremden und Begründung neuen Gewahrsams.
            </HandLine>
          </Appear>
          <Appear at={at.docs - 6}>
            <HandLine>
              <b>Subsumtion:</b> A bricht den Gewahrsam des B und begründet eigenen. ✓
            </HandLine>
          </Appear>
          <Appear at={at.docs} className="mt-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B2A4A] px-3 py-1 text-xs font-medium text-white">
              <FileText size={13} /> Skript Strafrecht AT · S. 12
            </span>
          </Appear>
        </PaperNote>
        <Appear at={at.exams}>
          <PaperNote title="Ergebnis" tilt={0.5} highlight>
            <HandLine>A hat sich gem. § 242 I StGB strafbar gemacht.</HandLine>
          </PaperNote>
        </Appear>
      </HoersaalBoard>
    </SceneFrame>
  );
}

/* ── Scène 3 : médecine — le cycle cardiaque ─────────────────────────── */

const PHASES = [
  { n: 1, name: "Anspannung", valves: "alle Klappen zu", part: "Systole" },
  { n: 2, name: "Austreibung", valves: "Taschenklappen offen", part: "Systole" },
  { n: 3, name: "Entspannung", valves: "alle Klappen zu", part: "Diastole" },
  { n: 4, name: "Füllung", valves: "Segelklappen offen", part: "Diastole" },
];

function MedBoard({ dur }: { dur: number }) {
  const frame = useCurrentFrame();
  const haruto = useMemo(() => withStaticImage(PROFESSORS.sensei), []);
  const rowAt = (i: number) => 14 + i * 12;
  const hzvAt = s(4.3);
  return (
    <SceneFrame dur={dur} enter="slide">
      <HoersaalBoard
        lang="fr"
        eyebrow="Digitaler Hörsaal · Kardiologie"
        title="Herzzyklus"
        professor={haruto}
        backdrop="backgrounds/general/bg-01.webp"
      >
        <StepChecklist
          steps={[
            { label: "Systole", done: frame >= rowAt(2) },
            { label: "Diastole", done: frame >= hzvAt },
          ]}
        />
        <PaperNote title="Die 4 Phasen">
          <div className="flex flex-col gap-1.5">
            {PHASES.map((p, i) => (
              <Appear key={p.n} at={rowAt(i)}>
                <div className="flex items-center gap-3 border-b border-[#DCE6F2] pb-1.5">
                  <span className="font-hand w-6 text-2xl font-bold" style={{ color: YELLOW }}>
                    {p.n}
                  </span>
                  <span className="font-hand flex-1 text-[22px] font-bold">{p.name}</span>
                  <span className="font-hand text-[19px] text-[color:var(--board-muted)]">{p.valves}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                    style={{
                      background: p.part === "Systole" ? "#FEE2E2" : "#DBEAFE",
                      color: p.part === "Systole" ? "#B91C1C" : "#1D4ED8",
                    }}
                  >
                    {p.part}
                  </span>
                </div>
              </Appear>
            ))}
          </div>
        </PaperNote>
        <Appear at={hzvAt}>
          <PaperNote title="Herzzeitvolumen" tilt={0.5} highlight>
            <Tex tex={String.raw`\mathrm{HZV} = \mathrm{SV}\cdot\mathrm{HF} = 70\,\mathrm{ml}\cdot 70\,\mathrm{min^{-1}} \approx 4{,}9\,\mathrm{l/min}`} size={1.05} />
          </PaperNote>
        </Appear>
      </HoersaalBoard>
    </SceneFrame>
  );
}
