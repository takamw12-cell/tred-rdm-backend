import { useMemo } from "react";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import "highlight.js/styles/atom-one-dark.css";
import { AbsoluteFill, Img, Sequence, useCurrentFrame } from "remotion";
import { Code2, Play, Zap } from "lucide-react";
import { PaperNote, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { PROFESSORS } from "../../../web/src/api/lib/professors";
import { Appear, HoersaalBoard, Tex } from "../promo/board";
import {
  NIGHT,
  PhotoBackdrop,
  SceneFrame,
  YELLOW,
  interpolateScroll,
  pop,
  progress,
  rise,
  s,
  useImagesReady,
  withStaticImage,
} from "../promo/kit";
import { Outro } from "../promo/parts";
import { Captions, Soundtrack, planVoice, type Cue } from "../promo/voice";
import voFile from "../assets/vo-de.json";
import voice from "../assets/vo-de.mp3";
import music from "../assets/music-de.mp3";
import circuit from "../assets/circuit-de.svg";
import sfxPop from "../assets/sfx-pop.wav";
import sfxClick from "../assets/sfx-click.wav";
import sfxSuccess from "../assets/sfx-success.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";
import sfxType from "../assets/sfx-type.wav";

hljs.registerLanguage("python", python);

/**
 * Vidéo 2 (DE) — Elektrotechnik & Informatik : la Schaltung (schemdraw, normes
 * DIN/EN), le même calcul en Python, puis le résultat validé par le solveur.
 * Circuit : U_q = 12 V, R1 = 2 Ω, R2 = R3 = 4 Ω (en parallèle) → I1 = 3 A.
 */
export const DE_FRAMES = s(30);
const STARTS = [1.0, 4.6, 8.0, 16.2, 25.0];
const CUT = { board: s(4.6), result: s(16.2), outro: s(25.0) };

const CODE = `R1, R2, R3 = 2, 4, 4         # Ohm
Uq = 12                      # Volt
R23 = R2 * R3 / (R2 + R3)    # R2 ∥ R3
I1 = Uq / (R1 + R23)
print(I1)                    # 3.0 A`;

export function DeElektroInformatik() {
  useImagesReady();
  const plan = useMemo(() => planVoice(voFile, STARTS), []);
  const f = plan.frameOf;
  const typeStart = f("Programmiersprachen");

  const sfx: Cue[] = [
    { frame: f("Elektrotechnik") - 2, src: sfxWhoosh, volume: 0.35 },
    { frame: f("Informatik") - 2, src: sfxWhoosh, volume: 0.35 },
    { frame: CUT.board - 6, src: sfxWhoosh, volume: 0.3 },
    { frame: f("Schaltungen"), src: sfxPop, volume: 0.4 },
    ...Array.from({ length: 12 }, (_, i) => ({ frame: typeStart + 4 + i * 3, src: sfxType, volume: 0.25 })),
    { frame: f("Schritt", 1), src: sfxClick, volume: 0.4 },
    { frame: CUT.result - 6, src: sfxWhoosh, volume: 0.35 },
    { frame: f("korrekte"), src: sfxSuccess, volume: 0.45 },
    { frame: CUT.outro - 8, src: sfxWhoosh, volume: 0.35 },
    { frame: f("Meistere"), src: sfxSuccess, volume: 0.3 },
  ];

  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <Sequence from={0} durationInFrames={CUT.board} name="Hook">
        <Hook et={f("Elektrotechnik")} inf={f("Informatik")} dur={CUT.board} />
      </Sequence>
      <Sequence from={CUT.board} durationInFrames={CUT.result - CUT.board} name="Tafel — Schaltung & Python">
        <Board
          dur={CUT.result - CUT.board}
          at={{
            circuit: f("Schaltungen") - CUT.board,
            code: typeStart - CUT.board,
            steps: f("Schritt", 1) - CUT.board,
          }}
        />
      </Sequence>
      <Sequence from={CUT.result} durationInFrames={CUT.outro - CUT.result} name="Ergebnis — Solver">
        <Result dur={CUT.outro - CUT.result} stampAt={f("korrekte") - CUT.result} />
      </Sequence>
      <Sequence from={CUT.outro} name="Outro">
        <SceneFrame dur={DE_FRAMES - CUT.outro} enter="wipe" exitFrames={0}>
          <Outro
            tagline={
              <>
                Meistere dein <span className="bg-[linear-gradient(transparent_58%,#EAB30866_58%)] px-1">Studium</span>.
              </>
            }
            taglineAt={f("Meistere") - CUT.outro}
            sub="Elektrotechnik, Informatik, Mechanik — dein Ingenieur-Tutor."
          />
        </SceneFrame>
      </Sequence>

      <Captions plan={plan} hideFrom={CUT.outro} />
      <Soundtrack plan={plan} voice={voice} music={music} sfx={sfx} />
    </AbsoluteFill>
  );
}

