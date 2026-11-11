import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { PaperNote, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { PROFESSORS, PROFESSOR_IDS } from "../../../web/src/api/lib/professors";
import { solveNPV } from "../../../web/src/api/lib/solvers/finance-solver";
import { Appear, HoersaalBoard, Tex } from "../promo/board";
import { interpolateScroll, pop, progress, withStaticImage } from "../promo/kit";
import { ProfGrid } from "../promo/parts";
import { DocStack } from "../series/scenes";
import { CampaignVideo, type CampScene } from "./engine";
import { BG, Caption, ExamSim, FadeLayer, GuessVsSolver, Montage, Phone, PdfAvalanche, Punch, Shot, SparkleBurst, mark } from "./parts";
import vo1en from "../assets/vo-c1-en.json";
import vo1de from "../assets/vo-c1-de.json";
import vo2en from "../assets/vo-c2-en.json";
import vo2de from "../assets/vo-c2-de.json";
import vo3en from "../assets/vo-c3-en.json";
import vo3de from "../assets/vo-c3-de.json";
import vo4en from "../assets/vo-c4-en.json";
import vo4de from "../assets/vo-c4-de.json";
import vo5en from "../assets/vo-c5-en.json";
import vo5de from "../assets/vo-c5-de.json";
import voice1en from "../assets/vo-c1-en.mp3";
import voice1de from "../assets/vo-c1-de.mp3";
import voice2en from "../assets/vo-c2-en.mp3";
import voice2de from "../assets/vo-c2-de.mp3";
import voice3en from "../assets/vo-c3-en.mp3";
import voice3de from "../assets/vo-c3-de.mp3";
import voice4en from "../assets/vo-c4-en.mp3";
import voice4de from "../assets/vo-c4-de.mp3";
import voice5en from "../assets/vo-c5-en.mp3";
import voice5de from "../assets/vo-c5-de.mp3";
import music1en from "../assets/music-c1-en.mp3";
import music1de from "../assets/music-c1-de.mp3";
import music2en from "../assets/music-c2-en.mp3";
import music2de from "../assets/music-c2-de.mp3";
import music3en from "../assets/music-c3-en.mp3";
import music3de from "../assets/music-c3-de.mp3";
import music4en from "../assets/music-c4-en.mp3";
import music4de from "../assets/music-c4-de.mp3";
import music5en from "../assets/music-c5-en.mp3";
import music5de from "../assets/music-c5-de.mp3";

/**
 * Campagne « parle comme un ami » — 5 concepts × EN/DE, 30 s, 9:16.
 * Textes de voix : src/voiceovers.mjs (CAMPAIGN). Aucune mention d'un autre
 * assistant ; la mécanique s'appelle « Technische Mechanik ».
 */

type Lang = "en" | "de";
const prof = (id: keyof typeof PROFESSORS) => withStaticImage(PROFESSORS[id]);
const PROFS = PROFESSOR_IDS.map((id) => prof(id));

/** Toutes les filières, une photo chacune (fonds de l'app). */
const FIELDS: Record<Lang, { src: string; label: string }[]> = {
  en: [
    { src: BG("medicine", 1), label: "Medicine" },
    { src: BG("law", 2), label: "Law" },
    { src: BG("aerospace", 4), label: "Aerospace" },
    { src: BG("economics", 2), label: "Economics" },
    { src: BG("informatics", 2), label: "Computer Science" },
    { src: BG("psychology", 1), label: "Psychology" },
    { src: BG("civil", 1), label: "Civil Engineering" },
    { src: BG("biology", 3), label: "Biology" },
    { src: BG("physics", 2), label: "Physics" },
    { src: BG("history", 5), label: "History" },
    { src: BG("electrical", 3), label: "Electrical Engineering" },
    { src: BG("philosophy", 2), label: "Philosophy" },
  ],
  de: [
    { src: BG("medicine", 1), label: "Medizin" },
    { src: BG("law", 2), label: "Jura" },
    { src: BG("aerospace", 4), label: "Luft- und Raumfahrt" },
    { src: BG("economics", 2), label: "BWL" },
    { src: BG("informatics", 2), label: "Informatik" },
    { src: BG("psychology", 1), label: "Psychologie" },
    { src: BG("civil", 1), label: "Bauingenieurwesen" },
    { src: BG("biology", 3), label: "Biologie" },
    { src: BG("physics", 2), label: "Physik" },
    { src: BG("history", 5), label: "Geschichte" },
    { src: BG("electrical", 3), label: "Elektrotechnik" },
    { src: BG("philosophy", 2), label: "Philosophie" },
  ],
};

const PHONE: Record<Lang, { greeting: string; cards: { title: string; sub: string }[] }> = {
  en: {
    greeting: "Hi Lena",
    cards: [
      { title: "Today: 3 flashcards", sub: "Five minutes is enough." },
      { title: "Technische Mechanik 2", sub: "Beam — support forces" },
      { title: "Exam mode", sub: "Your simulation is ready" },
    ],
  },
  de: {
    greeting: "Hallo Lena",
    cards: [
      { title: "Heute zu wiederholen: 3 Karten", sub: "Fünf Minuten reichen." },
      { title: "Technische Mechanik 2", sub: "Balken — Lagerkräfte" },
      { title: "Prüfungsmodus", sub: "Deine Simulation ist bereit" },
    ],
  },
};

const ROTATION = [BG("aerospace", 4), BG("medicine", 1), BG("law", 1), BG("electrical", 2), BG("biology", 8), BG("economics", 7), BG("physics", 1), BG("history", 8)];

/** Mots synchronisés : chaque photo apparaît quand la voix nomme sa filière. */
function Beats({ items }: { items: { src: string; label: string; at: number }[] }) {
  const frame = useCurrentFrame();
  let i = 0;
  items.forEach((it, k) => {
    if (frame >= it.at - 2) i = k;
  });
  const it = items[i];
  const local = frame - it.at;
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + 0.07 * Math.exp(-Math.max(0, local) / 4)})` }}>
      <Montage items={[{ src: it.src, label: it.label }]} every={9999} start={it.at} />
    </AbsoluteFill>
  );
}

/* ── Le tableau : Technische Mechanik, un balken, étape par étape ─────── */

const BEAM = {
  en: { eyebrow: "Digitaler Hörsaal · Technische Mechanik", title: "Beam on two supports", given: "Given: q = 2 kN/m, l = 4 m", steps: ["Free-body diagram", "Equilibrium", "Support forces", "Result"], stamp: ["Computed", "by the solver"] },
  de: { eyebrow: "Digitaler Hörsaal · Technische Mechanik", title: "Balken auf zwei Lagern", given: "Gegeben: q = 2 kN/m, l = 4 m", steps: ["Freischnitt", "Gleichgewicht", "Lagerkräfte", "Ergebnis"], stamp: ["Berechnet", "mit dem Löser"] },
} as const;

function BeamBoard({ lang, at, step, scrollAt }: { lang: Lang; at: number; step: (frame: number) => number; scrollAt?: number }) {
  const frame = useCurrentFrame();
  const t = BEAM[lang];
  const k = step(frame);
  return (
    <HoersaalBoard
      lang={lang}
      eyebrow={t.eyebrow}
      title={t.title}
      professor={prof("sensei")}
      backdrop={BG("mechanical", 2)}
      scroll={scrollAt === undefined ? 0 : interpolateScroll(frame, scrollAt, scrollAt + 18, 0, 150)}
    >
      <div className="w-full pr-24">
        <StepChecklist steps={t.steps.map((label, i) => ({ label, done: i < k }))} />
      </div>
      <Appear at={at}>
        <PaperNote title={t.given}>
          <Tex tex={String.raw`\sum M_A = 0:\quad B\,l - q\,l\cdot\tfrac{l}{2} = 0`} reveal={progress(frame, at + 4, at + 22)} size={0.95} />
        </PaperNote>
      </Appear>
      <Appear at={at + 26}>
        <PaperNote title={t.steps[2]} tilt={0.5} highlight={k >= 4} stamp={k >= 4 ? <span style={{ transform: `scale(${2 - pop(frame, at + 60)})`, display: "inline-flex" }}><SolverStamp label={t.stamp[0]} sublabel={t.stamp[1]} /></span> : undefined}>
          <Tex tex={String.raw`A = B = \frac{q\,l}{2} = 4\,\mathrm{kN}`} reveal={progress(frame, at + 30, at + 46)} size={1.05} />
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

/** Une question tapée, puis le tableau qui s'ouvre au « boom ». */
function AskThenBoard({ lang, question, boom }: { lang: Lang; question: string; boom: number }) {
  const frame = useCurrentFrame();
  const typed = Math.floor(progress(frame, 4, Math.max(8, boom - 6)) * question.length);
  const open = progress(frame, boom, boom + 12);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${open * 120}% at 50% 70%)` }}>
        <BeamBoard lang={lang} at={boom + 8} step={(f) => (f > boom + 20 ? 1 : 0)} />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: 1 - open, alignItems: "center", justifyContent: "center" }}>
        <Shot src={BG("mathematics", 1)} veil={0.55} />
        <div style={{ position: "absolute", left: 30, right: 30, top: 420, padding: "18px 20px", borderRadius: 22, background: "rgb(255 255 255 / 0.92)", color: "#0F172A", fontSize: 24, fontWeight: 600, boxShadow: "0 30px 60px -20px rgb(0 0 0 / 0.9)" }}>
          {question.slice(0, typed)}
          <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>|</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/* ── Les formules vérifiées par les solveurs ─────────────────────────── */

