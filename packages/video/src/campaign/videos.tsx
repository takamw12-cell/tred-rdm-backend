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

type Outro = { tagline: ReactNode; sub?: string; word?: string };

/* ── Textes par concept et par langue ────────────────────────────────── */

const T = {
  en: {
    real: "Let's be real.",
    pocket: <>Your university. {mark("In your pocket.")}</>,
    goodNews: ["Good", "news."],
    readsFiles: <>It reads {mark("your own files")}.</>,
    files: [
      { name: "Anatomy_Lecture_07.pdf", meta: "PDF · Medicine" },
      { name: "Contract_Law_Script.pdf", meta: "PDF · Law" },
      { name: "TM2_Statics.pdf", meta: "PDF · Technische Mechanik" },
    ],
    fields: ["Medicine", "Law", "Engineering"],
    stuck: ["Complex circuit", "Math problem"],
    profTitle: "A professor who gets you.",
    question: "Why is the support force exactly half the load?",
    likeClass: <>Like a private lecture hall…</>,
    better: ["but", "you're", "in", "control."],
    guess: "Generic AI · guessing",
    wrong: "M_max = q·l²/4 = 8 kNm ???",
    meToo: ["Yeah.", "Me", "too."],
    trust: <>Trust it with {mark("your grades.")}</>,
    noFake: ["No", "hallucinations.", "No", "fake", "results."],
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
      c1: { tagline: <>The university {mark("in your pocket")}.</>, sub: "Medicine · Law · Engineering · and more" } as Outro,
      c2: { tagline: <>A professor who {mark("gets you")}.</>, sub: "Interactive whiteboard · step by step" },
      c3: { tagline: <>Computed, {mark("not guessed")}.</>, sub: "Real solvers. 100% checked." },
      c4: { tagline: <>Exam? {mark("You're ready")}.</>, sub: "Custom exam simulations from your old exams", word: "ready" },
      c5: { tagline: <>The ultimate university {mark("in your pocket")}.</>, sub: "Premium design · dark mode · your backgrounds", word: "university" },
    },
  },
  de: {
    real: "Seien wir mal ehrlich.",
    pocket: <>Deine Uni. {mark("Für die Hosentasche.")}</>,
    goodNews: ["Gute", "Neuigkeiten."],
    readsFiles: <>Es liest {mark("deine eigenen Dateien")}.</>,
    files: [
      { name: "Anatomie_VL_07.pdf", meta: "PDF · Medizin" },
      { name: "BGB_AT_Skript.pdf", meta: "PDF · Jura" },
      { name: "TM2_Statik.pdf", meta: "PDF · Technische Mechanik" },
    ],
    fields: ["Medizin", "Jura", "Ingenieurwesen"],
    stuck: ["Komplexe Schaltung", "Mathe-Problem"],
    profTitle: "Ein Professor, der dich versteht.",
    question: "Warum ist die Lagerkraft genau die Hälfte der Last?",
    likeClass: <>Wie ein privater Hörsaal…</>,
    better: ["Du", "hast", "die", "Kontrolle."],
    guess: "Irgendeine KI · geraten",
    wrong: "M_max = q·l²/4 = 8 kNm ???",
    meToo: ["Ja.", "Ich", "auch."],
    trust: <>Vertrau ihm {mark("deine Noten")} an.</>,
    noFake: ["Keine", "Halluzinationen.", "Keine", "falschen", "Ergebnisse."],
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
      c4: { tagline: <>Klausur? {mark("Du bist bereit")}.</>, sub: "Simulationen aus deinen Altklausuren", word: "bereit" },
      c5: { tagline: <>Deine {mark("persönliche Universität")}.</>, sub: "Premium-Design · Dark Mode · deine Hintergründe", word: "Universität" },
    },
  },
};

const PDFS = [
  "Anatomie_VL_07.pdf", "BGB_AT_Skript.pdf", "TM2_Statik.pdf", "Physiologie_Herz.pdf", "Strafrecht_Fall_3.pdf",
  "Elektrotechnik_1.pdf", "Biochemie_Zyklus.pdf", "Verwaltungsrecht.pdf", "Thermodynamik_Ü5.pdf", "Pharmakologie.pdf",
  "Schuldrecht_BT.pdf", "Mathe_2_Integrale.pdf",
];

/* ═══ Concept 1 — « Seien wir ehrlich » (universalité) ════════════════ */

