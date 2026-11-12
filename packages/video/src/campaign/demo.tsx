import { useMemo, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { BookOpen, Check, Clapperboard, Flame, Layers, Loader2, Mic, Pause, Play, Search, Sparkles, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { PaperNote, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { parseBeamPayload, renderBeamSvg } from "@/lib/beam-svg";
import { solveMechanicsSafe } from "../../../web/src/api/lib/mechanics-solver";
import { payloadToProblem } from "../../../web/src/api/lib/beam-tool";
import { Appear, HoersaalBoard, Tex, UI } from "../promo/board";
import { CREAM, INK, NIGHT, YELLOW, clamp, easeOut, interpolateScroll, pop, progress, rise } from "../promo/kit";
import { ProfGrid } from "../promo/parts";
import { CampaignVideo, type CampCtx, type CampScene } from "./engine";
import { BG, mark } from "./parts";
import { BEAM, BeamBoard, PROFS, prof, type Lang, type Outro } from "./videos";
import circuit from "../assets/circuit-de.svg";
import vo1en from "../assets/vo-d1-en.json";
import vo1de from "../assets/vo-d1-de.json";
import vo2en from "../assets/vo-d2-en.json";
import vo2de from "../assets/vo-d2-de.json";
import vo3en from "../assets/vo-d3-en.json";
import vo3de from "../assets/vo-d3-de.json";
import vo4en from "../assets/vo-d4-en.json";
import vo4de from "../assets/vo-d4-de.json";
import vo5en from "../assets/vo-d5-en.json";
import vo5de from "../assets/vo-d5-de.json";
import voice1en from "../assets/vo-d1-en.mp3";
import voice1de from "../assets/vo-d1-de.mp3";
import voice2en from "../assets/vo-d2-en.mp3";
import voice2de from "../assets/vo-d2-de.mp3";
import voice3en from "../assets/vo-d3-en.mp3";
import voice3de from "../assets/vo-d3-de.mp3";
import voice4en from "../assets/vo-d4-en.mp3";
import voice4de from "../assets/vo-d4-de.mp3";
import voice5en from "../assets/vo-d5-en.mp3";
import voice5de from "../assets/vo-d5-de.mp3";
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
 * Campagne V3 « démonstration » — 5 concepts × EN/DE, 30 s, 9:16 (2026-11-11).
 *
 * La voix décrit ce que l'écran montre : on tape, on clique, le tableau
 * s'ouvre. Un curseur animé fait les gestes. Le tableau (Hörsaal, KaTeX,
 * schéma du solveur de poutre) est fait des vrais composants de l'app ;
 * l'écran de chat, le lecteur vidéo et le tableau de bord sont des maquettes
 * dans la charte de l'app.
 *
 * Les textes font 40 à 55 mots : la voix est répartie sur les 30 s avec des
 * pauses plus longues (`maxGap`), pendant lesquelles l'écran agit.
 */

const DEMO_MAX_GAP = 4;

/** Titre de la carte d'ouverture, par concept. */
const INTRO: Record<Lang, ReactNode[]> = {
  en: [<>How TRED {mark("works")}.</>, <>Exact {mark("diagrams")}.</>, <>Explain {mark("as video")}.</>, <>An {mark("interactive")} class.</>, <>The {mark("full picture")}.</>],
  de: [<>So {mark("funktioniert")} TRED.</>, <>Exakte {mark("Diagramme")}.</>, <>Als {mark("Video")} erklären.</>, <>Eine {mark("interaktive")} Klasse.</>, <>Das {mark("Gesamtbild")}.</>],
};

/* ── Le curseur ───────────────────────────────────────────────────────── */

type CursorKey = { at: number; x: number; y: number; click?: boolean };

/** Un pointeur qui se déplace d'un point à l'autre et clique (onde + appui). */
export function Cursor({ keys, hideAt }: { keys: CursorKey[]; hideAt?: number }) {
  const frame = useCurrentFrame();
  let x = keys[0].x;
  let y = keys[0].y;
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1];
    const b = keys[i];
    // Le curseur repose, puis rejoint sa cible dans les 16 dernières images.
    const start = Math.max(a.at, b.at - 16);
    if (frame >= start) {
      const k = interpolate(frame, [start, b.at], [0, 1], { ...clamp, easing: easeOut });
      x = a.x + (b.x - a.x) * k;
      y = a.y + (b.y - a.y) * k;
    }
  }
  const clicks = keys.filter((k) => k.click);
  const last = clicks.filter((k) => frame >= k.at).pop();
  const since = last ? frame - last.at : 99;
  const press = since < 6 ? 1 - 0.18 * Math.sin((since / 6) * Math.PI) : 1;
  const opacity = progress(frame, keys[0].at - 8, keys[0].at) * (hideAt === undefined ? 1 : 1 - progress(frame, hideAt, hideAt + 8));
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity, zIndex: 50 }}>
      {last && since < 16 && (
        <div
          style={{
            position: "absolute",
            left: last.x - 34,
            top: last.y - 34,
            width: 68,
            height: 68,
            borderRadius: 34,
            border: `4px solid ${YELLOW}`,
            background: "rgb(234 179 8 / 0.25)",
            opacity: 1 - since / 16,
            transform: `scale(${0.3 + 0.9 * (since / 16)})`,
          }}
        />
      )}
      <svg width={44} height={52} viewBox="0 0 24 30" style={{ position: "absolute", left: x - 5, top: y - 3, transform: `scale(${press})`, transformOrigin: "5px 3px", filter: "drop-shadow(0 6px 10px rgb(0 0 0 / 0.55))" }}>
        <path d="M3 2 L3 24 L9 18.6 L13.2 28 L17 26.3 L12.9 17.2 L21 17.2 Z" fill="#FFFFFF" stroke="#0F172A" strokeWidth={1.8} strokeLinejoin="round" />
      </svg>
    </AbsoluteFill>
  );
}

/* ── L'écran de chat ──────────────────────────────────────────────────── */

/** Position du champ et du bouton d'envoi (pour le curseur). */
export const INPUT = { x: 170, y: 905 };
export const SEND = { x: 472, y: 905 };

