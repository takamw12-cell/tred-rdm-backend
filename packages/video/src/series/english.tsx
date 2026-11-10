import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Atom, Cog, FlaskConical, Flame, Layers, Scale, Stethoscope, TrendingUp, Zap } from "lucide-react";
import { PaperNote, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { PROFESSORS, PROFESSOR_IDS } from "../../../web/src/api/lib/professors";
import { solveNPV } from "../../../web/src/api/lib/solvers/finance-solver";
import { Appear, HandLine, HoersaalBoard, Tex } from "../promo/board";
import { NIGHT, YELLOW, interpolateScroll, pop, progress, rise, withStaticImage } from "../promo/kit";
import { ProfGrid } from "../promo/parts";
import { SeriesVideo, type SceneDef } from "./engine";
import { ChipCloud, CirculationDiagram, DocStack, ExamChoices, ProfCarousel, SplitPanels, StylePicker, SupplyDemand, ToolGrid } from "./scenes";
import vo1 from "../assets/vo-en1.json";
import vo2 from "../assets/vo-en2.json";
import vo3 from "../assets/vo-en3.json";
import voice1 from "../assets/vo-en1.mp3";
import voice2 from "../assets/vo-en2.mp3";
import voice3 from "../assets/vo-en3.mp3";
import music1 from "../assets/music-en1.mp3";
import music2 from "../assets/music-en2.mp3";
import music3 from "../assets/music-en3.mp3";

const prof = (id: keyof typeof PROFESSORS) => withStaticImage(PROFESSORS[id]);
const mark = (t: string) => <span className="bg-[linear-gradient(transparent_58%,#EAB30866_58%)] px-1">{t}</span>;

/* ═══ EN 1 — Beyond Engineering (médecine & droit) ═════════════════════ */

function BigStatement({ at, children }: { at: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const k = pop(frame, 4);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 26, background: `radial-gradient(ellipse 70% 45% at 50% 45%, rgb(234 179 8 / 0.18), transparent 70%), ${NIGHT}` }}>
      <div style={{ transform: `scale(${k}) rotate(${frame * 1.5}deg)`, color: YELLOW }}>
        <Cog size={120} strokeWidth={1.4} />
      </div>
      <h1 className="font-display text-center" style={{ ...rise(frame, at), margin: 0, color: "#FFFFFF", fontSize: 50, lineHeight: 1.05, fontWeight: 600, padding: "0 30px" }}>
        {children}
      </h1>
    </AbsoluteFill>
  );
}

const EN1_SCENES: SceneDef[] = [
  {
    name: "Not just engineers",
    render: ({ f }) => (
      <BigStatement at={f("just") - 2}>
        Not just <span style={{ color: YELLOW }}>engineering.</span>
      </BigStatement>
    ),
  },
  {
    name: "Your field",
    render: ({ f }) => (
      <ChipCloud
        title={<>Your field. {mark("Your tutor.")}</>}
        chips={[
          { label: "Medicine", at: f("medicine"), strong: true, icon: <Stethoscope size={20} /> },
          { label: "Law", at: f("law"), strong: true, icon: <Scale size={20} /> },
          { label: "Economics", at: f("economics"), strong: true, icon: <TrendingUp size={20} /> },
          ...["Cardiology", "Neurology", "Surgery", "Criminal law", "Corporate law", "International law", "Psychology", "Biology", "Philosophy", "History", "Languages", "Aerospace"].map(
            (label, i) => ({ label, at: f("adapts") + i * 3 }),
          ),
        ]}
      />
    ),
    cues: ({ f }) => [
      { at: f("medicine"), kind: "pop" },
      { at: f("law"), kind: "pop" },
      { at: f("economics"), kind: "pop" },
      { at: f("field"), kind: "success", volume: 0.3 },
    ],
  },
  {
    name: "Law — case method",
    render: ({ f, voiceAt }) => <LawCaseEN at={{ start: voiceAt, reason: f("structure") }} />,
    cues: ({ f }) => [{ at: f("structure"), kind: "click" }],
  },
  {
    name: "Medicine — circulation & exam",
    render: ({ f, voiceAt }) => <MedicineEN at={{ start: voiceAt, docs: f("documents"), exams: f("exams") }} />,
    cues: ({ f }) => [
      { at: f("documents"), kind: "click" },
      { at: f("exams") + 10, kind: "success", volume: 0.35 },
    ],
  },
  {
    name: "Every subject",
    render: ({ f }) => <ProfGrid profs={PROFESSOR_IDS.map((id) => prof(id))} lang="en" title="Every subject. Your professor." chosen="examiner" chooseAt={f("accessible")} />,
    cues: ({ f }) => [{ at: f("accessible"), kind: "click" }],
  },
];