/* ── Hook : deux filières, deux panneaux ─────────────────────────────── */

function Panel({ at, img, icon, label, from }: { at: number; img: string; icon: React.ReactNode; label: string; from: "left" | "right" }) {
  const frame = useCurrentFrame();
  const p = progress(frame, at, at + 10);
  const k = pop(frame, at + 3);
  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        overflow: "hidden",
        clipPath: from === "left" ? `inset(0 ${(1 - p) * 100}% 0 0)` : `inset(0 0 0 ${(1 - p) * 100}%)`,
      }}
    >
      <PhotoBackdrop src={img} opacity={0.75} veil={0.55} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 14 }}>
        <div
          style={{
            transform: `scale(${k})`,
            width: 84,
            height: 84,
            borderRadius: 24,
            background: YELLOW,
            color: NIGHT,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 20px 40px -12px rgb(234 179 8 / 0.6)",
          }}
        >
          {icon}
        </div>
        <span className="font-display" style={{ ...rise(frame, at + 5), color: "#FFFFFF", fontSize: 46, fontWeight: 600 }}>
          {label}
        </span>
      </AbsoluteFill>
    </div>
  );
}

function Hook({ et, inf, dur }: { et: number; inf: number; dur: number }) {
  return (
    <SceneFrame dur={dur} enter="fade" exitFrames={6}>
      <AbsoluteFill style={{ flexDirection: "column", gap: 4 }}>
        <Panel at={et - 4} img="backgrounds/electrical/electrical-02.webp" icon={<Zap size={46} />} label="Elektrotechnik" from="left" />
        <Panel at={inf - 4} img="backgrounds/informatics/informatics-01.webp" icon={<Code2 size={46} />} label="Informatik" from="right" />
      </AbsoluteFill>
    </SceneFrame>
  );
}

/* ── La Tafel : la Schaltung, puis le code ───────────────────────────── */