function SolverWall({ lang, at }: { lang: Lang; at: number[] }) {
  const frame = useCurrentFrame();
  const npv = solveNPV([-1000, 400, 400, 400], 0.08).kapitalwert;
  const st = BEAM[lang].stamp;
  const notes = [
    { title: "Technische Mechanik", tex: String.raw`M_{\max} = \frac{q\,l^2}{8} = 4\,\mathrm{kNm}` },
    { title: lang === "en" ? "Electrical engineering" : "Elektrotechnik", tex: String.raw`I = \frac{12\,\mathrm{V}}{2\,\Omega + 2\,\Omega} = 3\,\mathrm{A}` },
    { title: lang === "en" ? "Finance — net present value" : "Finanzen — Kapitalwert", tex: String.raw`C_0 = -1000 + \sum_{t=1}^{3}\frac{400}{1{,}08^{t}} = ${npv.toFixed(2).replace(".", lang === "de" ? "{,}" : ".")}\,\text{€}` },
  ];
  return (
    <HoersaalBoard lang={lang} eyebrow="Digitaler Hörsaal" title={lang === "en" ? "Exact results" : "Exakte Ergebnisse"} professor={prof("maverick")} writing={false} backdrop={BG("mathematics", 3)}>
      {notes.map((n, i) => (
        <Appear key={n.title} at={Math.max(0, at[i] - 10)}>
          <PaperNote
            title={n.title}
            tilt={i % 2 ? 0.4 : -0.4}
            highlight={frame >= at[i]}
            stamp={<span style={{ opacity: Math.min(1, pop(frame, at[i]) * 1.5), transform: `scale(${2.2 - 1.2 * pop(frame, at[i])})`, display: "inline-flex" }}><SolverStamp label={st[0]} sublabel={st[1]} /></span>}
          >
            <Tex tex={n.tex} reveal={progress(frame, at[i] - 8, at[i] + 6)} size={0.92} />
          </PaperNote>
        </Appear>
      ))}
    </HoersaalBoard>
  );
}