const c1 = (lang: Lang, w: { medicine: string; law: string; engineering: string; drowning: string; university: string; reads: string; draws: string; step: string }): CampScene[] => {
  const t = T[lang];
  return [
    { name: "Let's be real", render: () => <Shot src={BG("philosophy", 3)} move="in"><Caption at={4} top={360}>{t.real}</Caption></Shot> },
    {
      name: "Medicine, law, engineering — drowning in PDFs",
      span: 2,
      render: ({ f }) => {
        const drown = f(w.drowning);
        return (
          <AbsoluteFill>
            <Beats items={[{ src: BG("medicine", 2), label: t.fields[0], at: f(w.medicine) }, { src: BG("law", 1), label: t.fields[1], at: f(w.law) }, { src: BG("mechanical", 1), label: t.fields[2], at: f(w.engineering) }]} />
            <FadeLayer from={drown - 4} to={drown + 4}>
              <PdfAvalanche files={PDFS} at={drown} />
            </FadeLayer>
          </AbsoluteFill>
        );
      },
      cues: ({ f }) => [{ at: f(w.medicine), kind: "pop" }, { at: f(w.law), kind: "pop" }, { at: f(w.engineering), kind: "pop" }, ...[0, 6, 12, 18, 24].map((d) => ({ at: f(w.drowning) + d, kind: "type" as const, volume: 0.3 }))],
    },
    {
      name: "Good news",
      render: () => (
        <Shot src={BG("environmental", 9)} move="out" veil={0.4}>
          <Punch words={t.goodNews} at={3} size={84} top={360} />
        </Shot>
      ),
      cues: () => [{ at: 5, kind: "pop", volume: 0.4 }],
    },
    {
      name: "TRED is your way out",
      enter: "slide",
      render: ({ f }) => (
        <Shot src={BG("aerospace", 4)} move="up" veil={0.5}>
          <Phone greeting={PHONE[lang].greeting} cards={PHONE[lang].cards} backgrounds={ROTATION} at={Math.max(0, f("TRED") - 6)} scale={0.95} />
        </Shot>
      ),
      cues: ({ f }) => [{ at: f("TRED"), kind: "success", volume: 0.3 }],
    },
    {
      name: "Not a chatbot — a university in your pocket",
      span: 2,
      render: ({ f }) => (
        <AbsoluteFill>
          <Montage items={FIELDS[lang].slice(0, 6)} every={Math.max(10, Math.floor((f(w.university) - 4) / 6))} />
          <FadeLayer from={f(w.university) - 6} to={f(w.university) + 4}>
            <Shot src={BG("history", 1)} veil={0.5}>
              <Caption at={f(w.university)} top={330}>{t.pocket}</Caption>
            </Shot>
          </FadeLayer>
        </AbsoluteFill>
      ),
    },
    {
      name: "Reads your files, draws, explains step by step",
      enter: "fade",
      render: ({ f }) => {
        const draw = f(w.draws);
        const step = f(w.step);
        return (
          <AbsoluteFill>
            <DocStack title={t.readsFiles} doneLabel={t.uploaded} docs={t.files.map((d, i) => ({ ...d, at: Math.max(4, f(w.reads)) + i * 9 }))} />
            <FadeLayer from={draw - 6} to={draw + 4}>
              <BeamBoard lang={lang} at={draw + 4} step={(fr) => (fr < step ? 1 : Math.min(4, 2 + Math.floor((fr - step) / 14)))} />
            </FadeLayer>
          </AbsoluteFill>
        );
      },
      cues: ({ f }) => [{ at: f(w.draws), kind: "success", volume: 0.35 }, ...[0, 14, 28].map((d) => ({ at: f(w.step) + d, kind: "pop" as const, volume: 0.3 }))],
    },
  ];
};

/* ═══ Concept 2 — « Le prof qui te comprend » (Hörsaal) ═══════════════ */

