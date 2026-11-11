import { useLayoutEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import katex from "katex";
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
// Les VRAIS composants et la vraie logique de TRED (packages/web).
import { BoardStatus, GlassBoard, PaperNote, ProfessorHalo, SolverStamp, StepChecklist } from "@/components/hoersaal";
import { HoersaalStage } from "@/components/hoersaal-stage";
import { HologramProfessor } from "@/components/hologram-professor";
import { Logo } from "@/components/logo";
import { parseBeamPayload, renderBeamSvg } from "@/lib/beam-svg";
import { PROFESSORS, PROFESSOR_IDS, professorText, type Professor } from "../../web/src/api/lib/professors";
import { solveMechanicsSafe } from "../../web/src/api/lib/mechanics-solver";
import { payloadToProblem } from "../../web/src/api/lib/beam-tool";

/**
 * TRED — Hörsaal, 15 s, 9:16. Toutes les animations suivent la timeline de
 * Remotion (useCurrentFrame), jamais framer-motion : chaque image est une
 * fonction pure du temps, donc le rendu est identique d'une fois à l'autre.
 *
 * Storyboard (packages/video/storyboard.md, resserré à 15 s) :
 *   0,0–2,5 s  Hook : « L'IA s'est encore trompée de signe ? »
 *   2,5–5,0 s  Reveal : logo TRED + promesse (copie de la landing)
 *   5,0–10,0 s Le Hörsaal : la Tafel s'écrit, le solveur de Technische Mechanik trace Q(x) et M(x)
 *  10,0–12,5 s Les quatre professeurs
 *  12,5–15,0 s Outro : tred-tutor.de
 */

const FPS = 30;
/** De combien (px) le contenu du tableau monte pour montrer la feuille du solveur. */
const BOARD_SCROLL = 270;
const s = (sec: number) => Math.round(sec * FPS);

const SCENES = {
  hook: { from: 0, dur: s(2.5) },
  reveal: { from: s(2.5), dur: s(2.5) },
  hoersaal: { from: s(5), dur: s(5) },
  profs: { from: s(10), dur: s(2.5) },
  outro: { from: s(12.5), dur: s(2.5) },
} as const;

export const PROMO_FRAMES = s(15);

const CREAM = "#FDFBF7";
const INK = "#1A1A1A";
const YELLOW = "#EAB308";
const NIGHT = "#0F172A";

/** Les avatars de l'app vivent sur /avatars/ ; dans Remotion, via staticFile. */
function withStaticImage(p: Professor): Professor {
  return p.image ? { ...p, image: staticFile(p.image.replace(/^\//, "")) } : p;
}

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const easeOut = Easing.bezier(0.33, 1, 0.68, 1);

/** 0 → 1 entre deux images, adouci. */
function progress(frame: number, start: number, end: number) {
  return interpolate(frame, [start, end], [0, 1], { ...clamp, easing: easeOut });
}

/** Apparition « fade + montée » d'un élément. */
function rise(frame: number, start: number, distance = 18): CSSProperties {
  const p = progress(frame, start, start + 10);
  return { opacity: p, transform: `translateY(${(1 - p) * distance}px)` };
}

/** Fondu d'entrée / de sortie d'une scène (évite les doubles expositions). */
function sceneFade(frame: number, dur: number, inFrames = 6, outFrames = 6) {
  return Math.min(progress(frame, 0, inFrames), 1 - progress(frame, dur - outFrames, dur));
}

/* ───────────────────────────── 1. Hook ───────────────────────────── */

function Hook() {
  const frame = useCurrentFrame();
  const write = progress(frame, 3, 24);
  const strike = progress(frame, 27, 36);
  const flash = interpolate(frame, [SCENES.hook.dur - 5, SCENES.hook.dur], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ background: "#070B14" }}>
      {/* La turbine de la filière aérospatiale (fond de l'app), qui tourne lentement */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        <Img
          src={staticFile("backgrounds/aerospace/aerospace-01.webp")}
          style={{
            height: 1100,
            width: "auto",
            maxWidth: "none",
            opacity: 0.32,
            filter: "grayscale(1) contrast(1.1)",
            transform: `rotate(${frame * 0.6}deg) scale(${1.05 + frame * 0.002})`,
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse 70% 55% at 50% 45%, rgb(7 11 20 / 0.35), rgb(7 11 20 / 0.92) 75%)" }}
      />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 34, padding: 36 }}>
        {/* La formule au feutre… fausse */}
        <div style={{ position: "relative" }}>
          <div
            className="font-hand"
            style={{
              fontSize: 76,
              fontWeight: 700,
              color: "#F8FAFC",
              lineHeight: 1,
              clipPath: `inset(-20% ${(1 - write) * 100}% -20% 0)`,
              whiteSpace: "nowrap",
            }}
          >
            M<sub style={{ fontSize: "0.5em" }}>max</sub> = −4 kNm
          </div>
          <svg viewBox="0 0 400 60" style={{ position: "absolute", left: -14, right: -14, top: "18%", width: "calc(100% + 28px)", height: 60 }}>
            <path
              d="M6 40 C 110 18, 260 44, 394 14"
              fill="none"
              stroke="#EF4444"
              strokeWidth="9"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - strike}
            />
          </svg>
        </div>

        <p
          className="font-display"
          style={{
            ...rise(frame, 10),
            fontSize: 38,
            lineHeight: 1.15,
            fontWeight: 600,
            color: "#FFFFFF",
            textAlign: "center",
            maxWidth: 440,
            margin: 0,
          }}
        >
          L'IA s'est encore trompée de <span style={{ color: YELLOW }}>signe</span>&nbsp;?
        </p>
      </AbsoluteFill>

      {/* Flash crème vers le reveal */}
      <AbsoluteFill style={{ background: CREAM, opacity: flash }} />
    </AbsoluteFill>
  );
}

/* ───────────────────────────── 2. Reveal ─────────────────────────── */

function Reveal() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 120, mass: 0.8 } });
  const out = progress(frame, SCENES.reveal.dur - 6, SCENES.reveal.dur);
  return (
    <AbsoluteFill style={{ background: CREAM, color: INK, alignItems: "center", justifyContent: "center", gap: 30, padding: 36 }}>
      <div style={{ opacity: 1 - out, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <div style={{ transform: `scale(${0.85 + 0.15 * pop})`, opacity: Math.min(1, pop * 1.4) }}>
          <Logo variant="stacked" markClassName="h-40 text-[#1A1A1A]" />
        </div>

        <p
          style={{ ...rise(frame, 4, 12) }}
          className="inline-flex items-center gap-2 rounded-full border border-[#E7E2D8] bg-white px-3 py-1 text-xs font-medium text-[#6B6B6B]"
        >
          <span className="size-1.5 rounded-full bg-[#EAB308]" />
          Résistance des matériaux · Technische Mechanik
        </p>

        <h1
          className="font-display text-center font-semibold tracking-tight"
          style={{ ...rise(frame, 7), fontSize: 40, lineHeight: 1.12, margin: 0, maxWidth: 460 }}
        >
          Le tuteur IA qui lit{" "}
          <span className="bg-[linear-gradient(transparent_58%,#EAB30866_58%)] px-1">ton propre polycopié</span>.
        </h1>
      </div>
      {/* Plongée vers la salle sombre du Hörsaal */}
      <AbsoluteFill style={{ background: NIGHT, opacity: out }} />
    </AbsoluteFill>
  );
}

/* ───────────────────────────── 3. Hörsaal ────────────────────────── */

/** Poutre sur deux appuis, q = 2 kN/m sur L = 4 m (unités SI pour le solveur). */
const BEAM = {
  v: 1,
  problem: {
    length: 4,
    supports: [
      { x: 0, kind: "festlager", name: "A" },
      { x: 4, kind: "loslager", name: "B" },
    ],
    pointLoads: [],
    distributedLoads: [{ from: 0, to: 4, q: 2000 }],
    pointMoments: [],
  },
  units: { length: "m", force: "kN" },
};

/** Le SVG que le VRAI solveur de Technische Mechanik de TRED dessine (même code que /chat). */
function useSolverSvg() {
  return useMemo(() => {
    const payload = parseBeamPayload(JSON.stringify(BEAM));
    if (!payload) throw new Error("Poutre de démonstration invalide");
    const r = solveMechanicsSafe(payloadToProblem(payload.problem));
    if (!r.ok) throw new Error(`Le solveur a refusé la poutre : ${r.error}`);
    return renderBeamSvg(payload, r);
  }, []);
}

function Tex({ tex, reveal }: { tex: string; reveal: number }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: true }), [tex]);
  return (
    <div
      style={{ clipPath: `inset(-10% ${(1 - reveal) * 100}% -10% 0)` }}
      className="[&_.katex]:text-[1.3em] [&_.katex-display]:my-2"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** La saisie dans le rebord, comme sur /classroom (inerte : c'est une vidéo). */
const COMPOSER = (
  <div className="flex items-center gap-2 rounded-2xl border border-white/50 bg-white/45 px-3 py-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_6px_16px_-10px_rgb(0_0_0/0.5)] backdrop-blur-xl backdrop-saturate-150">
    <span className="min-w-0 flex-1 truncate py-1 text-sm text-[#475569]">Pose ta question au professeur…</span>
    <span className="rounded-xl bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-[#0F172A]">Demander</span>
  </div>
);

function Hoersaal() {
  const frame = useCurrentFrame();
  const { dur } = SCENES.hoersaal;
  const svg = useSolverSvg();
  const kenta = useMemo(() => withStaticImage(PROFESSORS.genius), []);

  // Ce que le professeur écrit, dans l'ordre (en images de la scène).
  const line1 = progress(frame, 8, 24);
  const line2 = progress(frame, 26, 44);
  const note2 = progress(frame, 56, 66);
  const diagram = progress(frame, 66, 108);
  const stamp = spring({ frame: frame - 110, fps: FPS, config: { damping: 11, stiffness: 160 } });
  const solverStep = frame >= 56;

  // La caméra : le tableau « défile » vers la feuille du solveur. Piloté par
  // la timeline (translation), pas par scrollTop : identique à chaque rendu.
  const scroll = interpolate(frame, [50, 72], [0, BOARD_SCROLL], { ...clamp, easing: Easing.inOut(Easing.cubic) });

  const enter = progress(frame, 0, 10);
  const zoom = 1.06 - 0.06 * enter;

  return (
    <AbsoluteFill style={{ background: NIGHT, opacity: sceneFade(frame, dur, 1, 6) }}>
      {/* Fond de la filière derrière la salle, comme dans l'app (voile sombre) */}
      <Img
        src={staticFile("backgrounds/aerospace/aerospace-01.webp")}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }}
      />
      <AbsoluteFill style={{ transform: `scale(${zoom})`, opacity: enter }}>
        <HoersaalStage
          board={
            <GlassBoard
              eyebrow="Digitaler Hörsaal · Technische Mechanik"
              title="Einfeldträger"
              status={<BoardStatus>TRED écrit …</BoardStatus>}
              composer={COMPOSER}
            >
              <div className="flex w-full flex-col items-center gap-6" style={{ transform: `translateY(${-scroll}px)` }}>
              <StepChecklist
                steps={[
                  { label: "Lagerkräfte", done: solverStep },
                  { label: "Q(x) & M(x)", done: false },
                ]}
              />
              <PaperNote title="Schritt 1 — Lagerkräfte">
                <p className="font-hand text-xl text-[color:var(--board-muted)]">q = 2 kN/m, l = 4 m</p>
                <Tex tex={String.raw`A = B = \frac{q\,l}{2} = 4\,\mathrm{kN}`} reveal={line1} />
                <Tex tex={String.raw`M_{\max} = \frac{q\,l^2}{8} = 4\,\mathrm{kNm}`} reveal={line2} />
              </PaperNote>
              <div style={{ width: "100%", opacity: note2, transform: `translateY(${(1 - note2) * 24}px)` }}>
                <PaperNote
                  title="Schritt 2 — Q(x) und M(x)"
                  tilt={0.5}
                  highlight
                  stamp={
                    <span style={{ opacity: Math.min(1, stamp * 1.5), transform: `scale(${2 - stamp})`, display: "inline-flex" }}>
                      <SolverStamp />
                    </span>
                  }
                >
                  <div
                    className="[&_svg]:h-auto [&_svg]:w-full"
                    style={{ clipPath: `inset(0 ${(1 - diagram) * 100}% 0 0)` }}
                    dangerouslySetInnerHTML={{ __html: svg }}
                  />
                </PaperNote>
              </div>
              </div>
            </GlassBoard>
          }
        >
          {/* Le professeur flottant (même hologramme et même pastille que
              FloatingProfessor, sans le glisser-déposer de framer-motion,
              qui se mesure mal dans un rendu vidéo). */}
          <div className="absolute top-[64px] right-3 z-20 flex flex-col items-center gap-2">
            <HologramProfessor professor={kenta} pose="idle" size="float" />
            <div className="flex max-w-[15rem] items-center gap-1 rounded-full border border-white/10 bg-slate-950/70 py-1 pr-2 pl-2 text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)] backdrop-blur-md">
              <div className="min-w-0 px-1 leading-tight">
                <p className="font-display truncate text-xs font-semibold">{kenta.name}</p>
                <p className="truncate text-[10px] text-[#FACC15]">écrit au tableau</p>
              </div>
            </div>
          </div>
        </HoersaalStage>
      </AbsoluteFill>

      {/* La légende : ce qui rend TRED différent */}
      <Caption frame={frame} start={74} end={dur - 4}>
        Tracé par le solveur de Technische Mechanik, <span style={{ color: YELLOW }}>pas inventé par l'IA.</span>
      </Caption>
    </AbsoluteFill>
  );
}