/* ── Textes par concept et par langue ────────────────────────────────── */

const T = {
  en: {
    real: "Let's be real.",
    pocket: <>Your university. {mark("In your pocket.")}</>,
    noCap: ["No", "cap."],
    profTitle: "A professor who gets you.",
    question: "Why is the support force exactly half the load?",
    likeClass: <>Just like in class…</>,
    better: ["but", "way", "better."],
    guess: "Generic AI · guessing",
    wrong: "M_max = q·l²/4 = 8 kNm ???",
    meToo: ["Yeah.", "Me", "too."],
    trust: <>Trust it with {mark("your grades.")}</>,
    computed: ["Computed.", "Not", "guessed."],
    twoDays: ["Exam", "in", "2", "days?"],
    panic: ["Don't", "panic."],
    oldExams: <>Your {mark("old exams")}.</>,
    uploaded: "Uploaded",
    exams: [
      { name: "TM2_Exam_SS25.pdf", meta: "PDF · Technische Mechanik" },
      { name: "TM2_Exam_WS24.pdf", meta: "PDF · Technische Mechanik" },
      { name: "TM2_Practice_Set.pdf", meta: "PDF · 14 tasks" },
    ],
    examTitle: "Simulation · Technische Mechanik 2",
    questions: ["1. Support forces of the beam", "2. Maximum bending moment", "3. Shear force diagram", "4. Deflection at mid-span"],
    scoreLabel: "Corrected. Step by step.",
    ready: ["You're", "ready."],
    punishment: <>Learning ≠ {mark("punishment")}.</>,
    fun: ["kinda", "fun?"],
    saidIt: ["Yeah,", "I", "said", "it."],
    yourField: <>Your field. {mark("Your vibe.")}</>,
    outro: {
      c1: { tagline: <>The university {mark("in your pocket")}.</>, sub: "Medicine · Law · Engineering · and more" },
      c2: { tagline: <>A professor who {mark("gets you")}.</>, sub: "Interactive whiteboard · step by step" },
      c3: { tagline: <>Computed, {mark("not guessed")}.</>, sub: "Real solvers. 100% checked." },
      c4: { tagline: <>Exam? {mark("You're ready")}.</>, sub: "Custom exam simulations from your old exams" },
      c5: { tagline: <>Learning that {mark("feels good")}.</>, sub: "Premium design · dark mode · your backgrounds" },
    },
  },
  de: {
    real: "Seien wir mal ehrlich.",
    pocket: <>Deine Uni. {mark("Für die Hosentasche.")}</>,
    noCap: ["Ehrlich."],
    profTitle: "Ein Professor, der dich versteht.",
    question: "Warum ist die Lagerkraft genau die Hälfte der Last?",
    likeClass: <>Wie in der Vorlesung…</>,
    better: ["nur", "besser."],
    guess: "Irgendeine KI · geraten",
    wrong: "M_max = q·l²/4 = 8 kNm ???",
    meToo: ["Ja.", "Ich", "auch", "nicht."],
    trust: <>Darauf kannst du {mark("dich verlassen.")}</>,
    computed: ["Berechnet.", "Nicht", "geraten."],
    twoDays: ["Klausur", "in", "2", "Tagen?"],
    panic: ["Keine", "Panik."],
    oldExams: <>Deine {mark("Altklausuren")}.</>,
    uploaded: "Hochgeladen",
    exams: [
      { name: "TM2_Klausur_SS25.pdf", meta: "PDF · Technische Mechanik" },
      { name: "TM2_Klausur_WS24.pdf", meta: "PDF · Technische Mechanik" },
      { name: "TM2_Übungsblatt_7.pdf", meta: "PDF · 14 Aufgaben" },
    ],
    examTitle: "Simulation · Technische Mechanik 2",
    questions: ["1. Lagerkräfte des Balkens", "2. Maximales Biegemoment", "3. Querkraftverlauf", "4. Durchbiegung in Feldmitte"],
    scoreLabel: "Korrigiert. Schritt für Schritt.",
    ready: ["Du", "bist", "bereit."],
    punishment: <>Lernen ≠ {mark("Strafe")}.</>,
    fun: ["irgendwie", "spaßig?"],
    saidIt: ["Ja,", "ich", "hab's", "gesagt."],
    yourField: <>Dein Fach. {mark("Dein Vibe.")}</>,
    outro: {
      c1: { tagline: <>Deine Uni {mark("für die Hosentasche")}.</>, sub: "Medizin · Jura · Ingenieurwesen · und mehr" },
      c2: { tagline: <>Ein Professor, der {mark("dich versteht")}.</>, sub: "Interaktive Tafel · Schritt für Schritt" },
      c3: { tagline: <>Berechnet, {mark("nicht geraten")}.</>, sub: "Echte Solver. 100 % geprüft." },
      c4: { tagline: <>Klausur? {mark("Du bist bereit")}.</>, sub: "Simulationen aus deinen Altklausuren" },
      c5: { tagline: <>Lernen, das sich {mark("gut anfühlt")}.</>, sub: "Premium-Design · Dark Mode · deine Hintergründe" },
    },
  },
} as const;

