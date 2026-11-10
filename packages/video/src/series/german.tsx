import { useMemo } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Atom, BookOpen, Cog, Code2, FlaskConical, Flame, Layers, Scale, Sigma, Stethoscope, TrendingUp, Zap } from "lucide-react";
import { PaperNote, ProfessorHalo, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { LogoMark } from "@/components/logo";
import { PROFESSORS, PROFESSOR_IDS } from "../../../web/src/api/lib/professors";
import { solveIRR, solveNPV } from "../../../web/src/api/lib/solvers/finance-solver";
import { Appear, HandLine, HoersaalBoard, Tex } from "../promo/board";
import { NIGHT, YELLOW, interpolateScroll, pop, progress, rise, withStaticImage } from "../promo/kit";
import { ProfGrid, SubjectTile } from "../promo/parts";
import { SeriesVideo, type SceneDef } from "./engine";
import { ActionPotential, ChipCloud, DocStack, ExamChoices, NpvCurve, SplitPanels, StylePicker, ToolGrid } from "./scenes";
import vo1 from "../assets/vo-de1.json";
import vo2 from "../assets/vo-de2.json";
import vo3 from "../assets/vo-de3.json";
import voice1 from "../assets/vo-de1.mp3";
import voice2 from "../assets/vo-de2.mp3";
import voice3 from "../assets/vo-de3.mp3";
import music1 from "../assets/music-de1.mp3";
import music2 from "../assets/music-de2.mp3";
import music3 from "../assets/music-de3.mp3";

const prof = (id: keyof typeof PROFESSORS) => withStaticImage(PROFESSORS[id]);
const mark = (t: string) => <span className="bg-[linear-gradient(transparent_58%,#EAB30866_58%)] px-1">{t}</span>;
const stampAt = (frame: number, at: number, label?: string, sublabel?: string) => {
  const k = pop(frame, at);
  return (
    <span style={{ opacity: Math.min(1, k * 1.5), transform: `scale(${2.2 - 1.2 * k})`, display: "inline-flex" }}>
      <SolverStamp label={label} sublabel={sublabel} />
    </span>
  );
};

/* ═══ DE 1 — Jura & Medizin ════════════════════════════════════════════ */

const DE1_SCENES: SceneDef[] = [
  {
    name: "Nicht nur für Ingenieure",
    render: ({ f }) => (
      <SplitPanels
        panels={[
          { at: 4, icon: <Cog size={44} />, label: "Ingenieurwesen", img: "backgrounds/mechanical/mechanical-01.webp" },
          { at: f("Ingenieure") + 6, icon: <BookOpen size={44} />, label: "… und so viel mehr.", tint: "linear-gradient(160deg,#713F12,#0F172A)" },
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("Ingenieure") + 6, kind: "pop" }],
  },
  {
    name: "Jura, Medizin, viele Fächer",
    render: ({ f }) => (
      <ChipCloud
        title={<>Ein Begleiter. {mark("Alle Fächer.")}</>}
        chips={[
          { label: "Jura", at: f("Jura"), strong: true, icon: <Scale size={20} /> },
          { label: "Medizin", at: f("Medizin"), strong: true, icon: <Stethoscope size={20} /> },
          ...["Strafrecht", "Gesellschaftsrecht", "Völkerrecht", "Kardiologie", "Neurologie", "Chirurgie", "Wirtschaft", "Psychologie", "Biologie", "Philosophie", "Geschichte", "Sprachen"].map(
            (label, i) => ({ label, at: f("weitere") + i * 3 }),
          ),
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("Jura"), kind: "pop" }, { at: f("Medizin"), kind: "pop" }, { at: f("Fächer"), kind: "success", volume: 0.3 }],
  },
  {
    name: "Gutachten — § 223 StGB",
    render: ({ f }) => <GutachtenDE at={f("Strukturiere")} />,
    cues: ({ f }) => [{ at: f("Strukturiere"), kind: "click" }, { at: f("Strukturiere") + 72, kind: "success", volume: 0.3 }],
  },
  {
    name: "Neurologie — Aktionspotential",
    render: ({ f, voiceAt }) => <NeuroDE at={{ start: voiceAt, med: f("medizinische") }} />,
    cues: ({ f }) => [{ at: f("medizinische"), kind: "click" }],
  },
  {
    name: "Prüfungen",
    render: ({ f, voiceAt }) => <ExamDE at={{ start: voiceAt, exam: f("Prüfungen") }} />,
    cues: ({ f }) => [{ at: f("Prüfungen") + 8, kind: "success", volume: 0.45 }],
  },
];

function GutachtenDE({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const step = frame >= at + 72 ? 4 : frame >= at + 48 ? 3 : frame >= at + 24 ? 2 : frame >= at ? 1 : 0;
  return (
    <HoersaalBoard lang="de" eyebrow="Digitaler Hörsaal · Strafrecht" title="Gutachtenstil" professor={prof("examiner")} backdrop="backgrounds/general/bg-02.webp">
      <div className="w-full pr-24">
        <StepChecklist steps={["Obersatz", "Definition", "Subsumtion", "Ergebnis"].map((label, i) => ({ label, done: i < step }))} />
      </div>
      <PaperNote title="Fall — § 223 I StGB">
        <HandLine muted reveal={progress(frame, 2, 16)}>A schlägt B mit der Faust ins Gesicht.</HandLine>
        <Appear at={at}>
          <HandLine><b>Obersatz:</b> A könnte sich wegen Körperverletzung gem. § 223 I StGB strafbar gemacht haben.</HandLine>
        </Appear>
        <Appear at={at + 24}>
          <HandLine><b>Definition:</b> Körperliche Misshandlung = üble, unangemessene Behandlung, die das Wohlbefinden mehr als unerheblich beeinträchtigt.</HandLine>
        </Appear>
        <Appear at={at + 48}>
          <HandLine><b>Subsumtion:</b> Der Faustschlag erfüllt diese Voraussetzungen. ✓</HandLine>
        </Appear>
      </PaperNote>
      <Appear at={at + 72}>
        <PaperNote title="Ergebnis" tilt={0.5} highlight>
          <HandLine>A hat sich gem. § 223 I StGB strafbar gemacht.</HandLine>
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

function NeuroDE({ at }: { at: { start: number; med: number } }) {
  const frame = useCurrentFrame();
  return (
    <HoersaalBoard lang="de" eyebrow="Digitaler Hörsaal · Neurologie" title="Aktionspotential" professor={prof("sensei")} backdrop="backgrounds/general/bg-01.webp">
      <PaperNote title="Membranpotential eines Neurons">
        <ActionPotential
          draw={progress(frame, at.med - 4, at.med + 80)}
          labels={{ rest: "Ruhepotential", threshold: "Schwelle −55 mV", depol: "Depolarisation (Na⁺ ein)", repol: "Repolarisation (K⁺ aus)", hyper: "Hyperpolarisation" }}
        />
      </PaperNote>
      <Appear at={at.med + 70}>
        <PaperNote title="Merke" tilt={0.5}>
          <HandLine>Alles-oder-nichts: Erst ab der Schwelle entsteht ein Aktionspotential.</HandLine>
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

function ExamDE({ at }: { at: { start: number; exam: number } }) {
  const frame = useCurrentFrame();
  const left = Math.max(0, 90 - Math.floor((frame - at.start) / 30));
  return (
    <HoersaalBoard lang="de" eyebrow="Digitaler Hörsaal · Prüfungstraining" title="Übungsaufgabe" professor={prof("examiner")} backdrop="backgrounds/general/bg-03.webp">
      <div className="flex w-full justify-end pr-24">
        <span className="rounded-full bg-[#1B2A4A] px-3 py-1 font-mono text-sm text-white">⏱ 0{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span>
      </div>
      <Appear at={2}>
        <PaperNote title="Aufgabe 3 — Neurophysiologie" highlight={frame >= at.exam + 8}>
          <HandLine>Welche Ionen strömen während der Depolarisation in die Zelle?</HandLine>
          <ExamChoices options={["Kalium (K⁺)", "Natrium (Na⁺)", "Chlorid (Cl⁻)"]} correct={1} answerAt={at.exam + 8} />
        </PaperNote>
      </Appear>
      <Appear at={at.exam + 18}>
        <PaperNote title="Erklärung" tilt={0.5}>
          <HandLine>Spannungsgesteuerte Na⁺-Kanäle öffnen: Na⁺ strömt ein, das Potential steigt.</HandLine>
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

export function DeJuraMedizin() {
  return (
    <SeriesVideo
      vo={vo1}
      voice={voice1}
      music={music1}
      breaks={["Gutachten,", "Zusammenhänge"]}
      scenes={DE1_SCENES}
      outro={{ tagline: <>Die Universität für deine {mark("Hosentasche")}.</>, sub: "Jura · Medizin · Wirtschaft · Technik", word: "Universität" }}
    />
  );
}

/* ═══ DE 2 — Wirtschaft & Technik ══════════════════════════════════════ */

const CASHFLOWS = [-1000, 400, 400, 400];

const DE2_SCENES: SceneDef[] = [
  {
    name: "Wirtschaft & Ingenieurmathematik",
    render: ({ f }) => (
      <SplitPanels
        panels={[
          { at: f("Wirtschaftswissenschaft"), icon: <TrendingUp size={44} />, label: "Wirtschaftswissenschaft", tint: "linear-gradient(160deg,#064E3B,#0F172A)" },
          { at: f("Ingenieurmathematik"), icon: <Sigma size={44} />, label: "Ingenieurmathematik", img: "backgrounds/general/bg-01.webp" },
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("Wirtschaftswissenschaft"), kind: "pop" }, { at: f("Ingenieurmathematik"), kind: "pop" }],
  },
  {
    name: "Präzise Werkzeuge",
    render: ({ f }) => (
      <ToolGrid
        title={<>Präzise {mark("Werkzeuge")}.</>}
        stamp="Berechnet mit dem Löser"
        stampAt={f("Studium") + 10}
        tools={[
          { label: "Investitionsrechnung", icon: <TrendingUp size={24} />, at: f("präzise") },
          { label: "Statik & Balken", icon: <Layers size={24} />, at: f("präzise") + 4 },
          { label: "Elektrotechnik", icon: <Zap size={24} />, at: f("präzise") + 8 },
          { label: "Thermodynamik", icon: <Flame size={24} />, at: f("präzise") + 12 },
          { label: "Chemie", icon: <FlaskConical size={24} />, at: f("präzise") + 16 },
          { label: "Werkstoffe", icon: <Atom size={24} />, at: f("präzise") + 20 },
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("Studium") + 10, kind: "success", volume: 0.4 }],
  },
  {
    name: "Daten — Kapitalwert",
    render: ({ f, voiceAt }) => <NpvBoardDE at={{ start: voiceAt, data: f("Daten") }} />,
    cues: ({ f }) => [{ at: f("Daten"), kind: "click" }, { at: f("Daten") + 88, kind: "success", volume: 0.4 }],
  },
  {
    name: "Gleichungen Schritt für Schritt",
    render: ({ f, voiceAt }) => <EquationsDE at={{ start: voiceAt, solve: f("löse"), exam: f("Klausuren") }} />,
    cues: ({ f }) => [{ at: f("löse"), kind: "click" }, { at: f("Klausuren"), kind: "success", volume: 0.45 }],
  },
];

function NpvBoardDE({ at }: { at: { start: number; data: number } }) {
  const frame = useCurrentFrame();
  const { npv, irr } = useMemo(() => ({ npv: solveNPV(CASHFLOWS, 0.08), irr: solveIRR(CASHFLOWS).irr[0] }), []);
  const eur = (v: number) => v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <HoersaalBoard
      lang="de"
      eyebrow="Digitaler Hörsaal · Investitionsrechnung"
      title="Kapitalwertmethode"
      professor={prof("maverick")}
      backdrop="backgrounds/general/bg-04.webp"
      scroll={interpolateScroll(frame, at.data + 40, at.data + 58, 0, 200)}
    >
      <PaperNote title="Zahlungsreihe, i = 8 %">
        <table className="w-full text-[13px]" style={{ color: "var(--board-ink)" }}>
          <thead>
            <tr className="text-[color:var(--board-muted)]">
              <th className="text-left font-medium">t</th>
              <th className="text-right font-medium">Zahlung</th>
              <th className="text-right font-medium">Barwert</th>
            </tr>
          </thead>
          <tbody>
            {npv.tabelle.map((r, i) => (
              <tr key={r.t} style={rise(frame, at.data + i * 5, 8, 8)}>
                <td>{r.t}</td>
                <td className="text-right font-mono">{eur(r.zahlung)} €</td>
                <td className="text-right font-mono">{eur(r.barwert)} €</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={rise(frame, at.data + 24)}>
          <Tex tex={String.raw`C_0 = \sum_t \frac{Z_t}{1{,}08^{\,t}} = ${eur(npv.kapitalwert).replace(",", "{,}")}\ \text{€}`} size={1} />
        </div>
      </PaperNote>
      <Appear at={at.data + 40}>
        <PaperNote title="Kapitalwert C₀(i)" tilt={0.5} highlight={frame >= at.data + 88} stamp={stampAt(frame, at.data + 88)}>
          <NpvCurve
            cashflows={CASHFLOWS}
            rate={0.08}
            irr={irr}
            draw={progress(frame, at.data + 50, at.data + 86)}
            labels={{ x: "Zinssatz i", y: "C₀ in €", irr: `interner Zins ≈ ${(irr * 100).toFixed(1).replace(".", ",")} %` }}
          />
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

function EquationsDE({ at }: { at: { start: number; solve: number; exam: number } }) {
  const frame = useCurrentFrame();
  const s0 = at.solve;
  const step = frame >= s0 + 60 ? 3 : frame >= s0 + 36 ? 2 : frame >= s0 + 12 ? 1 : 0;
  const lines = [
    { tex: String.raw`\text{I: } 2x + y = 7 \qquad \text{II: } x - y = -1`, at: 4 },
    { tex: String.raw`\text{I + II: } 3x = 6 \;\Rightarrow\; x = 2`, at: s0 + 12 },
    { tex: String.raw`\text{in II: } 2 - y = -1 \;\Rightarrow\; y = 3`, at: s0 + 36 },
    { tex: String.raw`\text{Probe: } 2\cdot 2 + 3 = 7 \;\checkmark`, at: s0 + 60 },
  ];
  return (
    <HoersaalBoard lang="de" eyebrow="Digitaler Hörsaal · Ingenieurmathematik" title="Lineares Gleichungssystem" professor={prof("genius")} backdrop="backgrounds/general/bg-05.webp">
      <div className="w-full pr-24">
        <StepChecklist steps={["Addieren", "Einsetzen", "Probe"].map((label, i) => ({ label, done: i < step }))} />
      </div>
      <PaperNote title="Additionsverfahren" highlight={frame >= at.exam} stamp={stampAt(frame, at.exam)}>
        {lines.map((l) => (
          <div key={l.tex} style={{ opacity: progress(frame, l.at, l.at + 6) }}>
            <Tex tex={l.tex} reveal={progress(frame, l.at, l.at + 16)} size={1} />
          </div>
        ))}
      </PaperNote>
      <Appear at={at.exam - 6}>
        <PaperNote title="Klausurtipp" tilt={0.5}>
          <HandLine>Immer die Probe machen — sie kostet zehn Sekunden und rettet Punkte.</HandLine>
        </PaperNote>
      </Appear>
    </HoersaalBoard>
  );
}

export function DeWirtschaftTechnik() {
  return (
    <SeriesVideo
      vo={vo2}
      voice={voice2}
      music={music2}
      breaks={["Daten,"]}
      scenes={DE2_SCENES}
      signatureInVoice={false}
      outro={{ tagline: <>Präzise Werkzeuge für {mark("jedes Studium")}.</>, sub: "Wirtschaft · Mathematik · Technik" }}
    />
  );
}

/* ═══ DE 3 — Alle Fächer ═══════════════════════════════════════════════ */

const DE3_SCENES: SceneDef[] = [
  {
    name: "Alle Fächer",
    render: ({ f }) => <SubjectsDE at={{ geist: f("Geisteswissenschaften"), ing: f("Ingenieurwesen"), med: f("Medizin") }} />,
    cues: ({ f }) => [{ at: f("Geisteswissenschaften"), kind: "pop" }, { at: f("Ingenieurwesen"), kind: "pop" }, { at: f("Medizin"), kind: "pop" }],
  },
  {
    name: "TRED passt sich an — die Professoren",
    render: ({ voiceAt }) => <ProfRingDE at={voiceAt} />,
    cues: ({ voiceAt }) => [0, 1, 2, 3].map((i) => ({ at: voiceAt + i * 6, kind: "pop" as const, volume: 0.3 })),
  },
  {
    name: "Wähle deinen Professor",
    enter: "slide",
    render: ({ f }) => <ProfGrid profs={PROFESSOR_IDS.map((id) => prof(id))} lang="de" title="Wähle deinen Professor." chosen="sensei" chooseAt={f("Professor")} />,
    cues: ({ f }) => [{ at: f("Professor"), kind: "click" }],
  },
  {
    name: "Dokumente hochladen",
    render: ({ f }) => (
      <DocStack
        title={<>Deine eigenen {mark("Dokumente")}.</>}
        doneLabel="Hochgeladen"
        docs={[
          { name: "Kant_Kritik_Seminar.pdf", meta: "PDF · Philosophie", at: f("lade") },
          { name: "Anatomie_Vorlesung_5.pdf", meta: "PDF · Medizin", at: f("lade") + 16 },
          { name: "Mathe_II_Übungsblatt.pdf", meta: "PDF · Ingenieurwesen", at: f("lade") + 32 },
        ]}
      />
    ),
    cues: ({ f }) => [{ at: f("lade") + 30, kind: "success", volume: 0.25 }, { at: f("lade") + 62, kind: "success", volume: 0.25 }],
  },
  {
    name: "Dein Lernstil",
    enter: "wipe",
    render: ({ f, voiceAt }) => (
      <StylePicker
        lang="de"
        highlights={[
          { style: "visual", at: voiceAt + 6 },
          { style: "auditory", at: voiceAt + 22 },
          { style: "interactive", at: voiceAt + 38 },
        ]}
        chosen={{ style: "interactive", at: f("funktioniert") }}
      />
    ),
    cues: ({ f, voiceAt }) => [
      { at: voiceAt + 6, kind: "click" },
      { at: voiceAt + 22, kind: "click" },
      { at: voiceAt + 38, kind: "click" },
      { at: f("funktioniert"), kind: "success", volume: 0.35 },
    ],
  },
];

function SubjectsDE({ at }: { at: { geist: number; ing: number; med: number } }) {
  const frame = useCurrentFrame();
  const later = at.med + 14;
  return (
    <AbsoluteFill style={{ background: `radial-gradient(ellipse 80% 50% at 50% 40%, rgb(234 179 8 / 0.13), transparent 70%), ${NIGHT}`, alignItems: "center", paddingTop: 90, gap: 22 }}>
      <h1 className="font-display text-center" style={{ ...rise(frame, 2), margin: 0, color: "#FFFFFF", fontSize: 40, lineHeight: 1.08, fontWeight: 600 }}>
        Egal, was du <span style={{ color: YELLOW }}>studierst.</span>
      </h1>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, transform: "scale(0.92)", transformOrigin: "top center" }}>
        <SubjectTile icon={<BookOpen size={48} />} label="Geisteswiss." at={at.geist} />
        <SubjectTile icon={<Cog size={48} />} label="Ingenieurwesen" at={at.ing} />
        <SubjectTile icon={<Stethoscope size={48} />} label="Medizin" at={at.med} />
        <SubjectTile icon={<Scale size={48} />} label="Jura" at={later} />
        <SubjectTile icon={<TrendingUp size={48} />} label="Wirtschaft" at={later + 4} />
        <SubjectTile icon={<Code2 size={48} />} label="Informatik" at={later + 8} />
      </div>
    </AbsoluteFill>
  );
}

function ProfRingDE({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const profs = PROFESSOR_IDS.map((id) => prof(id));
  const pos = [
    { x: -130, y: -170 },
    { x: 130, y: -170 },
    { x: -130, y: 170 },
    { x: 130, y: 170 },
  ];
  const center = pop(frame, 2);
  return (
    <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 50%, rgb(234 179 8 / 0.2), transparent 55%), ${NIGHT}`, alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: 120, ...rise(frame, at) }} className="font-display">
        <span style={{ color: "#FFFFFF", fontSize: 38, fontWeight: 600 }}>
          TRED passt sich <span style={{ color: YELLOW }}>dir</span> an.
        </span>
      </div>
      <div style={{ transform: `scale(${center})`, width: 130, height: 130, borderRadius: 34, background: "#FDFBF7", display: "flex", alignItems: "center", justifyContent: "center", color: "#1A1A1A" }}>
        <LogoMark className="size-24" />
      </div>
      {profs.map((p, i) => {
        const k = pop(frame, at + i * 6);
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: `translate(-50%, -50%) translate(${pos[i].x * k}px, ${pos[i].y * k}px) scale(${0.45 + 0.25 * k})`,
              opacity: Math.min(1, k * 1.5),
            }}
          >
            <ProfessorHalo professor={p} size="lg" online={false} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

export function DeAlleFaecher() {
  return (
    <SeriesVideo
      vo={vo3}
      voice={voice3}
      music={music3}
      breaks={["Medizin:", "Professor,", "hoch"]}
      scenes={DE3_SCENES}
      outro={{ tagline: <>Deine persönliche {mark("Universität")}.</>, sub: "Geisteswissenschaften · Ingenieurwesen · Medizin", word: "Universität" }}
    />
  );
}