function Caption({ frame, start, end, children }: { frame: number; start: number; end: number; children: ReactNode }) {
  const p = progress(frame, start, start + 8);
  const o = Math.min(p, 1 - progress(frame, end - 4, end));
  return (
    <div
      style={{
        position: "absolute",
        left: 20,
        right: 20,
        bottom: 118,
        opacity: o,
        transform: `translateY(${(1 - p) * 14}px)`,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <p
        className="font-display"
        style={{
          margin: 0,
          padding: "12px 18px",
          borderRadius: 18,
          background: "rgb(15 23 42 / 0.92)",
          color: "#FFFFFF",
          fontSize: 22,
          lineHeight: 1.2,
          fontWeight: 600,
          textAlign: "center",
          boxShadow: "0 18px 40px -16px rgb(0 0 0 / 0.8)",
          border: "1px solid rgb(255 255 255 / 0.12)",
        }}
      >
        {children}
      </p>
    </div>
  );
}

/* ───────────────────────────── 4. Les profs ──────────────────────── */

function Profs() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { dur } = SCENES.profs;
  const profs = useMemo(() => PROFESSOR_IDS.map((id) => withStaticImage(PROFESSORS[id])), []);
  return (
    <AbsoluteFill
      style={{
        opacity: sceneFade(frame, dur, 6, 6),
        background: `radial-gradient(ellipse 80% 45% at 50% 42%, rgb(234 179 8 / 0.16), transparent 70%), ${NIGHT}`,
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
        padding: 24,
      }}
    >
      <h2 className="font-display" style={{ ...rise(frame, 0), margin: 0, color: "#FFFFFF", fontSize: 38, fontWeight: 600 }}>
        Choisis ton prof.
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "22px 18px" }}>
        {profs.map((p, i) => {
          const k = spring({ frame: frame - 4 - i * 4, fps, config: { damping: 13, stiffness: 140 } });
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                opacity: Math.min(1, k * 1.4),
                transform: `translateY(${(1 - k) * 30}px) scale(${0.9 + 0.1 * k})`,
              }}
            >
              <div style={{ transform: "scale(0.82)", margin: -16 }}>
                <ProfessorHalo professor={p} size="lg" online={false} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p className="font-display" style={{ margin: 0, color: "#FFFFFF", fontSize: 21, fontWeight: 600 }}>
                  {p.name}
                </p>
                <p style={{ margin: 0, color: "rgb(255 255 255 / 0.65)", fontSize: 14 }}>{professorText(p.title, "fr")}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p
        className="font-display"
        style={{ ...rise(frame, 16), margin: 0, color: YELLOW, fontSize: 28, fontStyle: "italic", fontWeight: 600 }}
      >
        Le ton change, l'exactitude jamais.
      </p>
    </AbsoluteFill>
  );
}