const PDFS = [
  "Anatomie_VL_07.pdf", "BGB_AT_Skript.pdf", "TM2_Statik.pdf", "Physiologie_Herz.pdf", "Strafrecht_Fall_3.pdf",
  "Elektrotechnik_1.pdf", "Biochemie_Zyklus.pdf", "Verwaltungsrecht.pdf", "Thermodynamik_Ü5.pdf", "Pharmakologie.pdf",
  "Schuldrecht_BT.pdf", "Mathe_2_Integrale.pdf",
];

/* ── Finales communes ─────────────────────────────────────────────────── */

const fieldsFinale = (lang: Lang, line: ReactNode): CampScene => ({
  name: "Finale — every field",
  enter: "wipe",
  render: ({ dur }) => {
    const every = Math.max(9, Math.floor((dur - 40) / FIELDS[lang].length));
    const end = every * FIELDS[lang].length;
    return (
      <AbsoluteFill>
        <Montage items={FIELDS[lang]} every={every} />
        <FadeLayer from={end - 6} to={end + 6}>
          <Shot src={BG("aerospace", 4)} move="out" veil={0.45}>
            <Caption at={end} top={380}>{line}</Caption>
          </Shot>
        </FadeLayer>
      </AbsoluteFill>
    );
  },
  cues: ({ dur }) => {
    const every = Math.max(9, Math.floor((dur - 40) / FIELDS[lang].length));
    return FIELDS[lang].map((_, i) => ({ at: i * every, kind: "click" as const, volume: 0.18 }));
  },
});

/* ═══ Concept 1 — « Seien wir ehrlich » (universalité) ════════════════ */