const c2 = (lang: Lang, w: { gets: string; circuit: string; math: string; boom: string; but: string }): CampScene[] => {
  const t = T[lang];
  return [
    {
      name: "A professor who gets you",
      render: ({ f }) => <ProfGrid profs={PROFS} lang={lang} title={t.profTitle} chosen="sensei" chooseAt={f(w.gets)} />,
      cues: ({ f }) => [{ at: f(w.gets), kind: "click" }],
    },
    {
      name: "Stuck on a circuit or a math problem",
      render: ({ f }) => <Beats items={[{ src: BG("electrical", 2), label: t.stuck[0], at: f(w.circuit) }, { src: BG("mathematics", 8), label: t.stuck[1], at: f(w.math) }]} />,
      cues: ({ f }) => [{ at: f(w.circuit), kind: "pop" }, { at: f(w.math), kind: "pop" }],
    },
    {
      name: "Question — boom — whiteboard",
      // En allemand, « bam! » ferme la phrase : la Tafel s'ouvre sur la suivante.
      span: lang === "de" ? 2 : 1,
      render: ({ f }) => <AskThenBoard lang={lang} question={t.question} boom={f(w.boom)} />,
      cues: ({ f }) => [...[8, 14, 20, 26, 32].map((d) => ({ at: d, kind: "type" as const, volume: 0.25 })), { at: f(w.boom), kind: "success", volume: 0.45 }],
    },
    {
      name: "Step by step",
      enter: "fade",
      render: ({ voiceAt }) => <BeamBoard lang={lang} at={-60} step={(fr) => Math.min(3, 1 + Math.floor(Math.max(0, fr - voiceAt) / 18))} />,
      cues: ({ voiceAt }) => [1, 2].map((i) => ({ at: voiceAt + i * 18, kind: "pop" as const, volume: 0.3 })),
    },
    {
      name: "The professor explains the intuition",
      enter: "fade",
      render: () => <BeamBoard lang={lang} at={-60} step={(fr) => (fr > 40 ? 4 : 3)} scrollAt={80} />,
      cues: () => [{ at: 40, kind: "success", volume: 0.4 }],
    },
    {
      name: "A private lecture hall — you're in control",
      render: ({ f, dur }) => {
        const at = Math.max(14, Math.min(f(w.but), dur - 45));
        return (
          <Shot src={BG("mathematics", 1)} move="in" veil={0.45}>
            <Caption at={4} top={250}>{t.likeClass}</Caption>
            <Punch words={t.better} at={at} size={66} top={420} />
          </Shot>
        );
      },
      cues: ({ f, dur }) => [{ at: Math.max(14, Math.min(f(w.but), dur - 45)), kind: "pop", volume: 0.5 }],
    },
  ];
};

/* ═══ Concept 3 — « Zéro blabla » (fiabilité) ═════════════════════════ */

const c3 = (lang: Lang, w: { solvers: string; formula: [string, number]; calculation: string; unit: string }): CampScene[] => {
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
          <Punch words={t.meToo} at={2} size={74} top={360} />
        </Shot>
      ),
    },
    {
      name: "TRED doesn't guess — real solvers",
      span: 2,
      render: ({ f }) => (
        <GuessVsSolver
          at={0}
          solveAt={f(w.solvers)}
          guessLabel={t.guess}
          solverLabel={<SolverStamp label={st[0]} sublabel={st[1]} />}
          tex={{ wrong: t.wrong, right: "M_max = q·l²/8 = 4 kNm" }}
        />
      ),
      cues: ({ f }) => [{ at: f(w.solvers) - 8, kind: "click" }, { at: f(w.solvers) + 8, kind: "success", volume: 0.45 }],
    },
    {
      name: "Every formula, calculation and unit checked",
      enter: "fade",
      render: ({ f }) => <SolverWall lang={lang} at={[f(...w.formula), f(w.calculation), f(w.unit)]} />,
      cues: ({ f }) => [f(...w.formula), f(w.calculation), f(w.unit)].map((at) => ({ at, kind: "pop" as const, volume: 0.4 })),
    },
    {
      name: "Trust it with your grades",
      render: () => (
        <Shot src={BG("physics", 3)} move="out" veil={0.5}>
          <Caption at={4} top={360}>{t.trust}</Caption>
        </Shot>
      ),
    },
    {
      name: "No hallucinations, no fake results",
      render: () => (
        <Shot src={BG("physics", 4)} move="in" veil={0.55}>
          <Punch words={t.noFake} at={3} size={54} top={340} />
        </Shot>
      ),
      cues: () => [{ at: 5, kind: "pop", volume: 0.4 }],
    },
    {
      name: "Pure, reliable engineering and science",
      enter: "wipe",
      render: () => (
        <AbsoluteFill>
          <Montage items={[BG("electrical", 3), BG("mechanical", 1), BG("economics", 4), BG("physics", 4), BG("chemical", 4)].map((src) => ({ src }))} every={20} />
          <Punch words={t.computed} at={8} size={66} top={360} />
        </AbsoluteFill>
      ),
      cues: () => [0, 20, 40, 60].map((at) => ({ at, kind: "click" as const, volume: 0.18 })),
    },
  ];
};