/* ───────────────────────────── 5. Outro ──────────────────────────── */

function Outro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 15, stiffness: 120 } });
  return (
    <AbsoluteFill
      style={{
        background: CREAM,
        color: INK,
        alignItems: "center",
        justifyContent: "center",
        gap: 30,
        padding: 36,
        opacity: progress(frame, 0, 6),
      }}
    >
      <div style={{ transform: `scale(${0.88 + 0.12 * pop})` }}>
        <Logo variant="stacked" markClassName="h-36 text-[#1A1A1A]" />
      </div>
      <p
        style={{ ...rise(frame, 5), margin: 0, fontSize: 30, fontWeight: 600 }}
        className="inline-flex items-center gap-3 rounded-full bg-[#1A1A1A] px-6 py-3 text-white"
      >
        <span className="size-2.5 rounded-full bg-[#EAB308]" />
        tred-tutor.de
      </p>
      <p style={{ ...rise(frame, 9), margin: 0, fontSize: 19, color: "#6B6B6B", textAlign: "center", maxWidth: 400 }}>
        Conçu pour les étudiants en ingénierie en Allemagne.
      </p>
    </AbsoluteFill>
  );
}

/* ───────────────────────────── Montage ───────────────────────────── */

/**
 * Les composants de l'app affichent leurs images avec <img> (pas <Img> de
 * Remotion) : on retient chaque capture jusqu'à ce qu'elles soient décodées.
 */