const C1_EN: CampScene[] = [
  { name: "Let's be real", render: () => <Shot src={BG("philosophy", 3)} move="in"><Caption at={4} top={360}>{T.en.real}</Caption></Shot> },
  {
    name: "Medicine, law, engineering — drowning",
    span: 2,
    render: ({ f }) => {
      const drown = f("drowning");
      return (
        <AbsoluteFill>
          <Beats items={[{ src: BG("medicine", 2), label: "Medicine", at: f("medicine") }, { src: BG("law", 1), label: "Law", at: f("law") }, { src: BG("mechanical", 1), label: "Engineering", at: f("engineering") }]} />
          <FadeLayer from={drown - 4} to={drown + 4}>
            <PdfAvalanche files={PDFS} at={drown} />
          </FadeLayer>
        </AbsoluteFill>
      );
    },
    cues: ({ f }) => [{ at: f("medicine"), kind: "pop" }, { at: f("law"), kind: "pop" }, { at: f("engineering"), kind: "pop" }, ...[0, 6, 12, 18, 24].map((d) => ({ at: f("drowning") + d, kind: "type" as const, volume: 0.3 }))],
  },
  {
    name: "TRED is your way out",
    enter: "slide",
    render: ({ f }) => (
      <Shot src={BG("aerospace", 4)} move="up" veil={0.5}>
        <Phone greeting={PHONE.en.greeting} cards={PHONE.en.cards} backgrounds={ROTATION} at={f("TRED") - 6} scale={0.95} />
      </Shot>
    ),
    cues: ({ f }) => [{ at: f("TRED"), kind: "success", volume: 0.3 }],
  },
  {
    name: "Not just an AI — a university in your pocket",
    span: 2,
    render: ({ f }) => (
      <AbsoluteFill>
        <Montage items={FIELDS.en.slice(0, 6)} every={Math.max(10, Math.floor((f("pocket") - 4) / 6))} />
        <FadeLayer from={f("university") - 6} to={f("university") + 4}>
          <Shot src={BG("history", 1)} veil={0.5}>
            <Caption at={f("university")} top={330}>{T.en.pocket}</Caption>
          </Shot>
        </FadeLayer>
      </AbsoluteFill>
    ),
  },
  {
    name: "No cap",
    enter: "zoom",
    render: () => (
      <Shot src={BG("physics", 1)} move="out" veil={0.5}>
        <Punch words={T.en.noCap} at={2} size={96} top={360} />
        <SparkleBurst at={6} />
      </Shot>
    ),
    cues: () => [{ at: 4, kind: "pop", volume: 0.5 }],
  },
];

const C1_DE: CampScene[] = [
  { name: "Seien wir ehrlich", render: () => <Shot src={BG("philosophy", 3)} move="in"><Caption at={4} top={360}>{T.de.real}</Caption></Shot> },
  {
    name: "Jura, Medizin, Ingenieurwesen",
    render: ({ f }) => <Beats items={[{ src: BG("law", 1), label: "Jura", at: f("Jura") }, { src: BG("medicine", 2), label: "Medizin", at: f("Medizin") }, { src: BG("mechanical", 1), label: "Ingenieurwesen", at: f("Ingenieurwesen") }]} />,
    cues: ({ f }) => [{ at: f("Jura"), kind: "pop" }, { at: f("Medizin"), kind: "pop" }, { at: f("Ingenieurwesen"), kind: "pop" }],
  },
  {
    name: "Du ertrinkst in Skripten",
    span: 2,
    enter: "fade",
    render: ({ f }) => <PdfAvalanche files={PDFS} at={Math.max(0, f("ertrinkst") - 4)} />,
    cues: ({ f }) => [0, 6, 12, 18, 24].map((d) => ({ at: f("ertrinkst") + d, kind: "type" as const, volume: 0.3 })),
  },
  {
    name: "TRED ist deine Rettung",
    enter: "slide",
    render: ({ f }) => (
      <Shot src={BG("aerospace", 4)} move="up" veil={0.5}>
        <Phone greeting={PHONE.de.greeting} cards={PHONE.de.cards} backgrounds={ROTATION} at={f("TRED") - 6} scale={0.95} />
      </Shot>
    ),
    cues: ({ f }) => [{ at: f("TRED"), kind: "success", volume: 0.3 }],
  },
  {
    name: "Uni für die Hosentasche",
    render: ({ f }) => (
      <AbsoluteFill>
        <Montage items={FIELDS.de.slice(0, 6)} every={Math.max(10, Math.floor((f("Uni") - 4) / 6))} />
        <FadeLayer from={f("Uni") - 6} to={f("Uni") + 4}>
          <Shot src={BG("history", 1)} veil={0.5}>
            <Caption at={f("Uni")} top={330}>{T.de.pocket}</Caption>
          </Shot>
        </FadeLayer>
      </AbsoluteFill>
    ),
  },
];

/* ═══ Concept 2 — « Le prof qui te comprend » (Hörsaal) ═══════════════ */

