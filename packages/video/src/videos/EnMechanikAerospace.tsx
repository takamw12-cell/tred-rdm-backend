import { useMemo } from "react";
import { AbsoluteFill, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { PaperNote, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { parseBeamPayload, renderBeamSvg } from "@/lib/beam-svg";
import { PROFESSORS, PROFESSOR_IDS } from "../../../web/src/api/lib/professors";
import { solveRdmSafe } from "../../../web/src/api/lib/rdm-solver";
import { payloadToProblem } from "../../../web/src/api/lib/beam-tool";
import { Appear, HoersaalBoard, Tex } from "../promo/board";
import {
  NIGHT,
  PhotoBackdrop,
  SceneFrame,
  YELLOW,
  clamp,
  easeOut,
  pop,
  progress,
  rise,
  s,
  useImagesReady,
  withStaticImage,
} from "../promo/kit";
import { DocUpload, Outro, ProfGrid } from "../promo/parts";
import { Captions, Soundtrack, planVoice, type Cue } from "../promo/voice";
import voFile from "../assets/vo-en.json";
import voice from "../assets/vo-en.mp3";
import music from "../assets/music-en.mp3";
import sfxPop from "../assets/sfx-pop.wav";
import sfxClick from "../assets/sfx-click.wav";
import sfxSuccess from "../assets/sfx-success.wav";
import sfxWhoosh from "../assets/sfx-whoosh.wav";

/**
 * Vidéo 3 (EN) — Technische Mechanik & Aerospace : une poutre HYPERSTATIQUE
 * (encastrement en A, appui simple en B, q = 2 kN/m, l = 4 m), résolue par le
 * vrai solveur de TRED : A = 5 kN, M_A = −4 kNm, B = 3 kN, M_max = 2,25 kNm.
 */
export const EN_FRAMES = s(30);
// La 3e phrase est coupée à ses virgules : upload, professeur, solveur ont chacun leur scène.
const STARTS = [1.0, 5.2, 12.3, 15.2, 18.3, 25.0];
const BREAKS = ["documents,", "professor,"];

const BEAM = {
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

function useSolver() {
  return useMemo(() => {
    const payload = parseBeamPayload(JSON.stringify(BEAM));
    if (!payload) throw new Error("Poutre de démonstration invalide");
    const r = solveRdmSafe(payloadToProblem(payload.problem));
    if (!r.ok) throw new Error(`Le solveur a refusé la poutre : ${r.error}`);
    return { svg: renderBeamSvg(payload, r), r };
  }, []);
}

export function EnMechanikAerospace() {
  useImagesReady();
  const plan = useMemo(() => planVoice(voFile, STARTS, BREAKS), []);
  const f = plan.frameOf;
  const CUT = {
    board: s(5.2),
    upload: s(11.9),
    profs: s(14.8),
    solve: s(17.9),
    outro: s(25.0),
  };

  const sfx: Cue[] = [
    { frame: f("Technische") - 2, src: sfxPop, volume: 0.4 },
    { frame: f("Aerospace") - 2, src: sfxPop, volume: 0.4 },
    { frame: CUT.board - 6, src: sfxWhoosh, volume: 0.35 },
    { frame: f("draws"), src: sfxClick, volume: 0.35 },
    { frame: f("calculates"), src: sfxClick, volume: 0.35 },
    { frame: f("explains"), src: sfxClick, volume: 0.35 },
    { frame: CUT.upload - 6, src: sfxWhoosh, volume: 0.35 },
    { frame: f("Upload") + 30, src: sfxSuccess, volume: 0.3 },
    { frame: CUT.profs - 4, src: sfxWhoosh, volume: 0.3 },
    { frame: f("professor"), src: sfxClick, volume: 0.45 },
    { frame: CUT.solve - 4, src: sfxWhoosh, volume: 0.3 },
    { frame: f("deterministic"), src: sfxSuccess, volume: 0.45 },
    { frame: CUT.outro - 8, src: sfxWhoosh, volume: 0.35 },
    { frame: f("ultimate"), src: sfxSuccess, volume: 0.3 },
  ];

  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <Sequence from={0} durationInFrames={CUT.board} name="Hook">
        <Hook tm={f("Technische")} aero={f("Aerospace")} dur={CUT.board} />
      </Sequence>
      <Sequence from={CUT.board} durationInFrames={CUT.upload - CUT.board} name="Tafel — draws, calculates, explains">
        <Board
          dur={CUT.upload - CUT.board}
          at={{ draws: f("draws") - CUT.board, calc: f("calculates") - CUT.board, explains: f("explains") - CUT.board }}
        />
      </Sequence>
      <Sequence from={CUT.upload} durationInFrames={CUT.profs - CUT.upload} name="Upload">
        <Upload dur={CUT.profs - CUT.upload} at={f("Upload") - CUT.upload} />
      </Sequence>
      <Sequence from={CUT.profs} durationInFrames={CUT.solve - CUT.profs} name="Professors">
        <SceneFrame dur={CUT.solve - CUT.profs} enter="slide" exitFrames={5}>
          <ProfGrid
            profs={PROFESSOR_IDS.map((id) => withStaticImage(PROFESSORS[id]))}
            lang="en"
            title="Choose your professor."
            chosen="genius"
            chooseAt={f("professor") - CUT.profs}
          />
        </SceneFrame>
      </Sequence>
      <Sequence from={CUT.solve} durationInFrames={CUT.outro - CUT.solve} name="Solver">
        <Solve dur={CUT.outro - CUT.solve} stampAt={f("deterministic") - CUT.solve} />
      </Sequence>
      <Sequence from={CUT.outro} name="Outro">
        <SceneFrame dur={EN_FRAMES - CUT.outro} enter="wipe" exitFrames={0}>
          <Outro
            tagline={
              <>
                The ultimate <span className="bg-[linear-gradient(transparent_58%,#EAB30866_58%)] px-1">engineering tutor</span>.
              </>
            }
            taglineAt={f("ultimate") - CUT.outro}
            sub="Technische Mechanik · Aerospace · Maschinenbau"
          />
        </SceneFrame>
      </Sequence>

      <Captions plan={plan} hideFrom={CUT.outro} />
      <Soundtrack plan={plan} voice={voice} music={music} sfx={sfx} />
    </AbsoluteFill>
  );
}

/* ── Hook : la turbine, puis l'aile ──────────────────────────────────── */

function Chip({ at, children }: { at: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const k = pop(frame, at);
  return (
    <span
      className="font-display"
      style={{
        opacity: Math.min(1, k * 1.5),
        transform: `scale(${0.8 + 0.2 * k})`,
        display: "inline-block",
        padding: "10px 20px",
        borderRadius: 999,
        background: "rgb(253 251 247 / 0.95)",
        color: NIGHT,
        fontSize: 32,
        fontWeight: 600,
        boxShadow: "0 20px 40px -14px rgb(0 0 0 / 0.7)",
      }}
    >
      {children}
    </span>
  );
}

function Hook({ tm, aero, dur }: { tm: number; aero: number; dur: number }) {
  const frame = useCurrentFrame();
  const wing = progress(frame, aero - 6, aero + 8);
  return (
    <SceneFrame dur={dur} enter="fade">
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Img
          src={staticFile("backgrounds/aerospace/aerospace-01.webp")}
          style={{
            height: 1100,
            width: "auto",
            maxWidth: "none",
            opacity: 0.55 * (1 - wing),
            filter: "grayscale(0.6) contrast(1.1)",
            transform: `rotate(${frame * 0.5}deg) scale(1.1)`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill style={{ opacity: wing }}>
        <PhotoBackdrop src="backgrounds/aerospace/aerospace-03.webp" opacity={0.85} veil={0.35} />
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, transparent, rgb(7 11 20 / 0.8) 80%)" }} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 18, paddingBottom: 120 }}>
        <Chip at={tm}>Technische Mechanik</Chip>
        <Chip at={aero}>Aerospace Engineering</Chip>
      </AbsoluteFill>
    </SceneFrame>
  );
}

/* ── La Tafel : le solveur dessine, calcule, explique ────────────────── */

function Board({ dur, at }: { dur: number; at: { draws: number; calc: number; explains: number } }) {
  const frame = useCurrentFrame();
  const { svg } = useSolver();
  const kenta = useMemo(() => withStaticImage(PROFESSORS.genius), []);
  // Le SVG du solveur : croquis (≈ 0–38 %), Q(x) (≈ 38–66 %), M(x) (le reste).
  const reveal = interpolate(
    frame,
    [at.draws, at.draws + 12, at.calc, at.calc + 12, at.explains, at.explains + 16],
    [0, 0.38, 0.38, 0.66, 0.66, 1],
    { ...clamp, easing: easeOut },
  );
  const step = frame >= at.explains ? 3 : frame >= at.calc ? 2 : frame >= at.draws ? 1 : 0;
  return (
    <SceneFrame dur={dur} enter="zoom">
      <HoersaalBoard
        lang="en"
        eyebrow="Digitaler Hörsaal · Technische Mechanik"
        title="Statisch unbestimmt"
        professor={kenta}
        backdrop="backgrounds/general/bg-01.webp"
      >
        <div className="w-full pr-24">
          <StepChecklist steps={["Skizze", "Q(x)", "M(x)"].map((label, i) => ({ label, done: i < step }))} />
        </div>
        <Appear at={4}>
          <PaperNote title="Einspannung A · Loslager B">
            <div
              className="[&_svg]:h-auto [&_svg]:w-full"
              style={{ clipPath: `inset(0 0 ${(1 - reveal) * 100}% 0)` }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </PaperNote>
        </Appear>
      </HoersaalBoard>
    </SceneFrame>
  );
}

/* ── Upload : son propre polycopié ───────────────────────────────────── */

function Upload({ dur, at }: { dur: number; at: number }) {
  const frame = useCurrentFrame();
  return (
    <SceneFrame dur={dur} enter="slide" exitFrames={5}>
      <PhotoBackdrop src="backgrounds/aerospace/aerospace-03.webp" opacity={0.6} veil={0.7} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 170, gap: 26 }}>
        <h2 className="font-display text-center" style={{ ...rise(frame, 2), margin: 0, color: "#FFFFFF", fontSize: 36, fontWeight: 600, lineHeight: 1.1 }}>
          Your lecture notes.
          <br />
          <span style={{ color: YELLOW }}>Your tutor.</span>
        </h2>
        <DocUpload name="Skript_TM2_Statik.pdf" meta="PDF · Technische Mechanik 2" at={at} doneLabel="Uploaded" />
      </AbsoluteFill>
    </SceneFrame>
  );
}

/* ── Le solveur déterministe : les valeurs exactes ───────────────────── */

function Solve({ dur, stampAt }: { dur: number; stampAt: number }) {
  const frame = useCurrentFrame();
  const kenta = useMemo(() => withStaticImage(PROFESSORS.genius), []);
  const k = pop(frame, stampAt);
  return (
    <SceneFrame dur={dur} enter="zoom">
      <HoersaalBoard
        lang="en"
        eyebrow="Digitaler Hörsaal · Technische Mechanik"
        title="Statisch unbestimmt"
        professor={kenta}
        writing={false}
        backdrop="backgrounds/general/bg-01.webp"
      >
        <div className="w-full pr-24">
          <StepChecklist steps={["Skizze", "Q(x)", "M(x)"].map((label) => ({ label, done: true }))} />
        </div>
        <Appear at={2}>
          <PaperNote
            title="Lagerreaktionen"
            highlight
            stamp={
              <span style={{ opacity: Math.min(1, k * 1.5), transform: `scale(${2.2 - 1.2 * k})`, display: "inline-flex" }}>
                <SolverStamp />
              </span>
            }
          >
            <Tex tex={String.raw`A = \tfrac{5}{8}\,q\,l = 5\,\mathrm{kN}`} reveal={progress(frame, 6, 18)} />
            <Tex tex={String.raw`M_A = -\tfrac{1}{8}\,q\,l^2 = -4\,\mathrm{kNm}`} reveal={progress(frame, 16, 28)} />
            <Tex tex={String.raw`B = \tfrac{3}{8}\,q\,l = 3\,\mathrm{kN}`} reveal={progress(frame, 26, 38)} />
            <Tex tex={String.raw`M_{\max} = \tfrac{9}{128}\,q\,l^2 = 2{,}25\,\mathrm{kNm}`} reveal={progress(frame, 36, 50)} />
          </PaperNote>
        </Appear>
      </HoersaalBoard>
    </SceneFrame>
  );
}