function LawCaseEN({ at }: { at: { start: number; reason: number } }) {
  const frame = useCurrentFrame();
  const r = at.reason;
  const step = frame >= r + 70 ? 4 : frame >= r + 46 ? 3 : frame >= r + 22 ? 2 : frame >= r ? 1 : 0;
  return (
    <HoersaalBoard lang="en" eyebrow="Digitaler Hörsaal · Contract law" title="Case method" professor={prof("examiner")} backdrop="backgrounds/general/bg-02.webp">
      <div className="w-full pr-24">
        <StepChecklist steps={["Claim", "Requirement", "Application", "Result"].map((label, i) => ({ label, done: i < step }))} />
      </div>
      <PaperNote title="Case — § 433 (1) BGB">
        <HandLine muted reveal={progress(frame, 2, 16)}>K agrees to buy V's bike for €200. V refuses to deliver.</HandLine>
        <Appear at={r}>
          <HandLine><b>Claim:</b> K may demand delivery under § 433 (1) 1 BGB.</HandLine>
        </Appear>
        <Appear at={r + 22}>
          <HandLine><b>Requirement:</b> a valid purchase contract = offer + acceptance (§§ 145 ff. BGB).</HandLine>
        </Appear>
        <Appear at={r + 46}>
          <HandLine><b>Application:</b> V offered, K accepted. ✓</HandLine>
        </Appear>
      </PaperNote>
      <Appear at={r + 70}>
        <PaperNote title="Result" tilt={0.5} highlight>
          <HandLine>K's claim for delivery exists.</HandLine>
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

function MedicineEN({ at }: { at: { start: number; docs: number; exams: number } }) {
  const frame = useCurrentFrame();
  return (
    <HoersaalBoard
      lang="en"
      eyebrow="Digitaler Hörsaal · Cardiology"
      title="Blood circulation"
      professor={prof("sensei")}
      backdrop="backgrounds/general/bg-01.webp"
      scroll={interpolateScroll(frame, at.exams - 14, at.exams + 4, 0, 330)}
    >
      <PaperNote title="Pulmonary & systemic circuit">
        <CirculationDiagram
          draw={progress(frame, 0, at.exams - 16)}
          labels={{ ra: "Right atrium", rv: "Right ventricle", lungs: "Lungs", la: "Left atrium", lv: "Left ventricle", body: "Body", tricuspid: "tricuspid", pulmonary: "pulmonary valve", mitral: "mitral", aortic: "aortic valve" }}
        />
        <Appear at={at.docs}>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1B2A4A] px-3 py-1 text-xs font-medium text-white">📄 Physiology lecture notes · p. 34</span>
        </Appear>
      </PaperNote>
      <Appear at={at.exams - 10}>
        <PaperNote title="Exam question" tilt={0.5} highlight>
          <HandLine>Which valve closes at the start of systole (left heart)?</HandLine>
          <ExamChoices options={["Aortic valve", "Mitral valve", "Pulmonary vein"]} correct={1} answerAt={at.exams + 10} />
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

export function EnBeyondEngineering() {
  return (
    <SeriesVideo
      vo={vo1}
      voice={voice1}
      music={music1}
      breaks={["reasoning,"]}
      scenes={EN1_SCENES}
      outro={{ tagline: <>The university {mark("in your pocket")}.</>, sub: "Medicine · Law · Economics · Engineering", word: "university" }}
    />
  );
}

/* ═══ EN 2 — The Universal Tutor ═══════════════════════════════════════ */

const EN2_SCENES: SceneDef[] = [
  {
    name: "Medicine & law",
    render: ({ f }) => (
      <SplitPanels
        panels={[
          { at: f("medical"), icon: <Stethoscope size={44} />, label: "Medical diagnoses", tint: "linear-gradient(160deg,#7F1D1D,#0F172A)" },
          { at: f("legal"), icon: <Scale size={44} />, label: "Legal arguments", tint: "linear-gradient(160deg,#1E3A8A,#0F172A)" },
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("medical"), kind: "pop" }, { at: f("legal"), kind: "pop" }],
  },
  {
    name: "Finance & engineering",
    render: ({ f }) => (
      <SplitPanels
        panels={[
          { at: f("financial"), icon: <TrendingUp size={44} />, label: "Financial analysis", tint: "linear-gradient(160deg,#064E3B,#0F172A)" },
          { at: f("mechanical"), icon: <Cog size={44} />, label: "Mechanical engineering", img: "backgrounds/mechanical/mechanical-01.webp" },
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("financial"), kind: "pop" }, { at: f("mechanical"), kind: "pop" }],
  },
  {
    name: "Universal tutor — professors",
    render: ({ voiceAt, dur }) => {
      const step = Math.max(18, Math.floor((dur - voiceAt) / 4));
      return (
        <ProfCarousel
          title={<>The {mark("universal")} tutor.</>}
          items={[
            { prof: prof("genius"), subject: "Physics", at: 0 },
            { prof: prof("sensei"), subject: "Economics", at: voiceAt + step },
            { prof: prof("maverick"), subject: "Engineering", at: voiceAt + 2 * step },
            { prof: prof("examiner"), subject: "Medicine", at: voiceAt + 3 * step },
          ]}
        />
      );
    },
    cues: ({ voiceAt, dur }) => {
      const step = Math.max(18, Math.floor((dur - voiceAt) / 4));
      return [1, 2, 3].map((i) => ({ at: voiceAt + i * step, kind: "pop" as const, volume: 0.35 }));
    },
  },
  {
    name: "Upload documents",
    render: ({ f }) => (
      <DocStack
        title={<>Your own {mark("documents")}.</>}
        doneLabel="Uploaded"
        docs={[
          { name: "Anatomy_Lecture_3.pdf", meta: "PDF · Medicine", at: f("Upload") },
          { name: "Contract_Law_Notes.pdf", meta: "PDF · Law", at: f("Upload") + 16 },
          { name: "Corporate_Finance.pdf", meta: "PDF · Economics", at: f("Upload") + 32 },
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("Upload") + 30, kind: "success", volume: 0.25 }, { at: f("Upload") + 62, kind: "success", volume: 0.25 }],
  },
  {
    name: "Choose professor",
    enter: "slide",
    render: ({ f }) => <ProfGrid profs={PROFESSOR_IDS.map((id) => prof(id))} lang="en" title="Choose your professor." chosen="maverick" chooseAt={f("professor")} />,
    cues: ({ f }) => [{ at: f("professor"), kind: "click" }],
  },
  {
    name: "Exact solvers",
    render: ({ f, voiceAt }) => <ExactSolversEN at={{ start: voiceAt, solvers: f("deterministic") }} />,
    cues: ({ f }) => [{ at: f("deterministic"), kind: "success", volume: 0.45 }],
  },
];

function ExactSolversEN({ at }: { at: { start: number; solvers: number } }) {
  const frame = useCurrentFrame();
  const npv = useMemo(() => solveNPV([-1000, 400, 400, 400], 0.08), []);
  const stamp = (k: number) => (
    <span style={{ opacity: Math.min(1, k * 1.5), transform: `scale(${2.2 - 1.2 * k})`, display: "inline-flex" }}>
      <SolverStamp label="Computed" sublabel="by the solver" />
    </span>
  );
  const notes = [
    { title: "Finance — net present value", tex: String.raw`C_0 = -1000 + \sum_{t=1}^{3}\frac{400}{1.08^{t}} = ${npv.kapitalwert.toFixed(2)}\ \text{€}` },
    { title: "Mechanics — support force", tex: String.raw`B = \tfrac{3}{8}\,q\,l = 3\,\mathrm{kN}` },
    { title: "Circuits — branch current", tex: String.raw`I_1 = \frac{12\,\mathrm{V}}{2\,\Omega + 2\,\Omega} = 3\,\mathrm{A}` },
  ];
  return (
    <HoersaalBoard lang="en" eyebrow="Digitaler Hörsaal · Any subject" title="Exact results" professor={prof("maverick")} writing={false} backdrop="backgrounds/general/bg-05.webp">
      {notes.map((n, i) => {
        const appear = at.start + i * 14;
        return (
          <Appear key={n.title} at={appear}>
            <PaperNote title={n.title} tilt={i % 2 ? 0.4 : -0.4} highlight={frame >= at.solvers} stamp={stamp(pop(frame, at.solvers + i * 5))}>
              <Tex tex={n.tex} reveal={progress(frame, appear + 4, appear + 18)} size={0.95} />
            </PaperNote>
          </Appear>
        );
      })}
    </HoersaalBoard>
  );
}

export function EnUniversalTutor() {
  return (
    <SeriesVideo
      vo={vo2}
      voice={voice2}
      music={music2}
      breaks={["arguments,", "documents,", "professor,"]}
      scenes={EN2_SCENES}
      outro={{ tagline: <>Learn anything, {mark("anywhere")}.</>, sub: "One tutor for every degree.", word: "anything" }}
    />
  );
}

/* ═══ EN 3 — The Future of Learning ════════════════════════════════════ */

const EN3_SCENES: SceneDef[] = [
  {
    name: "Welcome",
    render: ({ f }) => <WelcomeBoard at={f("future")} />,
  },
  {
    name: "Your learning style",
    enter: "wipe",
    render: ({ f }) => <StylePicker lang="en" highlights={[{ style: "balanced", at: f("style") }]} />,
    cues: ({ f }) => [{ at: f("style"), kind: "click" }],
  },
  {
    name: "Visual, auditory, interactive",
    enter: "fade",
    render: ({ f, dur }) => (
      <StylePicker
        lang="en"
        highlights={[
          { style: "visual", at: f("visual") },
          { style: "auditory", at: f("auditory") },
          { style: "interactive", at: f("interactive") },
        ]}
        chosen={{ style: "interactive", at: Math.min(dur - 20, f("interactive") + 24) }}
      />
    ),
    cues: ({ f, dur }) => [
      { at: f("visual"), kind: "click" },
      { at: f("auditory"), kind: "click" },
      { at: f("interactive"), kind: "click" },
      { at: Math.min(dur - 20, f("interactive") + 24), kind: "success", volume: 0.3 },
    ],
  },
  {
    name: "Feels alive — one board, every subject",
    render: ({ voiceAt }) => <AliveBoard at={voiceAt} />,
    cues: ({ voiceAt }) => [0, 1, 2].map((i) => ({ at: voiceAt + i * 22, kind: "pop" as const, volume: 0.35 })),
  },
  {
    name: "Deterministic AI",
    render: ({ f }) => (
      <ToolGrid
        title={<>Powered by {mark("deterministic")} solvers.</>}
        stamp="Computed, not guessed"
        stampAt={f("AI") + 6}
        tools={[
          { label: "Statics & beams", icon: <Layers size={24} />, at: f("powered") },
          { label: "Electrical circuits", icon: <Zap size={24} />, at: f("powered") + 4 },
          { label: "Thermodynamics", icon: <Flame size={24} />, at: f("powered") + 8 },
          { label: "Finance", icon: <TrendingUp size={24} />, at: f("powered") + 12 },
          { label: "Chemistry", icon: <FlaskConical size={24} />, at: f("powered") + 16 },
          { label: "Materials", icon: <Atom size={24} />, at: f("powered") + 20 },
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("AI") + 6, kind: "success", volume: 0.45 }],
  },
];

function WelcomeBoard({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const zoom = 1.25 - 0.25 * progress(frame, 0, 40);
  return (
    <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
      <HoersaalBoard lang="en" eyebrow="Digitaler Hörsaal" title="Welcome" professor={prof("genius")} writing={false} backdrop="backgrounds/aerospace/aerospace-03.webp">
        <Appear at={at}>
          <PaperNote title="Today">
            <HandLine>Your lecture hall is open — 24/7.</HandLine>
            <HandLine muted>Pick a subject, ask a question, watch the board come alive.</HandLine>
          </PaperNote>
        </Appear>
      </HoersaalBoard>
    </AbsoluteFill>
  );
}

function AliveBoard({ at }: { at: number }) {
  const frame = useCurrentFrame();
  return (
    <HoersaalBoard
      lang="en"
      eyebrow="Digitaler Hörsaal · Mixed subjects"
      title="Today's board"
      professor={prof("genius")}
      backdrop="backgrounds/general/bg-04.webp"
      scroll={interpolateScroll(frame, at + 40, at + 58, 0, 180)}
    >
      <Appear at={at}>
        <PaperNote title="Mathematics">
          <Tex tex={String.raw`\int_0^{\pi} \sin x \,dx = \big[-\cos x\big]_0^{\pi} = 2`} reveal={progress(frame, at + 4, at + 20)} size={1.05} />
        </PaperNote>
      </Appear>
      <Appear at={at + 22}>
        <PaperNote title="Computer science" tilt={0.5}>
          <div className="rounded-xl bg-[#282c34] px-3 py-2 text-left font-mono text-[12px] leading-relaxed text-[#abb2bf]">
            <span className="text-[#c678dd]">print</span>(<span className="text-[#61afef]">sum</span>(<span className="text-[#61afef]">range</span>(<span className="text-[#d19a66]">1</span>, <span className="text-[#d19a66]">101</span>)))
            <span className="block text-[#98c379]" style={{ opacity: progress(frame, at + 34, at + 40) }}>→ 5050</span>
          </div>
        </PaperNote>
      </Appear>
      <Appear at={at + 44}>
        <PaperNote title="Economics — market equilibrium" tilt={-0.4}>
          <SupplyDemand draw={progress(frame, at + 48, at + 90)} labels={{ p: "Price", q: "Quantity", s: "Supply", d: "Demand", eq: "equilibrium" }} />
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

export function EnFutureOfLearning() {
  return (
    <SeriesVideo
      vo={vo3}
      voice={voice3}
      music={music3}
      breaks={["style,", "alive,"]}
      scenes={EN3_SCENES}
      outro={{ tagline: <>Your {mark("personal")} university.</>, sub: "Visual · Auditory · Interactive", word: "personal" }}
    />
  );
}