const c2 = (lang: Lang, words: { gets: string; boom: string; step: string; like: string; better: string }): CampScene[] => {
  const t = T[lang];
  const ask: CampScene[] =
    lang === "en"
      ? [
          {
            name: "Question — boom — whiteboard",
            render: ({ f }) => <AskThenBoard lang={lang} question={t.question} boom={f(words.boom)} />,
            cues: ({ f }) => [...[8, 14, 20, 26, 32].map((d) => ({ at: d, kind: "type" as const, volume: 0.25 })), { at: f(words.boom), kind: "success", volume: 0.45 }],
          },
        ]
      : [
          {
            name: "Frage — bam",
            render: ({ f }) => <AskThenBoard lang={lang} question={t.question} boom={f(words.boom)} />,
            cues: ({ f }) => [...[8, 14, 20, 26, 32].map((d) => ({ at: d, kind: "type" as const, volume: 0.25 })), { at: f(words.boom), kind: "success", volume: 0.45 }],
          },
          {
            name: "Tafel öffnet sich",
            enter: "fade",
            render: ({ voiceAt }) => <BeamBoard lang={lang} at={0} step={(fr) => (fr > voiceAt + 20 ? 1 : 0)} />,
          },
        ];
  return [
    {
      name: "A professor who gets you",
      render: ({ f }) => <ProfGrid profs={PROFS} lang={lang} title={t.profTitle} chosen="sensei" chooseAt={f(words.gets)} />,
      cues: ({ f }) => [{ at: f(words.gets), kind: "click" }],
    },
    ...ask,
    {
      name: "Step by step",
      enter: "fade",
      render: ({ voiceAt }) => <BeamBoard lang={lang} at={-60} step={(fr) => Math.min(4, 1 + Math.floor(Math.max(0, fr - voiceAt) / 9))} />,
      cues: ({ voiceAt }) => [1, 2, 3].map((i) => ({ at: voiceAt + i * 9, kind: "pop" as const, volume: 0.3 })),
    },
    {
      name: "Like in class — but better",
      render: ({ f }) => (
        <Shot src={BG("mathematics", 1)} move="in" veil={0.45}>
          <Caption at={4} top={250}>{t.likeClass}</Caption>
          <Punch words={[...t.better]} at={f(words.better)} size={70} top={420} />
        </Shot>
      ),
      cues: ({ f }) => [{ at: f(words.better), kind: "pop", volume: 0.5 }],
    },
  ];
};

const c2Finale = (lang: Lang): CampScene => ({
  name: "Finale — the full solution",
  enter: "wipe",
  render: () => <BeamBoard lang={lang} at={-60} step={(fr) => (fr > 40 ? 4 : 3)} scrollAt={70} />,
  cues: () => [{ at: 40, kind: "success", volume: 0.4 }],
});

/* ═══ Concept 3 — « Zéro blabla » (fiabilité) ═════════════════════════ */

const c3 = (lang: Lang, words: { solvers: string; formula: string; calculation: string; checked: string }): CampScene[] => {
  const t = T[lang];
  const st = BEAM[lang].stamp;
  return [
    {
      name: "AI making up math",
      render: () => <GuessVsSolver at={2} solveAt={9999} guessLabel={t.guess} solverLabel={null} tex={{ wrong: t.wrong, right: "" }} />,
    },
    {
      name: "Me too",
      render: () => (
        <Shot src={BG("mathematics", 8)} move="in" veil={0.5}>
          <Punch words={[...t.meToo]} at={2} size={74} top={360} />
        </Shot>
      ),
    },
    {
      name: "TRED doesn't guess — real solvers",
      span: 2,
      render: ({ f }) => (
        <GuessVsSolver
          at={0}
          solveAt={f(words.solvers)}
          guessLabel={t.guess}
          solverLabel={<SolverStamp label={st[0]} sublabel={st[1]} />}
          tex={{ wrong: t.wrong, right: "M_max = q·l²/8 = 4 kNm" }}
        />
      ),
      cues: ({ f }) => [{ at: f(words.solvers) - 8, kind: "click" }, { at: f(words.solvers) + 8, kind: "success", volume: 0.45 }],
    },
    {
      name: "Every formula checked",
      enter: "fade",
      render: ({ f }) => <SolverWall lang={lang} at={[f(words.formula), f(words.calculation), f(words.checked)]} />,
      cues: ({ f }) => [f(words.formula), f(words.calculation), f(words.checked)].map((at) => ({ at, kind: "pop" as const, volume: 0.4 })),
    },
    {
      name: "Trust it",
      render: () => (
        <Shot src={BG("physics", 3)} move="out" veil={0.5}>
          <Caption at={4} top={360}>{t.trust}</Caption>
        </Shot>
      ),
    },
  ];
};