function useImagesReady() {
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    const handle = delayRender("Images de l'app");
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        continueRender(handle);
      }
    };
    requestAnimationFrame(() => {
      const waits = Array.from(document.images).map((img) =>
        img.complete
          ? img.decode().catch(() => undefined)
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
      );
      void Promise.all(waits).then(finish);
    });
    return finish;
  }, [frame]);
}

export function HoersaalPromo() {
  useImagesReady();
  return (
    <AbsoluteFill style={{ background: NIGHT, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}>
      <Sequence from={SCENES.hook.from} durationInFrames={SCENES.hook.dur} name="Hook">
        <Hook />
      </Sequence>
      <Sequence from={SCENES.reveal.from} durationInFrames={SCENES.reveal.dur} name="Reveal">
        <Reveal />
      </Sequence>
      <Sequence from={SCENES.hoersaal.from} durationInFrames={SCENES.hoersaal.dur} name="Hörsaal">
        <Hoersaal />
      </Sequence>
      <Sequence from={SCENES.profs.from} durationInFrames={SCENES.profs.dur} name="Profs">
        <Profs />
      </Sequence>
      <Sequence from={SCENES.outro.from} durationInFrames={SCENES.outro.dur} name="Outro">
        <Outro />
      </Sequence>
    </AbsoluteFill>
  );
}