export function ChatScreen({ lang, typed, sent, sentAt, hint }: { lang: Lang; typed: string; sent?: string; sentAt?: number; hint: string }) {
  const frame = useCurrentFrame();
  const ui = UI[lang];
  const at = sentAt ?? 0;
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>
      <Img src={staticFile(BG("aerospace", 4))} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.06 + frame * 0.0004})` }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgb(7 11 20 / 0.82), rgb(11 18 34 / 0.55) 45%, rgb(7 11 20 / 0.8))" }} />
      <div style={{ position: "absolute", top: 54, left: 24, right: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo markClassName="h-8 text-white" />
        <span style={{ padding: "6px 14px", borderRadius: 999, background: "rgb(255 255 255 / 0.12)", border: "1px solid rgb(255 255 255 / 0.2)", color: "#FFF", fontSize: 14, fontWeight: 600 }}>Technische Mechanik 2</span>
      </div>
      {!sent && (
        <div style={{ position: "absolute", top: 330, left: 36, right: 36, textAlign: "center" }}>
          <h2 className="font-display" style={{ ...rise(frame, 4), margin: 0, color: "#FFF", fontSize: 40, fontWeight: 650, lineHeight: 1.1 }}>{hint}</h2>
        </div>
      )}
      {sent && (
        <>
          <div style={{ ...rise(frame, at, 24, 8), position: "absolute", top: 190, right: 24, maxWidth: 400, padding: "14px 18px", borderRadius: "22px 22px 6px 22px", background: YELLOW, color: NIGHT, fontSize: 21, fontWeight: 600, lineHeight: 1.3, boxShadow: "0 18px 40px -18px rgb(0 0 0 / 0.8)" }}>{sent}</div>
          <div style={{ ...rise(frame, at + 10), position: "absolute", top: 330, left: 24, display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: "22px 22px 22px 6px", background: "rgb(255 255 255 / 0.14)", border: "1px solid rgb(255 255 255 / 0.2)", color: "#FFF", fontSize: 18, fontWeight: 600, backdropFilter: "blur(12px)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 5, background: YELLOW, opacity: 0.5 + 0.5 * Math.sin(frame / 3) }} />
            {ui.writing}
          </div>
        </>
      )}
      <div style={{ position: "absolute", left: 18, right: 18, top: INPUT.y - 30, height: 60, display: "flex", alignItems: "center", gap: 10, padding: "0 10px 0 18px", borderRadius: 22, background: "rgb(255 255 255 / 0.92)", boxShadow: "0 24px 50px -20px rgb(0 0 0 / 0.9)" }}>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", fontSize: typed ? 15.5 : 18, color: typed ? INK : "#64748B", fontWeight: typed ? 600 : 400 }}>
          {typed || ui.ask}
          {typed && <span style={{ opacity: frame % 16 < 8 ? 1 : 0 }}>|</span>}
        </span>
        <span style={{ padding: "11px 18px", borderRadius: 16, background: YELLOW, color: NIGHT, fontSize: 16, fontWeight: 800 }}>{ui.send}</span>
      </div>
    </AbsoluteFill>
  );
}

/* ── Le tableau du solveur : le schéma de poutre, tracé par le vrai solveur ─ */

const BEAM_PAYLOAD = {
  v: 1,
  problem: {
    length: 4,
    supports: [
      { x: 0, kind: "einspannung", name: "A" },
      { x: 4, kind: "loslager", name: "B" },
    ],
    pointLoads: [],
    distributedLoads: [{ from: 0, to: 4, q: 2000 }],
    pointMoments: [],
  },
  units: { length: "m", force: "kN" },
};

export function useBeamSvg() {
  return useMemo(() => {
    const payload = parseBeamPayload(JSON.stringify(BEAM_PAYLOAD));
    if (!payload) throw new Error("Poutre de démonstration invalide");
    const r = solveMechanicsSafe(payloadToProblem(payload.problem));
    if (!r.ok) throw new Error(`Le solveur a refusé la poutre : ${r.error}`);
    return renderBeamSvg(payload, r);
  }, []);
}

const SOLVER = {
  en: { eyebrow: "Digitaler Hörsaal · Technische Mechanik", title: "Statically indeterminate beam", note: "Fixed support A · roller B", steps: ["Sketch", "Q(x)", "M(x)"], circuitTitle: "Series-parallel circuit", circuitNote: "Step 1 — circuit", circuitEyebrow: "Digitaler Hörsaal · Elektrotechnik" },
  de: { eyebrow: "Digitaler Hörsaal · Technische Mechanik", title: "Statisch unbestimmt", note: "Einspannung A · Loslager B", steps: ["Skizze", "Q(x)", "M(x)"], circuitTitle: "Gemischte Schaltung", circuitNote: "Schritt 1 — Schaltung", circuitEyebrow: "Digitaler Hörsaal · Elektrotechnik" },
};

/** `at` : le croquis, Q(x) puis M(x) se tracent à ces images. `stampAt` : le tampon du solveur. */
export function SolverBeamBoard({ lang, at, stampAt, zoom = 0 }: { lang: Lang; at: { draws: number; calc: number; explains: number }; stampAt?: number; zoom?: number }) {
  const frame = useCurrentFrame();
  const svg = useBeamSvg();
  const t = SOLVER[lang];
  const st = BEAM[lang].stamp;
  const reveal = interpolate(frame, [at.draws, at.draws + 14, at.calc, at.calc + 14, at.explains, at.explains + 18], [0, 0.38, 0.38, 0.66, 0.66, 1], { ...clamp, easing: easeOut });
  const step = frame >= at.explains + 18 ? 3 : frame >= at.calc + 14 ? 2 : frame >= at.draws + 14 ? 1 : 0;
  const stamped = stampAt !== undefined && frame >= stampAt;
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + zoom * progress(frame, at.draws, at.explains + 40)})`, transformOrigin: "42% 58%" }}>
      <HoersaalBoard lang={lang} eyebrow={t.eyebrow} title={t.title} professor={prof("genius")} backdrop="backgrounds/general/bg-01.webp">
        <div className="w-full pr-24">
          <StepChecklist steps={t.steps.map((label, i) => ({ label, done: i < step }))} />
        </div>
        <Appear at={Math.max(0, at.draws - 8)}>
          <PaperNote title={t.note} highlight={stamped} stamp={stamped ? <span style={{ transform: `scale(${2 - pop(frame, stampAt!)})`, display: "inline-flex" }}><SolverStamp label={st[0]} sublabel={st[1]} /></span> : undefined}>
            <div className="[&_svg]:h-auto [&_svg]:w-full" style={{ clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)` }} dangerouslySetInnerHTML={{ __html: svg }} />
          </PaperNote>
        </Appear>
      </HoersaalBoard>
    </AbsoluteFill>
  );
}

/** Le schéma électrique (schemdraw, symboles DIN) qui se trace de gauche à droite. */
function CircuitBoard({ lang, at, zoom = 0 }: { lang: Lang; at: number; zoom?: number }) {
  const frame = useCurrentFrame();
  const t = SOLVER[lang];
  const wipe = progress(frame, at, at + 36);
  return (
    <AbsoluteFill style={{ transform: `scale(${1 + zoom * progress(frame, at, at + 70)})`, transformOrigin: "40% 45%" }}>
      <HoersaalBoard lang={lang} eyebrow={t.circuitEyebrow} title={t.circuitTitle} professor={prof("maverick")} backdrop="backgrounds/electrical/electrical-01.webp">
        <Appear at={Math.max(0, at - 8)}>
          <PaperNote title={t.circuitNote}>
            <div style={{ clipPath: `inset(-5% ${(1 - wipe) * 100}% -5% 0)` }}>
              <Img src={circuit} style={{ width: "100%", height: "auto" }} />
            </div>
          </PaperNote>
        </Appear>
        <Appear at={at + 40}>
          <PaperNote title={BEAM[lang].steps[3]} tilt={0.5}>
            <Tex tex={String.raw`I_1 = \frac{12\,\mathrm{V}}{2\,\Omega + 2\,\Omega} = 3\,\mathrm{A}`} reveal={progress(frame, at + 44, at + 64)} size={1} />
          </PaperNote>
        </Appear>
      </HoersaalBoard>
    </AbsoluteFill>
  );
}

/* ── Textes des démonstrations ────────────────────────────────────────── */

const D = {
  en: {
    hint: "What are you stuck on?",
    question: "How do I find the support forces of this beam?",
    question2: "Draw the shear and moment diagram of this beam.",
    chips: ["Explain as video", "Find a video", "Quiz"],
    preparing: "TRED is preparing your personal video …",
    stages: ["Writing the script", "Recording the voice"],
    playerTitle: "Beam on two supports",
    badges: ["Natural voice", "Visual examples", "Step by step"],
    save: "Save to my dashboard",
    saved: "Saved",
    myVideos: "My explainer videos",
    today: "Today",
    quizTitle: "Your turn: support force A?",
    quizGiven: String.raw`q = 2\,\mathrm{kN/m},\quad l = 4\,\mathrm{m}`,
    options: ["8 kN", "4 kN", "2 kN"],
    mistakeTitle: "Where it went wrong",
    mistake: "8 kN is the whole load. Two supports share it.",
    profTitle: "Choose your professor",
    greeting: "Hi Lena",
    ask: "Ask a question",
    board: "Interactive whiteboard",
    progressTitle: "Your progress",
    stats: [["7", "day streak"], ["3", "cards due"], ["68%", "exam ready"]],
    subjects: "Subjects",
    fields: ["Law", "Medicine", "Aerospace Engineering"],
    outro: {
      d1: { tagline: <>Your private tutor, {mark("in your browser")}.</>, sub: "Type · send · the whiteboard opens", word: "Try" } as Outro,
      d2: { tagline: <>Engineering, {mark("made visual")}.</>, sub: "Deterministic solvers · exact diagrams", word: "engineering" } as Outro,
      d3: { tagline: <>Your problem, {mark("as a private lesson")}.</>, sub: "Explain as video · saved to your dashboard" } as Outro,
      d4: { tagline: <>Learning that {mark("adapts to you")}.</>, sub: "Questions back · your own professor", word: "Learning" } as Outro,
      d5: { tagline: <>The ultimate university {mark("in your pocket")}.</>, sub: "Law · Medicine · Engineering · and more", word: "university" } as Outro,
    },
  },
  de: {
    hint: "Wobei hängst du fest?",
    question: "Wie finde ich die Lagerkräfte dieses Balkens?",
    question2: "Zeichne Querkraft- und Momentenverlauf dieses Balkens.",
    chips: ["Als Video erklären", "Video dazu finden", "Quiz"],
    preparing: "TRED bereitet dein persönliches Video vor …",
    stages: ["Drehbuch wird geschrieben", "Stimme wird aufgenommen"],
    playerTitle: "Balken auf zwei Lagern",
    badges: ["Natürliche Stimme", "Visuelle Beispiele", "Schritt für Schritt"],
    save: "Im Dashboard speichern",
    saved: "Gespeichert",
    myVideos: "Meine Erklärvideos",
    today: "Heute",
    quizTitle: "Du bist dran: Lagerkraft A?",
    quizGiven: String.raw`q = 2\,\mathrm{kN/m},\quad l = 4\,\mathrm{m}`,
    options: ["8 kN", "4 kN", "2 kN"],
    mistakeTitle: "Hier lag der Fehler",
    mistake: "8 kN ist die gesamte Last. Zwei Lager teilen sie sich.",
    profTitle: "Wähle deinen Professor",
    greeting: "Hallo Lena",
    ask: "Frage stellen",
    board: "Interaktive Tafel",
    progressTitle: "Dein Fortschritt",
    stats: [["7", "Tage in Folge"], ["3", "Karten fällig"], ["68%", "klausurbereit"]],
    subjects: "Fächer",
    fields: ["Jura", "Medizin", "Luft- und Raumfahrt"],
    outro: {
      d1: { tagline: <>Dein Privatlehrer, {mark("im Browser")}.</>, sub: "Tippen · senden · die Tafel öffnet sich", word: "Probier" } as Outro,
      d2: { tagline: <>Berechnet, {mark("nicht geraten")}.</>, sub: "Deterministische Solver · exakte Diagramme" } as Outro,
      d3: { tagline: <>Dein Problem, {mark("als Privatstunde")}.</>, sub: "Als Video erklären · im Dashboard gespeichert" } as Outro,
      d4: { tagline: <>Lernen, das {mark("sich dir anpasst")}.</>, sub: "Rückfragen · dein eigener Professor" } as Outro,
      d5: { tagline: <>Die Universität {mark("für die Hosentasche")}.</>, sub: "Jura · Medizin · Ingenieurwesen · und mehr", word: "Universität" } as Outro,
    },
  },
};

/* ═══ Démo 1 — Le parcours : taper, envoyer, le tableau s'ouvre ═════════ */

function Workflow({ lang, f, w }: { lang: Lang; f: CampCtx["f"]; w: { type: string; send: string; boom: string; draws: string; step: string } }) {
  const frame = useCurrentFrame();
  const t = D[lang];
  const type0 = f(w.type);
  const send = f(w.send);
  const boom = Math.max(f(w.boom), send + 18);
  const draws = f(w.draws);
  const step = f(w.step);
  const typed = Math.floor(progress(frame, type0, send - 14) * t.question.length);
  const isSent = frame >= send + 3;
  const open = progress(frame, boom, boom + 14);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: `circle(${open * 135}% at 87% 94%)` }}>
        <BeamBoard lang={lang} at={Math.min(draws - 10, boom + 24)} step={(fr) => (fr < step ? (fr > draws ? 1 : 0) : Math.min(4, 2 + Math.floor((fr - step) / 16)))} />
      </AbsoluteFill>
      {open < 1 && (
        <AbsoluteFill style={{ opacity: 1 - open }}>
          <ChatScreen lang={lang} hint={t.hint} typed={isSent ? "" : t.question.slice(0, typed)} sent={isSent ? t.question : undefined} sentAt={send + 3} />
        </AbsoluteFill>
      )}
      <Cursor
        keys={[
          { at: Math.max(4, type0 - 30), x: 360, y: 600 },
          { at: type0 - 4, x: INPUT.x, y: INPUT.y, click: true },
          { at: send, x: SEND.x, y: SEND.y, click: true },
        ]}
        hideAt={boom + 6}
      />
    </AbsoluteFill>
  );
}

const d1 = (lang: Lang, span: number, w: { type: string; send: string; boom: string; draws: string; step: string }): CampScene[] => [
  {
    name: "Type the question, hit send, the whiteboard opens",
    span,
    render: ({ f }) => <Workflow lang={lang} f={f} w={w} />,
    cues: ({ f }) => [
      ...[0, 5, 10, 15, 20, 25, 30].map((d) => ({ at: f(w.type) + d, kind: "type" as const, volume: 0.28 })),
      { at: f(w.type) - 4, kind: "click" as const },
      { at: f(w.send), kind: "click" as const, volume: 0.6 },
      { at: Math.max(f(w.boom), f(w.send) + 18), kind: "success" as const, volume: 0.45 },
      ...[0, 16, 32].map((d) => ({ at: f(w.step) + d, kind: "pop" as const, volume: 0.3 })),
    ],
  },
];

/* ═══ Démo 2 — Les schémas : le solveur trace le diagramme exact ════════ */

const d2 = (lang: Lang, w: { watch: string; solvers: string; diagram: string; component: string; accuracy: string }): CampScene[] => {
  const t = D[lang];
  const scenes: CampScene[] = [
    {
      name: "Ask about a beam — send",
      span: 2,
      render: ({ f }) => <AskAndSend lang={lang} text={t.question2} hint={t.hint} send={f(w.watch) + 4} />,
      cues: ({ f }) => [...[10, 16, 22, 28, 34].map((at) => ({ at, kind: "type" as const, volume: 0.25 })), { at: f(w.watch) + 4, kind: "click" as const, volume: 0.6 }],
    },
    {
      name: "The solver draws the exact diagram",
      enter: "zoom",
      render: ({ f, voiceAt }) => <SolverBeamBoard lang={lang} at={{ draws: voiceAt + 8, calc: f(w.solvers), explains: f(w.diagram) }} zoom={0.16} />,
      cues: ({ f, voiceAt }) => [{ at: voiceAt + 8, kind: "pop" as const, volume: 0.3 }, { at: f(w.solvers), kind: "pop" as const, volume: 0.3 }, { at: f(w.diagram), kind: "pop" as const, volume: 0.3 }],
    },
    {
      name: "Every component, every force",
      enter: "slide",
      render: ({ f }) => <CircuitBoard lang={lang} at={Math.max(6, f(w.component) - 10)} zoom={0.14} />,
      cues: ({ f }) => [{ at: f(w.component), kind: "pop" as const, volume: 0.35 }],
    },
    {
      name: "No hallucinations — computed by the solver",
      span: 2,
      enter: "fade",
      render: ({ f }) => <SolverBeamBoard lang={lang} at={{ draws: -80, calc: -60, explains: -40 }} stampAt={f(w.accuracy)} />,
      cues: ({ f }) => [{ at: f(w.accuracy), kind: "success" as const, volume: 0.45 }],
    },
  ];
  if (lang === "en") {
    scenes.push({
      name: "The exact steps",
      enter: "fade",
      render: ({ voiceAt }) => <BeamBoard lang={lang} at={-60} step={(fr) => Math.min(4, 1 + Math.floor(Math.max(0, fr - voiceAt) / 14))} />,
      cues: ({ voiceAt }) => [1, 2, 3].map((i) => ({ at: voiceAt + i * 14, kind: "pop" as const, volume: 0.3 })),
    });
  }
  return scenes;
};

/** On tape la question, le curseur clique sur « Envoyer », la bulle part. */
function AskAndSend({ lang, text, hint, send }: { lang: Lang; text: string; hint: string; send: number }) {
  const frame = useCurrentFrame();
  const isSent = frame >= send + 3;
  const typed = text.slice(0, Math.floor(progress(frame, 24, send - 14) * text.length));
  return (
    <AbsoluteFill>
      <ChatScreen lang={lang} hint={hint} typed={isSent ? "" : typed} sent={isSent ? text : undefined} sentAt={send + 3} />
      <Cursor keys={[{ at: 6, x: 380, y: 620 }, { at: 22, x: INPUT.x, y: INPUT.y, click: true }, { at: send, x: SEND.x, y: SEND.y, click: true }]} />
    </AbsoluteFill>
  );
}

/* ═══ Démo 3 — « Als Video erklären » ══════════════════════════════════ */

const CHIP = { x: 118, y: 846 };
const PLAYER_TOP = 118;
// Le bouton et la carte « sauvegardé » restent au-dessus des sous-titres.
const SAVE = { x: 270, y: 618 };

export function VideoFeature({ lang, f, dur, w, diagram = false }: { lang: Lang; f: CampCtx["f"]; dur: number; diagram?: boolean; w: { button: string; click: string; generates: string; voice: string; visual: string; step: [string, number]; saves: string } }) {
  const frame = useCurrentFrame();
  const t = D[lang];
  const button = f(w.button);
  const click = f(w.click) + 6;
  const playerAt = f(w.generates) + 34;
  const save = f(w.saves) + 8;
  const overlay = progress(frame, click + 4, click + 12);
  const player = pop(frame, playerAt);
  const isSaved = frame >= save + 3;
  const played = progress(frame, playerAt, dur);
  const stage = frame >= click + 12 + (playerAt - click - 12) / 2 ? 1 : 0;
  const badgeAt = [f(w.voice), f(w.visual), f(...w.step)];
  const glow = frame >= button && frame < click ? 0.5 + 0.5 * Math.sin((frame - button) / 3) : 0;
  // Campagne V4 : la vidéo générée montre le schéma, qui se trace de gauche à droite.
  const beamSvg = useBeamSvg();
  return (
    <AbsoluteFill>
      <BeamBoard lang={lang} at={-80} step={() => 4} />
      {/* Les actions sous le tableau, comme dans l'app. */}
      <div style={{ position: "absolute", left: 16, right: 16, top: CHIP.y - 22, display: "flex", gap: 8 }}>
        {t.chips.map((label, i) => {
          const Icon = [Clapperboard, Search, Sparkles][i];
          const hot = i === 0;
          return (
            <span
              key={label}
              style={{
                ...rise(frame, 6 + i * 4),
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                padding: "11px 14px",
                borderRadius: 999,
                background: hot ? YELLOW : "rgb(255 255 255 / 0.9)",
                color: NIGHT,
                fontSize: 15,
                fontWeight: 700,
                whiteSpace: "nowrap",
                boxShadow: hot ? `0 0 0 ${4 + glow * 7}px rgb(234 179 8 / ${0.25 + glow * 0.3}), 0 14px 30px -12px rgb(0 0 0 / 0.7)` : "0 14px 30px -12px rgb(0 0 0 / 0.7)",
              }}
            >
              <Icon size={17} />
              {label}
            </span>
          );
        })}
      </div>
      {/* La génération, puis le lecteur. */}
      <AbsoluteFill style={{ background: `rgb(7 11 20 / ${0.78 * overlay})` }} />
      {frame >= click + 4 && frame < playerAt + 8 && (
        <div style={{ position: "absolute", left: 40, right: 40, top: 340, opacity: overlay * (1 - progress(frame, playerAt - 4, playerAt + 6)), padding: "28px 24px", borderRadius: 28, background: CREAM, color: INK, textAlign: "center", boxShadow: "0 40px 80px -30px rgb(0 0 0 / 0.9)" }}>
          <Loader2 size={54} color={YELLOW} style={{ transform: `rotate(${frame * 14}deg)` }} />
          <p className="font-display" style={{ margin: "14px 0 16px", fontSize: 25, fontWeight: 650, lineHeight: 1.2 }}>{t.preparing}</p>
          {t.stages.map((label, i) => (
            <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "5px 0", fontSize: 17, color: i <= stage ? INK : "#94A3B8", fontWeight: i === stage ? 700 : 500 }}>
              {i < stage ? <Check size={18} color="#16A34A" strokeWidth={3} /> : <span style={{ width: 9, height: 9, borderRadius: 5, background: i === stage ? YELLOW : "#CBD5E1" }} />}
              {label} …
            </div>
          ))}
        </div>
      )}
      {frame >= playerAt && (
        <div style={{ position: "absolute", left: 24, right: 24, top: PLAYER_TOP, opacity: Math.min(1, player * 1.5), transform: `scale(${0.9 + 0.1 * player})` }}>
          <div style={{ borderRadius: 26, overflow: "hidden", background: "#0B1222", border: "1px solid rgb(255 255 255 / 0.16)", boxShadow: "0 50px 90px -30px rgb(0 0 0 / 0.95)" }}>
            <div style={{ position: "relative", height: 280, background: `radial-gradient(ellipse 80% 70% at 50% 40%, #1E2B4D, #0B1222)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <span style={{ position: "absolute", top: 14, left: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: "rgb(234 179 8 / 0.18)", color: YELLOW, fontSize: 12, fontWeight: 700 }}>
                <Mic size={13} /> TRED
              </span>
              <p className="font-display" style={{ margin: 0, color: "#FFF", fontSize: 27, fontWeight: 650 }}>{t.playerTitle}</p>
              {diagram ? (
                <div style={{ width: 400, height: 146, padding: "6px 10px", borderRadius: 16, background: CREAM, overflow: "hidden" }}>
                  <div className="[&_svg]:h-auto [&_svg]:w-full" style={{ clipPath: `inset(0 ${(1 - progress(frame, playerAt + 12, playerAt + 70)) * 100}% 0 0)` }} dangerouslySetInnerHTML={{ __html: beamSvg }} />
                </div>
              ) : (
                <div style={{ padding: "12px 20px", borderRadius: 16, background: CREAM, color: INK }}>
                  <Tex tex={String.raw`A = B = \frac{q\,l}{2} = 4\,\mathrm{kN}`} reveal={progress(frame, playerAt + 14, playerAt + 50)} size={1.15} />
                </div>
              )}
              <span style={{ position: "absolute", bottom: 14, left: 16, width: 44, height: 44, borderRadius: 22, background: YELLOW, display: "grid", placeItems: "center" }}>
                <Pause size={22} color={NIGHT} fill={NIGHT} />
              </span>
            </div>
            <div style={{ padding: "12px 16px 14px", display: "flex", alignItems: "center", gap: 12 }}>
              <Play size={18} color="#FFF" fill="#FFF" />
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgb(255 255 255 / 0.18)" }}>
                <div style={{ width: `${4 + played * 38}%`, height: "100%", borderRadius: 3, background: YELLOW }} />
              </div>
              <span style={{ color: "#CBD5E1", fontSize: 13, fontFamily: "ui-monospace, monospace" }}>0:{String(2 + Math.floor(played * 32)).padStart(2, "0")} / 1:24</span>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 7, marginTop: 12 }}>
            {t.badges.map((b, i) => (
              <span key={b} style={{ opacity: Math.min(1, pop(frame, badgeAt[i]) * 1.6), transform: `scale(${0.8 + 0.2 * pop(frame, badgeAt[i])})`, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 999, background: "rgb(255 255 255 / 0.12)", border: "1px solid rgb(255 255 255 / 0.22)", color: "#FFF", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>
                <Check size={15} color={YELLOW} strokeWidth={3} /> {b}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginTop: 0, position: "absolute", left: 0, right: 0, top: SAVE.y - PLAYER_TOP - 26 }}>
            <span style={{ ...rise(frame, playerAt + 16), display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 22px", borderRadius: 18, background: isSaved ? "#16A34A" : YELLOW, color: isSaved ? "#FFF" : NIGHT, fontSize: 18, fontWeight: 800, boxShadow: "0 20px 40px -18px rgb(0 0 0 / 0.9)" }}>
              {isSaved ? <Check size={19} strokeWidth={3} /> : <Layers size={19} />}
              {isSaved ? t.saved : t.save}
            </span>
          </div>
          {isSaved && (
            <div style={{ ...rise(frame, save + 8, 30, 10), position: "absolute", left: 6, right: 6, top: SAVE.y - PLAYER_TOP + 40, padding: "14px 16px", borderRadius: 20, background: CREAM, color: INK, boxShadow: "0 30px 60px -24px rgb(0 0 0 / 0.9)" }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#64748B" }}>{t.myVideos}</p>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
                <span style={{ width: 54, height: 40, borderRadius: 10, background: NIGHT, display: "grid", placeItems: "center" }}>
                  <Play size={16} color={YELLOW} fill={YELLOW} />
                </span>
                <div>
                  <p style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{t.playerTitle}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 13, color: "#64748B" }}>{t.today} · 1:24</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      <Cursor
        keys={[
          { at: Math.max(4, button - 26), x: 380, y: 520 },
          { at: button + 8, x: CHIP.x, y: CHIP.y },
          { at: click, x: CHIP.x, y: CHIP.y, click: true },
          { at: playerAt + 30, x: 440, y: 560 },
          { at: save, x: SAVE.x, y: SAVE.y, click: true },
        ]}
      />
    </AbsoluteFill>
  );
}

const d3 = (lang: Lang, span: number, w: { button: string; click: string; generates: string; voice: string; visual: string; step: [string, number]; saves: string }): CampScene[] => [
  {
    name: "Explain as video — generate — player — save",
    span,
    render: ({ f, dur }) => <VideoFeature lang={lang} f={f} dur={dur} w={w} />,
    cues: ({ f }) => [
      { at: f(w.click) + 6, kind: "click" as const, volume: 0.6 },
      { at: f(w.generates) + 34, kind: "success" as const, volume: 0.45 },
      ...[f(w.voice), f(w.visual), f(...w.step)].map((at) => ({ at, kind: "pop" as const, volume: 0.3 })),
      { at: f(w.saves) + 8, kind: "click" as const, volume: 0.6 },
      { at: f(w.saves) + 16, kind: "success" as const, volume: 0.3 },
    ],
  },
];

/* ═══ Démo 4 — Le cours interactif : question, réponse, correction ══════ */

/** Position des réponses à l'écran (pour le curseur). Mesurée sur une image rendue. */
const OPTION = { x: 210, y0: 337, dy: 56 };

function QuizBoard({ lang, f, w }: { lang: Lang; f: CampCtx["f"]; w: { asks: string; wrong: string; explains: string } }) {
  const frame = useCurrentFrame();
  const t = D[lang];
  const asks = f(w.asks);
  const pick = f(w.wrong) - 8;
  const explains = f(w.explains);
  const fixed = explains + 44;
  return (
    <AbsoluteFill>
      <HoersaalBoard lang={lang} eyebrow={BEAM[lang].eyebrow} title={BEAM[lang].title} professor={prof("sensei")} writing={frame >= explains} backdrop={BG("mechanical", 2)} scroll={interpolateScroll(frame, explains - 4, explains + 16, 0, 150)}>
        <div className="w-full pr-24">
          <StepChecklist steps={BEAM[lang].steps.map((label, i) => ({ label, done: i < (frame >= fixed ? 3 : 2) }))} />
        </div>
        <Appear at={Math.max(0, asks - 4)}>
          <PaperNote title={t.quizTitle}>
            <Tex tex={t.quizGiven} reveal={progress(frame, asks, asks + 16)} size={0.9} />
            <div className="mt-2 grid w-full grid-cols-1 gap-2">
              {t.options.map((o, i) => {
                const wrong = i === 0 && frame >= pick;
                const right = i === 1 && frame >= fixed;
                return (
                  <div key={o} className="flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-[16px]" style={{ ...rise(frame, asks + 10 + i * 4, 10, 8), borderColor: wrong ? "#DC2626" : right ? "#16A34A" : "#E2E8F0", background: wrong ? "#FEE2E2" : right ? "#DCFCE7" : "#FFFFFF" }}>
                    <span className="flex size-7 items-center justify-center rounded-full font-bold" style={{ background: wrong ? "#DC2626" : right ? "#16A34A" : "#F1F5F9", color: wrong || right ? "#FFF" : INK }}>
                      {wrong ? <X size={16} strokeWidth={3} /> : right ? <Check size={16} strokeWidth={3} /> : String.fromCharCode(65 + i)}
                    </span>
                    <span style={{ color: INK, fontWeight: 600 }}>{o}</span>
                  </div>
                );
              })}
            </div>
          </PaperNote>
        </Appear>
        <Appear at={explains}>
          <PaperNote title={t.mistakeTitle} tilt={0.5} highlight={frame >= fixed}>
            <p className="font-hand text-xl text-[color:var(--board-muted)]">{t.mistake}</p>
            <Tex tex={String.raw`A = B = \frac{q\,l}{2} = 4\,\mathrm{kN}`} reveal={progress(frame, explains + 20, explains + 44)} size={1.05} />
          </PaperNote>
        </Appear>
      </HoersaalBoard>
      <Cursor
        keys={[
          { at: asks + 16, x: 400, y: 640 },
          { at: asks + 44, x: OPTION.x + 60, y: OPTION.y0 + OPTION.dy },
          { at: pick, x: OPTION.x, y: OPTION.y0, click: true },
        ]}
        hideAt={explains - 6}
      />
    </AbsoluteFill>
  );
}

/** Position de la carte du professeur choisi (pour le curseur). Mesurée sur une image rendue. */
const PROF_CARD = { x: 160, y: 590 };

const d4 = (lang: Lang, w: { asks: string; wrong: string; explains: string; choose: string }): CampScene[] => [
  {
    name: "TRED asks back — wrong answer — it explains the mistake",
    span: 5,
    render: ({ f }) => <QuizBoard lang={lang} f={f} w={w} />,
    cues: ({ f }) => [{ at: f(w.asks), kind: "pop" as const, volume: 0.35 }, { at: f(w.wrong) - 8, kind: "click" as const, volume: 0.6 }, { at: f(w.explains) + 44, kind: "success" as const, volume: 0.4 }],
  },
  {
    name: "Choose your professor",
    span: lang === "en" ? 2 : 1,
    enter: "slide",
    render: ({ f }) => {
      const at = f(w.choose) + 10;
      return (
        <AbsoluteFill>
          <ProfGrid profs={PROFS} lang={lang} title={D[lang].profTitle} chosen="maverick" chooseAt={at} />
          <Cursor keys={[{ at: 6, x: 150, y: 700 }, { at, x: PROF_CARD.x, y: PROF_CARD.y, click: true }]} />
        </AbsoluteFill>
      );
    },
    cues: ({ f }) => [{ at: f(w.choose) + 10, kind: "click" as const, volume: 0.6 }],
  },
];

/* ═══ Démo 5 — Le tableau de bord ═══════════════════════════════════════ */

/** Les quatre blocs du tableau de bord : position (pour le curseur et la mise en avant). */
const BLOCKS = [
  { top: 172, height: 60 },
  { top: 246, height: 136 },
  { top: 396, height: 144 },
  { top: 554, height: 118 },
];

export function DashboardScreen({ lang, active, bg, label, labelAt = 0 }: { lang: Lang; active: number; bg: string; label?: string; labelAt?: number }) {
  const frame = useCurrentFrame();
  const t = D[lang];
  const ui = UI[lang];
  const card = (i: number): CSSProperties => ({
    position: "absolute",
    left: 20,
    right: 20,
    top: BLOCKS[i].top,
    height: BLOCKS[i].height,
    borderRadius: 22,
    background: "rgb(255 255 255 / 0.1)",
    border: `2px solid ${active === i ? YELLOW : "rgb(255 255 255 / 0.16)"}`,
    boxShadow: active === i ? "0 0 0 6px rgb(234 179 8 / 0.22), 0 30px 60px -30px rgb(0 0 0 / 0.9)" : "none",
    transform: `scale(${active === i ? 1.025 : 1})`,
    backdropFilter: "blur(14px)",
    color: "#FFF",
    padding: "12px 16px",
    overflow: "hidden",
  });
  const head: CSSProperties = { margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: "0.09em", textTransform: "uppercase", color: "#CBD5E1" };
  return (
    <AbsoluteFill style={{ background: NIGHT, overflow: "hidden" }}>
      <Img key={bg} src={staticFile(bg)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.05 + frame * 0.0005})` }} />
      <AbsoluteFill style={{ background: "linear-gradient(180deg, rgb(7 11 20 / 0.82), rgb(11 18 34 / 0.5) 45%, rgb(7 11 20 / 0.78))" }} />
      <div style={{ position: "absolute", top: 54, left: 24, right: 24, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Logo markClassName="h-8 text-white" />
        {label && (
          <span key={label} className="font-display" style={{ ...rise(frame, labelAt, 12, 6), padding: "7px 16px", borderRadius: 999, background: "rgb(253 251 247 / 0.94)", border: `2px solid ${YELLOW}`, color: INK, fontSize: 18, fontWeight: 700 }}>{label}</span>
        )}
      </div>
      <h3 className="font-display" style={{ position: "absolute", top: 112, left: 24, margin: 0, color: "#FFF", fontSize: 34, fontWeight: 650 }}>{t.greeting}</h3>

      <div style={{ ...card(0), display: "flex", alignItems: "center", gap: 10, padding: "0 10px 0 16px" }}>
        <span style={{ flex: 1, fontSize: 16, color: "#E2E8F0" }}>{ui.ask}</span>
        <span style={{ padding: "9px 14px", borderRadius: 14, background: YELLOW, color: NIGHT, fontSize: 14, fontWeight: 800 }}>{ui.send}</span>
      </div>

      <div style={card(1)}>
        <p style={head}>{t.board}</p>
        <div style={{ marginTop: 6, borderRadius: 14, background: CREAM, color: INK, padding: "6px 14px" }}>
          <p className="font-hand" style={{ margin: 0, fontSize: 20 }}>{BEAM[lang].title}</p>
          <Tex tex={String.raw`A = B = \frac{q\,l}{2} = 4\,\mathrm{kN}`} size={0.8} />
        </div>
      </div>

      <div style={card(2)}>
        <p style={head}>{t.myVideos}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          {[BEAM[lang].title, SOLVER[lang].circuitTitle].map((title, i) => (
            <div key={title} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ height: 62, borderRadius: 12, background: "linear-gradient(145deg,#1E2B4D,#0B1222)", display: "grid", placeItems: "center", border: "1px solid rgb(255 255 255 / 0.14)" }}>
                <Play size={22} color={YELLOW} fill={YELLOW} />
              </div>
              <p style={{ margin: "5px 0 0", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</p>
              <p style={{ margin: 0, fontSize: 11, color: "#CBD5E1" }}>{i ? "0:58" : "1:24"}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={card(3)}>
        <p style={head}>{t.progressTitle}</p>
        <div style={{ display: "flex", gap: 10, marginTop: 7 }}>
          {t.stats.map(([n, l], i) => {
            const Icon = [Flame, Layers, BookOpen][i];
            return (
              <div key={l} style={{ flex: 1, borderRadius: 14, background: "rgb(255 255 255 / 0.1)", padding: "9px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Icon size={16} color={YELLOW} />
                  <span style={{ fontSize: 24, fontWeight: 800 }}>{n}</span>
                </div>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#CBD5E1" }}>{l}</p>
              </div>
            );
          })}
        </div>
      </div>

      <p style={{ ...head, position: "absolute", top: 688, left: 28 }}>{t.subjects}</p>
      <div style={{ position: "absolute", top: 712, left: 20, right: 20, display: "flex", gap: 8 }}>
        {["Technische Mechanik 2", "Elektrotechnik 1", "Mathematik 2"].map((x) => (
          <span key={x} style={{ padding: "9px 12px", borderRadius: 14, background: "rgb(255 255 255 / 0.12)", border: "1px solid rgb(255 255 255 / 0.18)", color: "#FFF", fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>{x}</span>
        ))}
      </div>
    </AbsoluteFill>
  );
}

function DashboardTour({ lang, f, w }: { lang: Lang; f: CampCtx["f"]; w: { ask: string; board: string; video: string; progress: string } }) {
  const frame = useCurrentFrame();
  const at = [f(w.ask), f(w.board), f(w.video), f(w.progress)];
  let active = -1;
  at.forEach((a, i) => {
    if (frame >= a - 2) active = i;
  });
  const mid = (i: number) => BLOCKS[i].top + BLOCKS[i].height / 2;
  return (
    <AbsoluteFill>
      <DashboardScreen lang={lang} active={active} bg={BG("aerospace", 4)} />
      <Cursor
        keys={[
          { at: Math.max(2, at[0] - 26), x: 400, y: 840 },
          { at: at[0], x: 380, y: mid(0), click: true },
          { at: at[1], x: 300, y: mid(1), click: true },
          { at: at[2], x: 150, y: mid(2) + 6, click: true },
          { at: at[3], x: 330, y: mid(3) + 10, click: true },
        ]}
      />
    </AbsoluteFill>
  );
}

const FIELD_BG = [BG("law", 2), BG("medicine", 1), BG("aerospace", 1)];

const d5 = (lang: Lang, w: { ask: string; board: string; video: string; progress: string; fields: [string, string, string] }): CampScene[] => [
  {
    name: "The full picture: ask, whiteboard, video, progress",
    span: 3,
    render: ({ f }) => <DashboardTour lang={lang} f={f} w={w} />,
    cues: ({ f }) => [w.ask, w.board, w.video, w.progress].map((x) => ({ at: f(x), kind: "click" as const, volume: 0.5 })),
  },
  {
    name: "Law, medicine, aerospace — your background",
    enter: "fade",
    render: ({ f }) => <FieldDashboard lang={lang} at={w.fields.map((x) => f(x)) as [number, number, number]} />,
    cues: ({ f }) => w.fields.map((x) => ({ at: f(x), kind: "pop" as const, volume: 0.4 })),
  },
];

/** Le tableau de bord dont le fond suit la filière nommée par la voix. */
function FieldDashboard({ lang, at }: { lang: Lang; at: [number, number, number] }) {
  const frame = useCurrentFrame();
  let i = 0;
  at.forEach((a, k) => {
    if (frame >= a - 2) i = k;
  });
  const punch = 1 + 0.05 * Math.exp(-Math.max(0, frame - at[i]) / 4);
  return (
    <AbsoluteFill style={{ transform: `scale(${punch})` }}>
      <DashboardScreen lang={lang} active={-1} bg={FIELD_BG[i]} label={D[lang].fields[i]} labelAt={at[i]} />
    </AbsoluteFill>
  );
}

/* ═══ Les 10 compositions ═══════════════════════════════════════════════ */

const video = (props: Parameters<typeof CampaignVideo>[0], lang: Lang, n: number): ReactNode => <CampaignVideo {...props} maxGap={DEMO_MAX_GAP} intro={{ title: INTRO[lang][n - 1] }} />;

export const D1En = () => video({ vo: vo1en, voice: voice1en, music: music1en, scenes: d1("en", 7, { type: "type", send: "send", boom: "boom", draws: "draws", step: "Step" }), outro: D.en.outro.d1, outroSpan: 1 }, "en", 1);
export const D1De = () => video({ vo: vo1de, voice: voice1de, music: music1de, scenes: d1("de", 8, { type: "tippst", send: "Enter", boom: "bam", draws: "zeichnet", step: "Schritt" }), outro: D.de.outro.d1, outroSpan: 1 }, "de", 1);

export const D2En = () => video({ vo: vo2en, voice: voice2en, music: music2en, scenes: d2("en", { watch: "Watch", solvers: "solvers", diagram: "diagram", component: "component", accuracy: "accuracy" }), outro: D.en.outro.d2, outroSpan: 1 }, "en", 2);
export const D2De = () => video({ vo: vo2de, voice: voice2de, music: music2de, scenes: d2("de", { watch: "Schau", solvers: "Solver", diagram: "Diagramm", component: "Bauteil", accuracy: "Genauigkeit" }), outro: D.de.outro.d2 }, "de", 2);

export const D3En = () => video({ vo: vo3en, voice: voice3en, music: music3en, scenes: d3("en", 8, { button: "button", click: "Click", generates: "generates", voice: "voice", visual: "visual", step: ["step", 0], saves: "saves" }), outro: D.en.outro.d3 }, "en", 3);
export const D3De = () => video({ vo: vo3de, voice: voice3de, music: music3de, scenes: d3("de", 7, { button: "Button", click: "Klick", generates: "generiert", voice: "Stimme", visual: "visuellen", step: ["Schritt", 0], saves: "speichert" }), outro: D.de.outro.d3 }, "de", 3);

export const D4En = () => video({ vo: vo4en, voice: voice4en, music: music4en, scenes: d4("en", { asks: "asks", wrong: "wrong", explains: "explains", choose: "choose" }), outro: D.en.outro.d4, outroSpan: 1 }, "en", 4);
export const D4De = () => video({ vo: vo4de, voice: voice4de, music: music4de, scenes: d4("de", { asks: "stellt", wrong: "falsch", explains: "erklärt", choose: "wählen" }), outro: D.de.outro.d4 }, "de", 4);

export const D5En = () => video({ vo: vo5en, voice: voice5en, music: music5en, scenes: d5("en", { ask: "Ask", board: "whiteboard", video: "video", progress: "progress", fields: ["law", "medicine", "aerospace"] }), outro: D.en.outro.d5, outroSpan: 2 }, "en", 5);
export const D5De = () => video({ vo: vo5de, voice: voice5de, music: music5de, scenes: d5("de", { ask: "Stelle", board: "Tafel", video: "Videoerklärung", progress: "Fortschritt", fields: ["Jura", "Medizin", "Luft"] }), outro: D.de.outro.d5, outroSpan: 2 }, "de", 5);

export const DEMO_IDS = [
  ["D1-EN-The-Workflow", D1En],
  ["D1-DE-Der-Workflow", D1De],
  ["D2-EN-The-Schemas", D2En],
  ["D2-DE-Die-Schemata", D2De],
  ["D3-EN-The-Video-Feature", D3En],
  ["D3-DE-Das-Video-Feature", D3De],
  ["D4-EN-Interactive-Learning", D4En],
  ["D4-DE-Interaktives-Lernen", D4De],
  ["D5-EN-The-Dashboard", D5En],
  ["D5-DE-Das-Dashboard", D5De],
] as const;