const c3Finale = (lang: Lang): CampScene => ({
  name: "Finale — computed, not guessed",
  enter: "wipe",
  render: () => (
    <AbsoluteFill>
      <Montage items={[BG("electrical", 3), BG("mechanical", 1), BG("economics", 4), BG("physics", 4), BG("chemical", 4)].map((src) => ({ src }))} every={22} />
      <Punch words={[...T[lang].computed]} at={8} size={66} top={360} />
    </AbsoluteFill>
  ),
  cues: () => [0, 22, 44, 66, 88].map((at) => ({ at, kind: "click" as const, volume: 0.18 })),
});

/* ═══ Concept 4 — « Deux jours avant l'examen » (Klausur) ═════════════ */

const c4 = (lang: Lang, words: { open: string; upload: string; corrects: string }): CampScene[] => {
  const t = T[lang];
  return [
    {
      name: "Exam in two days",
      render: () => (
        <Shot src={BG("mathematics", 1)} move="in" veil={0.55}>
          <Punch words={[...t.twoDays]} at={2} size={76} top={330} />
        </Shot>
      ),
      cues: () => [{ at: 10, kind: "pop", volume: 0.4 }],
    },
    {
      name: "Don't panic",
      render: () => (
        <Shot src={BG("environmental", 9)} move="out" veil={0.4}>
          <Punch words={[...t.panic]} at={1} size={80} top={360} />
        </Shot>
      ),
    },
    {
      name: "Open TRED",
      enter: "slide",
      render: () => (
        <Shot src={BG("aerospace", 4)} move="up" veil={0.5}>
          <Phone greeting={PHONE[lang].greeting} cards={PHONE[lang].cards} backgrounds={ROTATION} at={0} scale={0.95} />
        </Shot>
      ),
      cues: () => [{ at: 4, kind: "click" }],
    },
    {
      name: "Old exams → simulation",
      render: ({ f }) => {
        const u = f(words.upload);
        return <DocStack title={t.oldExams} doneLabel={t.uploaded} docs={t.exams.map((d, i) => ({ ...d, at: u + i * 12 }))} />;
      },
      cues: ({ f }) => [{ at: f(words.upload) + 26, kind: "success", volume: 0.25 }, { at: f(words.upload) + 50, kind: "success", volume: 0.25 }],
    },
    {
      name: "Practice — corrected — ready",
      span: 3,
      enter: "fade",
      render: ({ f }) => (
        <AbsoluteFill>
          <Shot src={BG("mathematics", 3)} veil={0.6} />
          <ExamSim title={t.examTitle} timerFrom={2 * 3600 - 7} questions={[...t.questions]} at={0} correctAt={f(words.corrects)} scoreLabel={t.scoreLabel} score={75} />
        </AbsoluteFill>
      ),
      cues: ({ f }) => [0, 1, 2, 3].map((i) => ({ at: f(words.corrects) + i * 7, kind: "pop" as const, volume: 0.35 })),
    },
  ];
};

const c4Finale = (lang: Lang): CampScene => ({
  name: "Finale — ready",
  enter: "wipe",
  render: () => (
    <Shot src={BG("aerospace", 1)} move="out" veil={0.45}>
      <Punch words={[...T[lang].ready]} at={6} size={92} top={340} />
      <SparkleBurst at={10} />
    </Shot>
  ),
  cues: () => [{ at: 8, kind: "success", volume: 0.4 }],
});

/* ═══ Concept 5 — « Le vibe » (expérience premium) ════════════════════ */

const c5 = (lang: Lang, words: { looks: string; flawless: string; fun: string }): CampScene[] => {
  const t = T[lang];
  return [
    {
      name: "Not a punishment",
      render: () => (
        <AbsoluteFill style={{ filter: "grayscale(1) contrast(0.9) brightness(0.8)" }}>
          <Shot src={BG("history", 6)} move="in" veil={0.5}>
            <Caption at={4} top={360}>{t.punishment}</Caption>
          </Shot>
        </AbsoluteFill>
      ),
    },
    {
      name: "Looks incredible, works flawlessly",
      enter: "wipe",
      render: ({ f }) => (
        <Shot src={BG("aerospace", 1)} move="up" veil={0.55}>
          <Phone greeting={PHONE[lang].greeting} cards={PHONE[lang].cards} backgrounds={ROTATION} every={Math.max(14, Math.floor((f(words.flawless) - f(words.looks)) / 2))} at={f(words.looks) - 8} scale={1} />
        </Shot>
      ),
      cues: ({ f }) => [{ at: f(words.looks), kind: "success", volume: 0.3 }, { at: f(words.flawless), kind: "click" }],
    },
    {
      name: "Kinda fun",
      enter: "zoom",
      render: ({ f }) => (
        <Shot src={BG("biology", 8)} move="out" veil={0.45}>
          <Punch words={[...t.fun]} at={Math.max(0, f(words.fun) - 6)} size={86} top={360} />
          <SparkleBurst at={f(words.fun)} />
        </Shot>
      ),
      cues: ({ f }) => [{ at: f(words.fun), kind: "pop", volume: 0.5 }],
    },
    {
      name: "I said it",
      render: () => (
        <Shot src={BG("economics", 7)} move="in" veil={0.5}>
          <Punch words={[...t.saidIt]} at={2} size={70} top={360} />
        </Shot>
      ),
    },
  ];
};