/* ═══ Concept 4 — « Deux jours avant l'examen » (Klausur) ═════════════ */

const c4 = (lang: Lang, w: { upload: string; simulation: string; corrects: string; fields: [string, string, string] }): CampScene[] => {
  const t = T[lang];
  const sim = (at: number, correctAt: number) => (
    <AbsoluteFill>
      <Shot src={BG("mathematics", 3)} veil={0.6} />
      <ExamSim title={t.examTitle} timerFrom={2 * 3600 - 7} questions={t.questions} at={at} correctAt={correctAt} scoreLabel={t.scoreLabel} score={75} />
    </AbsoluteFill>
  );
  return [
    {
      name: "Exam in two days",
      render: () => (
        <Shot src={BG("mathematics", 1)} move="in" veil={0.55}>
          <Punch words={t.twoDays} at={2} size={76} top={330} />
        </Shot>
      ),
      cues: () => [{ at: 10, kind: "pop", volume: 0.4 }],
    },
    {
      name: "Don't panic",
      render: () => (
        <Shot src={BG("environmental", 9)} move="out" veil={0.4}>
          <Punch words={t.panic} at={1} size={80} top={360} />
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
      name: "Old exams → custom simulation",
      render: ({ f }) => {
        const u = Math.max(2, f(w.upload));
        const s0 = f(w.simulation);
        return (
          <AbsoluteFill>
            <DocStack title={t.oldExams} doneLabel={t.uploaded} docs={t.exams.map((d, i) => ({ ...d, at: u + i * 12 }))} />
            <FadeLayer from={s0 - 8} to={s0 + 2}>{sim(s0 - 6, 9999)}</FadeLayer>
          </AbsoluteFill>
        );
      },
      cues: ({ f }) => [{ at: f(w.upload) + 26, kind: "success", volume: 0.25 }, { at: f(w.simulation), kind: "success", volume: 0.3 }],
    },
    {
      name: "Practice — corrected step by step",
      enter: "fade",
      render: ({ f }) => sim(-60, f(w.corrects)),
      cues: ({ f }) => [0, 1, 2, 3].map((i) => ({ at: f(w.corrects) + i * 7, kind: "pop" as const, volume: 0.35 })),
    },
    {
      name: "Engineering, medicine, law — whatever",
      span: 2,
      render: ({ f }) => <Beats items={[{ src: BG("mechanical", 1), label: t.fields[2], at: f(w.fields[0]) }, { src: BG("medicine", 2), label: t.fields[0], at: f(w.fields[1]) }, { src: BG("law", 1), label: t.fields[1], at: f(w.fields[2]) }]} />,
      cues: ({ f }) => w.fields.map((x) => ({ at: f(x), kind: "pop" as const })),
    },
  ];
};

/* ═══ Concept 5 — « Le vibe » (expérience premium) ════════════════════ */

const c5 = (lang: Lang, w: { looks: string; fun: string }): CampScene[] => {
  const t = T[lang];
  return [
    {
      name: "Not a punishment",
      span: 2,
      render: ({ dur }) => (
        <AbsoluteFill style={{ filter: "grayscale(1) contrast(0.9) brightness(0.8)" }}>
          <Shot src={BG("history", 6)} move="in" veil={0.5}>
            <Caption at={Math.max(6, Math.floor(dur / 3))} top={360}>{t.punishment}</Caption>
          </Shot>
        </AbsoluteFill>
      ),
    },
    {
      name: "Looks incredible — dark mode, animations, backgrounds",
      span: 2,
      enter: "wipe",
      render: ({ f }) => (
        <Shot src={BG("aerospace", 1)} move="up" veil={0.55}>
          <Phone greeting={PHONE[lang].greeting} cards={PHONE[lang].cards} backgrounds={ROTATION} every={24} at={Math.max(0, f(w.looks) - 8)} scale={1} />
        </Shot>
      ),
      cues: ({ f }) => [{ at: f(w.looks), kind: "success", volume: 0.3 }],
    },
    {
      name: "Kind of fun",
      enter: "zoom",
      render: ({ f }) => (
        <Shot src={BG("biology", 8)} move="out" veil={0.45}>
          <Punch words={t.fun} at={Math.max(0, f(w.fun) - 6)} size={86} top={360} />
          <SparkleBurst at={f(w.fun)} />
        </Shot>
      ),
      cues: ({ f }) => [{ at: f(w.fun), kind: "pop", volume: 0.5 }],
    },
    {
      name: "I said it",
      render: () => (
        <Shot src={BG("economics", 7)} move="in" veil={0.5}>
          <Punch words={t.saidIt} at={2} size={70} top={360} />
        </Shot>
      ),
    },
    {
      name: "Your field, your background",
      enter: "wipe",
      render: ({ dur }) => {
        const every = Math.max(9, Math.floor(dur / 8));
        return (
          <AbsoluteFill>
            <Montage items={FIELDS[lang].slice(0, 8)} every={every} />
            <Caption at={every * 2} top={400}>{t.yourField}</Caption>
          </AbsoluteFill>
        );
      },
      cues: ({ dur }) => Array.from({ length: 8 }, (_, i) => ({ at: i * Math.max(9, Math.floor(dur / 8)), kind: "click" as const, volume: 0.16 })),
    },
  ];
};

/* ═══ Les 10 compositions ═══════════════════════════════════════════════ */

export const C1En = () => (
  <CampaignVideo vo={vo1en} voice={voice1en} music={music1en} scenes={c1("en", { medicine: "medicine", law: "law", engineering: "engineering", drowning: "drowning", university: "university", reads: "reads", draws: "draws", step: "step" })} outro={T.en.outro.c1} />
);
export const C1De = () => (
  <CampaignVideo vo={vo1de} voice={voice1de} music={music1de} scenes={c1("de", { medicine: "Medizin", law: "Jura", engineering: "Ingenieurwesen", drowning: "ertrinkst", university: "Universität", reads: "liest", draws: "zeichnet", step: "Schritt" })} outro={T.de.outro.c1} />
);

export const C2En = () => (
  <CampaignVideo vo={vo2en} voice={voice2en} music={music2en} scenes={c2("en", { gets: "gets", circuit: "circuit", math: "math", boom: "boom", but: "but" })} outro={T.en.outro.c2} />
);
export const C2De = () => (
  <CampaignVideo vo={vo2de} voice={voice2de} music={music2de} scenes={c2("de", { gets: "versteht", circuit: "Schaltung", math: "Mathe", boom: "bam", but: "nur" })} outro={T.de.outro.c2} />
);

export const C3En = () => (
  <CampaignVideo vo={vo3en} voice={voice3en} music={music3en} scenes={c3("en", { solvers: "solvers", formula: ["formula", 1], calculation: "calculation", unit: "unit" })} outro={T.en.outro.c3} />
);
export const C3De = () => (
  <CampaignVideo vo={vo3de} voice={voice3de} music={music3de} scenes={c3("de", { solvers: "Solver", formula: ["Formel", 0], calculation: "Berechnung", unit: "Einheit" })} outro={T.de.outro.c3} />
);

// « Boom. You're ready to crush it. » est dit sur l'outro (« Exam? You're ready. »).
export const C4En = () => (
  <CampaignVideo vo={vo4en} voice={voice4en} music={music4en} scenes={c4("en", { upload: "Throw", simulation: "simulation", corrects: "corrects", fields: ["engineering", "medicine", "law"] })} outro={T.en.outro.c4} outroSpan={2} />
);
export const C4De = () => (
  <CampaignVideo vo={vo4de} voice={voice4de} music={music4de} scenes={c4("de", { upload: "Lade", simulation: "Prüfungssimulation", corrects: "korrigiert", fields: ["Ingenieurwesen", "Medizin", "Jura"] })} outro={T.de.outro.c4} outroSpan={2} />
);

// « TRED. The ultimate university in your pocket. » est dit sur l'outro.
export const C5En = () => (
  <CampaignVideo vo={vo5en} voice={voice5en} music={music5en} scenes={c5("en", { looks: "looks", fun: "fun" })} outro={T.en.outro.c5} outroSpan={2} />
);
export const C5De = () => (
  <CampaignVideo vo={vo5de} voice={voice5de} music={music5de} scenes={c5("de", { looks: "sieht", fun: "spaßig" })} outro={T.de.outro.c5} outroSpan={2} />
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