function CodeCard({ shown }: { shown: number }) {
  const html = useMemo(() => hljs.highlight(CODE.slice(0, shown), { language: "python" }).value, [shown]);
  const lines = CODE.split("\n").length;
  return (
    <div className="overflow-hidden rounded-xl border border-[#2b3038] bg-[#282c34] text-left">
      <div className="flex items-center justify-between gap-2 border-b border-[#2b3038] px-3 py-1.5">
        <span className="text-[11px] font-semibold tracking-wide text-[#abb2bf] uppercase">Python</span>
        <span className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[#EAB308]">
          <Play className="size-3.5" /> Ausführen
        </span>
      </div>
      <pre className="m-0 px-3 py-2.5 text-[11.5px] leading-[1.55]" style={{ minHeight: `${lines * 1.55 + 1.2}em` }}>
        <code className="hljs" style={{ background: "transparent", padding: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

function Board({ dur, at }: { dur: number; at: { circuit: number; code: number; steps: number } }) {
  const frame = useCurrentFrame();
  const ren = useMemo(() => withStaticImage(PROFESSORS.maverick), []);
  const wipe = progress(frame, at.circuit, at.circuit + 22);
  const typed = Math.round(progress(frame, at.code + 4, at.code + 44) * CODE.length);
  const step = frame >= at.steps ? 2 : frame >= at.code ? 1 : 0;
  return (
    <SceneFrame dur={dur} enter="zoom">
      <HoersaalBoard
        lang="de"
        eyebrow="Digitaler Hörsaal · Elektrotechnik"
        title="Gemischte Schaltung"
        professor={ren}
        backdrop="backgrounds/electrical/electrical-01.webp"
        scroll={interpolateScroll(frame, at.code - 6, at.code + 10, 0, 120)}
      >
        <div className="w-full pr-24">
          <StepChecklist
            steps={["Schaltung", "Code", "Ergebnis"].map((label, i) => ({ label, done: i < step }))}
          />
        </div>
        <Appear at={at.circuit - 8}>
          <PaperNote title="Schritt 1 — Schaltung">
            <div style={{ clipPath: `inset(-5% ${(1 - wipe) * 100}% -5% 0)` }}>
              <Img src={circuit} style={{ width: "100%", height: "auto" }} />
            </div>
            <p className="font-hand mt-1 text-xl text-[color:var(--board-muted)]" style={{ opacity: progress(frame, at.circuit + 20, at.circuit + 30) }}>
              R₂ ∥ R₃: zwei gleiche Widerstände parallel ergeben die Hälfte.
            </p>
          </PaperNote>
        </Appear>
        <Appear at={at.code - 4}>
          <PaperNote title="Schritt 2 — Python" tilt={0.5}>
            <CodeCard shown={typed} />
          </PaperNote>
        </Appear>
      </HoersaalBoard>
    </SceneFrame>
  );
}

/* ── Le résultat, validé par le solveur (gros plan) ──────────────────── */

function Result({ dur, stampAt }: { dur: number; stampAt: number }) {
  const frame = useCurrentFrame();
  const k = pop(frame, stampAt);
  return (
    <SceneFrame dur={dur} enter="slide">
      <PhotoBackdrop src="backgrounds/electrical/electrical-02.webp" opacity={0.55} veil={0.72} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 110, padding: "110px 22px 0", gap: 22 }}>
        <p className="font-mono" style={{ ...rise(frame, 2), margin: 0, color: "rgb(255 255 255 / 0.7)", fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase" }}>
          Digitaler Hörsaal · Ergebnis
        </p>
        <div className="w-full" data-board-theme="white" style={{ ...rise(frame, 4, 30) }}>
          <PaperNote
            title="Schritt 3 — Ergebnis"
            highlight
            stamp={
              <span style={{ opacity: Math.min(1, k * 1.5), transform: `scale(${2.2 - 1.2 * k})`, display: "inline-flex" }}>
                <SolverStamp />
              </span>
            }
          >
            <Tex tex={String.raw`R_{23} = \frac{R_2\,R_3}{R_2 + R_3} = 2\,\Omega`} reveal={progress(frame, 10, 26)} size={1.1} />
            <Tex
              tex={String.raw`I_1 = \frac{U_q}{R_1 + R_{23}} = \frac{12\,\mathrm{V}}{4\,\Omega} = 3\,\mathrm{A}`}
              reveal={progress(frame, 30, 50)}
              size={1.1}
            />
            <div className="mt-2 flex items-center justify-center gap-2" style={rise(frame, stampAt - 8)}>
              <span className="rounded-full bg-[#282c34] px-3 py-1 font-mono text-xs text-[#98c379]">print(I1) → 3.0</span>
              <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-xs font-semibold text-[#166534]">✓ identisch</span>
            </div>
          </PaperNote>
        </div>
      </AbsoluteFill>
    </SceneFrame>
  );
}