const c5Finale = (lang: Lang): CampScene => ({
  name: "Finale — your field, your background",
  enter: "wipe",
  render: () => (
    <AbsoluteFill>
      <Montage items={FIELDS[lang].slice(0, 8)} every={12} />
      <FadeLayer from={92} to={104}>
        <Shot src={BG("aerospace", 4)} veil={0.5}>
          <Phone greeting={PHONE[lang].greeting} cards={PHONE[lang].cards} backgrounds={FIELDS[lang].map((x) => x.src)} every={18} at={96} scale={0.92} />
          <Caption at={110} top={60}>{T[lang].yourField}</Caption>
        </Shot>
      </FadeLayer>
    </AbsoluteFill>
  ),
  cues: () => Array.from({ length: 8 }, (_, i) => ({ at: i * 12, kind: "click" as const, volume: 0.16 })),
});

/* ═══ Les 10 compositions ═══════════════════════════════════════════════ */

export const C1En = () => <CampaignVideo vo={vo1en} voice={voice1en} music={music1en} scenes={C1_EN} finale={fieldsFinale("en", T.en.pocket)} outro={T.en.outro.c1} />;
export const C1De = () => <CampaignVideo vo={vo1de} voice={voice1de} music={music1de} scenes={C1_DE} finale={fieldsFinale("de", T.de.pocket)} outro={T.de.outro.c1} />;

export const C2En = () => (
  <CampaignVideo vo={vo2en} voice={voice2en} music={music2en} scenes={c2("en", { gets: "gets", boom: "boom", step: "Step", like: "like", better: "but" })} finale={c2Finale("en")} outro={T.en.outro.c2} />
);
export const C2De = () => (
  <CampaignVideo vo={vo2de} voice={voice2de} music={music2de} scenes={c2("de", { gets: "versteht", boom: "bam", step: "Schritt", like: "Wie", better: "nur" })} finale={c2Finale("de")} outro={T.de.outro.c2} />
);

export const C3En = () => (
  <CampaignVideo vo={vo3en} voice={voice3en} music={music3en} scenes={c3("en", { solvers: "solvers", formula: "formula", calculation: "calculation", checked: "checked" })} finale={c3Finale("en")} outro={T.en.outro.c3} />
);
export const C3De = () => (
  <CampaignVideo vo={vo3de} voice={voice3de} music={music3de} scenes={c3("de", { solvers: "Solver", formula: "Formel", calculation: "Rechnung", checked: "geprüft" })} finale={c3Finale("de")} outro={T.de.outro.c3} />
);

export const C4En = () => (
  <CampaignVideo vo={vo4en} voice={voice4en} music={music4en} scenes={c4("en", { open: "open", upload: "Throw", corrects: "corrects" })} finale={c4Finale("en")} outro={T.en.outro.c4} />
);
export const C4De = () => (
  <CampaignVideo vo={vo4de} voice={voice4de} music={music4de} scenes={c4("de", { open: "Öffne", upload: "Lade", corrects: "korrigiert" })} finale={c4Finale("de")} outro={T.de.outro.c4} />
);

export const C5En = () => (
  <CampaignVideo vo={vo5en} voice={voice5en} music={music5en} scenes={c5("en", { looks: "looks", flawless: "flawlessly", fun: "fun" })} finale={c5Finale("en")} outro={T.en.outro.c5} />
);
export const C5De = () => (
  <CampaignVideo vo={vo5de} voice={voice5de} music={music5de} scenes={c5("de", { looks: "sieht", flawless: "flüssig", fun: "spaßig" })} finale={c5Finale("de")} outro={T.de.outro.c5} />
);

export const CAMPAIGN_IDS = [
  ["C1-EN-Lets-Be-Real", C1En],
  ["C1-DE-Seien-Wir-Ehrlich", C1De],
  ["C2-EN-Professor-Who-Gets-You", C2En],
  ["C2-DE-Professor-Der-Dich-Versteht", C2De],
  ["C3-EN-Zero-Guessing", C3En],
  ["C3-DE-Nicht-Geraten", C3De],
  ["C4-EN-Exam-In-Two-Days", C4En],
  ["C4-DE-Klausur-In-Zwei-Tagen", C4De],
  ["C5-EN-The-Vibe", C5En],
  ["C5-DE-Der-Vibe", C5De],
] as const;

