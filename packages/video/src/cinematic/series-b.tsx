import type { ReactNode } from "react";
import { AbsoluteFill, random, useCurrentFrame } from "remotion";
import { Tex } from "../promo/board";
import { pop, progress } from "../promo/kit";
import type { VoFile } from "../promo/voice";
import { BAR, Broll, CinematicShort, EndCard, Glow, Kinetic, LOOKS, Screen, planFilm, type FilmCtx, type FilmScene, type Layer } from "./engine";
import { asset } from "./series-a";
import voEn1 from "../assets/vo-b-en1.json";
import voEn2 from "../assets/vo-b-en2.json";
import voEn3 from "../assets/vo-b-en3.json";
import voDe1 from "../assets/vo-b-de1.json";
import voDe2 from "../assets/vo-b-de2.json";
import voDe3 from "../assets/vo-b-de3.json";
import voiceEn1 from "../assets/vo-b-en1.mp3";
import voiceEn2 from "../assets/vo-b-en2.mp3";
import voiceEn3 from "../assets/vo-b-en3.mp3";
import voiceDe1 from "../assets/vo-b-de1.mp3";
import voiceDe2 from "../assets/vo-b-de2.mp3";
import voiceDe3 from "../assets/vo-b-de3.mp3";

/**
 * Courts-métrages « Cinematic », série B (2026-11-13) : la PUISSANCE et le
 * DESIGN de TRED. Ambiance « Tech Premium » : très sombre, métal, néon jaune.
 * 3 concepts × EN/DE, textes du fondateur mot pour mot (voiceovers.mjs, CINE_B).
 *
 *   1  The Magic Button     un laptop, le clic sur « Als Video erklären », la leçon animée
 *   2  Zero Hallucination   un glitch rouge qui se brise → les solveurs, chiffres exacts
 *   3  The Universal Brain  Droit → Médecine → Ingénierie, la même app
 *
 * L'interface est celle de l'app en mode sombre (captures préfixées dk-,
 * scripts/cinematic-captures.mjs --dark). Le laptop est une maquette dessinée
 * en CSS, sans marque. La carte « réponse d'IA » du concept 2 est une mise en
 * scène : aucun produit n'est nommé.
 */

const LOOK = LOOKS.tech;
const Y = LOOK.accent;
const dk = (id: string, name: string) => asset(`dk-${id}-${name}.jpg`);
const BOARD: [number, number, number, number] = [302, 118, 1612, 892];
/** La leçon qui se joue : images 05 à 13 (avant, l'affiche et les commandes ; après, la leçon est finie). */
const playerLayers = (id: string, every: number, from = 0): Layer[] => Array.from({ length: 9 }, (_, i) => ({ src: dk(id, `player${String(i + 5).padStart(2, "0")}`), at: i === 0 ? from : from + 6 + i * every, fade: 5 }));

/* ── La maquette de laptop ────────────────────────────────────────────── */

/** Un laptop en aluminium sombre, vu de trois quarts ; `children` = l'écran (1920 × 1080). */
function Laptop({ children, turn = [-16, -7], rise = 0 }: { children: ReactNode; turn?: [number, number]; rise?: number }) {
  const frame = useCurrentFrame();
  const k = progress(frame, 0, 90);
  const W = 1180;
  const S = W / 1920;
  const H = 1080 * S;
  return (
    <AbsoluteFill style={{ perspective: 2600, alignItems: "center", justifyContent: "center" }}>
      <div style={{ transformStyle: "preserve-3d", transform: `translateY(${-34 + rise - 14 * k}px) rotateX(5deg) rotateY(${turn[0] + (turn[1] - turn[0]) * k}deg) scale(${0.96 + 0.05 * k})` }}>
        {/* L'écran : dalle, liseré, reflet. */}
        <div style={{ width: W + 28, height: H + 28, padding: 14, borderRadius: 26, background: "linear-gradient(160deg, #3A3F4A, #15181F 40%, #0A0C11)", boxShadow: `0 0 0 1.5px rgb(255 255 255 / 0.14), 0 0 120px 10px ${Y}26, 0 60px 120px -30px rgb(0 0 0 / 0.9)` }}>
          <div style={{ position: "relative", width: W, height: H, borderRadius: 12, overflow: "hidden", background: "#05070C" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: 1920, height: 1080, transformOrigin: "0 0", transform: `scale(${S})` }}>{children}</div>
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg, rgb(255 255 255 / 0.09), transparent 32%)" }} />
          </div>
        </div>
        {/* Le socle, vu sur la tranche. */}
        <div style={{ width: W + 190, height: 20, marginLeft: -81, borderRadius: "4px 4px 18px 18px", background: "linear-gradient(180deg, #5A6070, #23262E 45%, #0D0F14)", boxShadow: `0 30px 60px -6px rgb(0 0 0 / 0.95), 0 14px 70px 0 ${Y}22` }}>
          <div style={{ width: 190, height: 7, margin: "0 auto", borderRadius: "0 0 10px 10px", background: "#0A0C11" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Fond d'ambiance sombre (clip Replicate) sous une maquette ou un titre. */
const Stage = ({ clip, from = 0, children, dim = 0.3 }: { clip: string; from?: number; children?: ReactNode; dim?: number }) => (
  <Broll src={asset(`broll-${clip}.mp4`)} from={from} rate={0.6} dim={dim}>
    {children}
  </Broll>
);

/** Un mot-étiquette en néon, en haut de l'image. */
function Tag({ text, at, until }: { text: string; at: number; until?: number }) {
  const frame = useCurrentFrame();
  if (frame < at - 2 || (until !== undefined && frame > until + 8)) return null;
  const k = pop(frame, at) * (until === undefined ? 1 : 1 - progress(frame, until, until + 8));
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: BAR + 38, display: "flex", justifyContent: "center" }}>
      <span className="font-display" style={{ padding: "12px 34px", borderRadius: 999, background: "rgb(7 10 18 / 0.82)", border: `2px solid ${Y}`, color: "#FFF", fontSize: 44, fontWeight: 600, letterSpacing: "-0.01em", boxShadow: `0 0 38px 2px ${Y}55`, opacity: Math.min(1, k * 1.4), transform: `scale(${0.86 + 0.14 * k})` }}>
        {text}
      </span>
    </div>
  );
}

/* ── 1. The Magic Button ──────────────────────────────────────────────── */

type Magic = { id: string; chipX: number; w: { click: string }; t: { walls: string; button: string; studio: [string, string]; end: string[] } };

function magicButton(c: Magic): FilmScene[] {
  return [
    {
      name: "Des murs de texte",
      span: 1,
      lead: 1.6,
      tail: 1.5,
      render: (ctx) => (
        <Stage clip="b1">
          <Laptop>
            <Screen layers={[{ src: dk(c.id, "page0") }, { src: dk(c.id, "page1"), at: ctx.voiceAt + 26, fade: 22 }]} cams={[{ at: 0, x: 960, y: 540, z: 1 }]} />
          </Laptop>
          <Kinetic lines={[{ text: c.t.walls, at: ctx.voiceAt + 4 }]} size={66} bottom={BAR + 26} align="center" accent={Y} />
        </Stage>
      ),
    },
    {
      name: "Ce bouton",
      span: 2,
      gap: 0.6,
      tail: 1.2,
      render: (ctx) => {
        const name = ctx.sentence(1);
        return (
          <Screen
            layers={[{ src: dk(c.id, "chip") }]}
            cams={[{ at: 0, x: 1000, y: 620, z: 1.05 }, { at: ctx.voiceAt + 30, x: c.chipX, y: 880, z: 1.9 }, { at: ctx.dur, x: c.chipX, y: 900, z: 2.2 }]}
            cursor={[{ at: 4, x: 820, y: 700 }, { at: name + 6, x: c.chipX + 14, y: 972 }]}
            overlay={<Tag text={c.t.button} at={name} />}
          >
            <Glow rect={[c.chipX - 74, 942, 148, 36]} at={ctx.voiceAt + 18} until={ctx.dur} />
          </Screen>
        );
      },
      cues: (ctx) => [{ at: ctx.sentence(1), kind: "pop", volume: 0.35 }],
    },
    {
      name: "Un clic : la leçon animée",
      span: 1,
      lead: 0.3,
      tail: 3.0,
      cut: true,
      render: (ctx) => {
        const click = Math.max(8, ctx.f(c.w.click) + 6);
        const player = click + 66;
        return (
          <Screen
            layers={[{ src: dk(c.id, "chip") }, { src: dk(c.id, "gen-script"), at: click + 7, fade: 10 }, { src: dk(c.id, "gen-voice"), at: click + 36, fade: 6 }, ...playerLayers(c.id, Math.max(6, Math.floor((ctx.dur - player - 8) / 9)), player)]}
            cams={[{ at: 0, x: c.chipX, y: 900, z: 2.2 }, { at: click + 6, x: c.chipX, y: 900, z: 2.2 }, { at: click + 34, x: 960, y: 540, z: 1.5 }, { at: player, x: 960, y: 540, z: 1.62 }, { at: ctx.dur, x: 960, y: 532, z: 2.0 }]}
            cursor={[{ at: 0, x: c.chipX + 14, y: 972 }, { at: click, x: c.chipX, y: 960, click: true }]}
            hideCursorAt={click + 12}
          />
        );
      },
      cues: (ctx) => {
        const click = Math.max(8, ctx.f(c.w.click) + 6);
        return [{ at: click, kind: "click", volume: 0.6 }, { at: click + 66, kind: "success", volume: 0.35 }];
      },
    },
    {
      name: "Un studio dans ton navigateur",
      span: 1,
      tail: 1.6,
      render: (ctx) => (
        <Stage clip="b1" from={2.4} dim={0.22}>
          <Laptop turn={[8, 15]}>
            <Screen layers={playerLayers(c.id, 7).slice(2).map((l, i) => ({ ...l, at: i === 0 ? 0 : i * 14 }))} cams={[{ at: 0, x: 960, y: 540, z: 1.9 }]} />
          </Laptop>
          <Kinetic lines={[{ text: c.t.studio[0], at: ctx.voiceAt + 2 }, { text: c.t.studio[1], at: ctx.voiceAt + 24, hot: true }]} size={58} x={120} bottom={BAR + 36} accent={Y} />
        </Stage>
      ),
    },
    {
      name: "Fin",
      span: 1,
      lead: 0.9,
      tail: 2.4,
      render: (ctx) => <EndCard logoAt={4} lines={c.t.end} linesAt={ctx.voiceAt} accent={Y} backdrop={<Stage clip="b1" from={4} dim={0.5} />} />,
      cues: (ctx) => [{ at: ctx.voiceAt, kind: "success", volume: 0.22 }],
    },
  ];
}

/* ── 2. Zero Hallucination ────────────────────────────────────────────── */

/** Des bandes de l'image qui se décalent, rouges : l'erreur. `power` 0–1. */
function Glitch({ children, power }: { children: ReactNode; power: number }) {
  const frame = useCurrentFrame();
  const tick = Math.floor(frame / 2);
  const bands = Array.from({ length: 6 }, (_, i) => {
    const y = random(`y${tick}-${i}`) * 100;
    const h = 3 + random(`h${tick}-${i}`) * 14;
    const dx = (random(`x${tick}-${i}`) - 0.5) * 150 * power;
    return { y, h, dx };
  });
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ transform: `translate(${(random(`s${tick}`) - 0.5) * 10 * power}px, 0)` }}>{children}</AbsoluteFill>
      {bands.map((b, i) => (
        <AbsoluteFill key={i} style={{ clipPath: `inset(${b.y}% 0 ${Math.max(0, 100 - b.y - b.h)}% 0)`, transform: `translateX(${b.dx}px)`, filter: "hue-rotate(-18deg) saturate(2.4)", mixBlendMode: "screen", opacity: 0.9 }}>
          {children}
        </AbsoluteFill>
      ))}
      <AbsoluteFill style={{ background: "repeating-linear-gradient(0deg, rgb(255 40 40 / 0.07) 0 2px, transparent 2px 5px)", opacity: 0.6 + 0.4 * power }} />
      <AbsoluteFill style={{ background: `rgb(255 20 30 / ${0.1 * power * (tick % 3 === 0 ? 1 : 0.3)})` }} />
    </AbsoluteFill>
  );
}

type Zero = {
  id: string;
  t: { label: string; says: string; wrong: string; lines: [string, string]; verified: [string, string, string]; end: [string, string] };
  w: { solvers: string; calc: string; unit: string; hundred: string };
  /** La page des courbes du solveur, puis celle du résultat. */
  curves: { page: string; x: number; y: number; z: number; rect: [number, number, number, number] };
  result: { page: string; x: number; y: number; z: number; rect: [number, number, number, number] };
};

function zeroHallucination(c: Zero): FilmScene[] {
  return [
    {
      name: "L'IA qui invente",
      span: 2,
      lead: 1.3,
      gap: 0.5,
      tail: 0.8,
      render: (ctx) => (
        <Stage clip="b2" dim={0.45}>
          <GlitchCard c={c} ctx={ctx} />
        </Stage>
      ),
      cues: (ctx) => [{ at: ctx.voiceAt + 30, kind: "pop", volume: 0.25 }, { at: ctx.dur - 12, kind: "whoosh", volume: 0.3 }],
    },
    {
      name: "TRED ne devine pas : les solveurs",
      span: 2,
      lead: 0.6,
      gap: 0.5,
      tail: 1.5,
      render: (ctx) => (
        <Screen layers={[{ src: dk(c.id, "wait") }, { src: dk(c.id, c.curves.page), at: 4, reveal: { rect: BOARD, dir: "down", dur: 40 } }]} cams={[{ at: 0, x: 1040, y: 500, z: 1.12 }, { at: ctx.sentence(1), x: 1040, y: 520, z: 1.2 }, { at: ctx.f(c.w.solvers) + 26, x: c.curves.x, y: c.curves.y, z: c.curves.z }, { at: ctx.dur, x: c.curves.x, y: c.curves.y, z: c.curves.z + 0.08 }]}>
          <Glow rect={c.curves.rect} at={ctx.f(c.w.solvers)} until={ctx.dur} radius={22} />
        </Screen>
      ),
      cues: (ctx) => [{ at: ctx.f(c.w.solvers), kind: "success", volume: 0.3 }],
    },
    {
      name: "Chaque calcul, chaque unité",
      span: 1,
      tail: 1.4,
      cut: true,
      render: (ctx) => {
        const ats = [ctx.f(c.w.calc), ctx.f(c.w.unit), ctx.f(c.w.hundred)];
        return (
          <Screen layers={[{ src: dk(c.id, c.curves.page) }, { src: dk(c.id, c.result.page), at: 2, fade: 12 }]} cams={[{ at: 0, x: 1040, y: c.result.y - 110, z: 1.25 }, { at: ctx.dur, x: 1000, y: c.result.y - 40, z: 1.42 }]}>
            {c.t.verified.map((label, i) => (
              <Stamp key={label} label={label} at={ats[i]} x={1190} y={c.result.y - 262 + i * 86} />
            ))}
          </Screen>
        );
      },
      cues: (ctx) => [c.w.calc, c.w.unit, c.w.hundred].map((w) => ({ at: ctx.f(w), kind: "pop" as const, volume: 0.3 })),
    },
    {
      name: "Enfin, la confiance",
      span: 1,
      tail: 1.6,
      cut: true,
      render: (ctx) => (
        <Screen layers={[{ src: dk(c.id, c.result.page) }]} cams={[{ at: 0, x: 1000, y: c.result.y - 40, z: 1.42 }, { at: ctx.dur, x: c.result.x, y: c.result.y, z: c.result.z }]}>
          <Glow rect={c.result.rect} at={ctx.voiceAt} until={ctx.dur} radius={12} />
        </Screen>
      ),
      cues: (ctx) => [{ at: ctx.voiceAt + 6, kind: "success", volume: 0.3 }],
    },
    {
      name: "Fin",
      span: 2,
      lead: 0.7,
      gap: 0.5,
      tail: 2.6,
      render: (ctx) => <EndCard logoAt={2} lines={c.t.end} linesAt={ctx.sentence(0)} lineAts={[ctx.sentence(0), ctx.sentence(1)]} accent={Y} />,
      cues: (ctx) => [{ at: ctx.sentence(1), kind: "success", volume: 0.22 }],
    },
  ];
}

/** La carte « réponse d'IA » : une formule fausse, de plus en plus instable. */
function GlitchCard({ c, ctx }: { c: Zero; ctx: FilmCtx }) {
  const frame = useCurrentFrame();
  const power = 0.25 + 0.75 * progress(frame, ctx.voiceAt + 20, ctx.dur - 6);
  const shatter = progress(frame, ctx.dur - 12, ctx.dur);
  return (
    <AbsoluteFill style={{ opacity: 1 - shatter * 0.6, transform: `scale(${1 + shatter * 0.18})` }}>
      <Glitch power={power}>
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 980, marginTop: -40, padding: "38px 46px 42px", borderRadius: 30, background: "rgb(16 10 14 / 0.9)", border: "2px solid rgb(255 70 70 / 0.75)", boxShadow: "0 0 90px 6px rgb(255 40 40 / 0.35)", color: "#FFF" }}>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#FF7A7A" }}>{c.t.label}</p>
            <p style={{ margin: "14px 0 6px", fontSize: 34, fontWeight: 500, color: "rgb(255 255 255 / 0.86)" }}>{c.t.says}</p>
            <div style={{ fontSize: 44, color: "#FFD5D5" }}>
              <Tex tex={String.raw`M_{\max} = \frac{q\,l^2}{4} \approx 37{,}2\ \mathrm{kNm}\ ?`} size={1.1} />
            </div>
            <p style={{ margin: "14px 0 0", display: "inline-flex", alignItems: "center", gap: 12, padding: "8px 20px", borderRadius: 999, background: "#E11D2E", fontSize: 26, fontWeight: 800, opacity: progress(frame, ctx.voiceAt + 30, ctx.voiceAt + 38) }}>✕ {c.t.wrong}</p>
          </div>
        </AbsoluteFill>
      </Glitch>
      <Kinetic lines={[{ text: c.t.lines[0], at: ctx.sentence(0) + 4 }, { text: c.t.lines[1], at: ctx.sentence(1), hot: true }]} size={50} bottom={BAR + 26} align="center" accent="#FF8A8A" />
    </AbsoluteFill>
  );
}

/** Un tampon « vérifié » posé sur la capture (repère de la capture). */
function Stamp({ label, at, x, y }: { label: string; at: number; x: number; y: number }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const k = pop(frame, at);
  return (
    <span style={{ position: "absolute", left: x, top: y, display: "inline-flex", alignItems: "center", gap: 12, padding: "12px 24px", borderRadius: 16, background: "rgb(7 10 18 / 0.9)", border: `2px solid ${Y}`, color: "#FFF", fontSize: 28, fontWeight: 700, boxShadow: `0 0 34px 2px ${Y}66`, transform: `scale(${0.7 + 0.3 * k}) rotate(${-3 + 3 * Math.min(1, k)}deg)`, opacity: Math.min(1, k * 1.5) }}>
      <span style={{ display: "grid", placeItems: "center", width: 34, height: 34, borderRadius: 17, background: Y, color: "#0F172A", fontSize: 22, fontWeight: 900 }}>✓</span>
      {label}
    </span>
  );
}

/* ── 3. The Universal Brain ───────────────────────────────────────────── */

type Brain = {
  ids: [string, string, string];
  subjects: [string, string, string];
  w: { three: [string, string, string]; tutor: string; circuits: string };
  t: { adapts: string; pocket: [string, string]; end: [string, string] };
};

function universalBrain(c: Brain): FilmScene[] {
  const focus = [
    { x: 940, y: 440, z: 1.35 },
    { x: 980, y: 560, z: 1.3 },
    { x: 760, y: 500, z: 1.45 },
  ];
  return [
    {
      name: "Droit, Médecine, Ingénierie",
      span: 1,
      lead: 1.6,
      tail: 1.2,
      render: (ctx) => (
        <Stage clip="b3" dim={0.2}>
          <Words words={c.subjects} ats={c.w.three.map((w) => ctx.f(w))} />
        </Stage>
      ),
      cues: (ctx) => c.w.three.map((w) => ({ at: ctx.f(w), kind: "pop" as const, volume: 0.3 })),
    },
    {
      name: "TRED s'adapte",
      span: 1,
      tail: 1.4,
      render: (ctx) => (
        <Stage clip="b3" from={1.6} dim={0.35}>
          <Laptop>
            <Screen layers={[{ src: dk(c.ids[0], "page0") }]} cams={[{ at: 0, x: 960, y: 540, z: 1 }]} />
          </Laptop>
          <Kinetic lines={[{ text: c.t.adapts, at: ctx.voiceAt + 2 }]} size={62} bottom={BAR + 26} align="center" accent={Y} />
        </Stage>
      ),
    },
    {
      name: "Du cas juridique au schéma électrique",
      span: 1,
      lead: 0.6,
      tail: 3.2,
      render: (ctx) => {
        const med = Math.max(ctx.voiceAt + 70, ctx.f(c.w.tutor) + 14);
        const eng = Math.max(med + 56, ctx.f(c.w.circuits) - 8);
        return (
          <Screen
            layers={[{ src: dk(c.ids[0], "page0") }, { src: dk(c.ids[1], "page0"), at: med, fade: 7 }, { src: dk(c.ids[2], "page0"), at: eng, fade: 7 }]}
            cams={[
              { at: 0, x: 1040, y: 520, z: 1.15 },
              { at: med - 6, x: focus[0].x, y: focus[0].y, z: focus[0].z },
              { at: med + 4, x: 1040, y: 540, z: 1.16 },
              { at: eng - 6, x: focus[1].x, y: focus[1].y, z: focus[1].z },
              { at: eng + 4, x: 1040, y: 520, z: 1.16 },
              { at: ctx.dur, x: focus[2].x, y: focus[2].y, z: focus[2].z },
            ]}
            overlay={
              <>
                <SubjectTag text={c.subjects[0]} at={6} until={med - 4} />
                <SubjectTag text={c.subjects[1]} at={med + 2} until={eng - 4} />
                <SubjectTag text={c.subjects[2]} at={eng + 2} />
              </>
            }
          />
        );
      },
      cues: (ctx) => {
        const med = Math.max(ctx.voiceAt + 70, ctx.f(c.w.tutor) + 14);
        const eng = Math.max(med + 56, ctx.f(c.w.circuits) - 8);
        return [{ at: med - 4, kind: "whoosh", volume: 0.3 }, { at: med + 2, kind: "pop", volume: 0.3 }, { at: eng - 4, kind: "whoosh", volume: 0.3 }, { at: eng + 2, kind: "pop", volume: 0.3 }];
      },
    },
    {
      name: "L'université dans la poche",
      span: 1,
      tail: 1.6,
      render: (ctx) => (
        <Stage clip="b3" from={3.2} dim={0.3}>
          <Laptop turn={[10, 17]}>
            <Screen layers={[{ src: dk(c.ids[2], "page0") }]} cams={[{ at: 0, x: 960, y: 540, z: 1 }]} />
          </Laptop>
          <Kinetic lines={[{ text: c.t.pocket[0], at: ctx.voiceAt + 2 }, { text: c.t.pocket[1], at: ctx.voiceAt + 22, hot: true }]} size={56} x={120} bottom={BAR + 36} accent={Y} />
        </Stage>
      ),
    },
    {
      name: "Fin",
      span: 2,
      lead: 1.0,
      gap: 0.5,
      tail: 2.8,
      render: (ctx) => <EndCard logoAt={2} lines={c.t.end} linesAt={ctx.sentence(0)} lineAts={[ctx.sentence(0), ctx.sentence(1)]} accent={Y} backdrop={<Stage clip="b3" from={4.4} dim={0.55} />} />,
      cues: (ctx) => [{ at: ctx.sentence(1), kind: "success", volume: 0.22 }],
    },
  ];
}

/** Trois mots géants, chacun à l'instant où la voix le dit. */
function Words({ words, ats }: { words: string[]; ats: number[] }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill className="font-display" style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 46 }}>
      {words.map((w, i) => {
        const k = progress(frame, ats[i], ats[i] + 14);
        const hot = frame >= ats[i] && (i === words.length - 1 || frame < ats[i + 1]);
        return (
          <span key={w} style={{ fontSize: 104, fontWeight: 600, letterSpacing: "-0.03em", color: hot ? Y : "#FFFFFF", opacity: k, transform: `translateY(${(1 - k) * 60}px)`, filter: `blur(${(1 - k) * 10}px)`, textShadow: hot ? `0 0 50px ${Y}88` : "0 6px 40px rgb(0 0 0 / 0.8)" }}>
            {w}
          </span>
        );
      })}
    </AbsoluteFill>
  );
}

/** L'étiquette de la filière, fixe en haut à droite de l'image. */
function SubjectTag({ text, at, until }: { text: string; at: number; until?: number }) {
  const frame = useCurrentFrame();
  if (frame < at || (until !== undefined && frame > until + 6)) return null;
  const k = pop(frame, at) * (until === undefined ? 1 : 1 - progress(frame, until, until + 6));
  return (
    <span className="font-display" style={{ position: "absolute", right: 90, top: BAR + 34, padding: "12px 34px", borderRadius: 999, background: Y, color: "#0F172A", fontSize: 46, fontWeight: 700, boxShadow: `0 0 50px 4px ${Y}77`, opacity: Math.min(1, k * 1.5), transform: `scale(${0.8 + 0.2 * k})`, transformOrigin: "right center" }}>
      {text}
    </span>
  );
}

/* ── Les six films ────────────────────────────────────────────────────── */

type Film = { id: string; vo: VoFile; voice: string; music: string; scenes: FilmScene[]; seed: number };

const FILMS: Film[] = [
  {
    id: "B-EN-1-The-Magic-Button", vo: voEn1, voice: voiceEn1, music: asset("music-tech1.mp3"), seed: 11,
    scenes: magicButton({ id: "en1", chipX: 1225, w: { click: "Click" }, t: { walls: "Endless walls of text.", button: "Explain as video", studio: ["A Hollywood studio.", "In your browser."], end: ["Try it on tred-tutor.de"] } }),
  },
  {
    id: "B-EN-2-Zero-Hallucination", vo: voEn2, voice: voiceEn2, music: asset("music-tech2.mp3"), seed: 12,
    scenes: zeroHallucination({
      id: "en2", w: { solvers: "deterministic", calc: "calculation", unit: "unit", hundred: "100" },
      t: { label: "AI answer", says: "The maximum bending moment is probably", wrong: "made up", lines: ["AI making up formulas?", "Yeah, me too."], verified: ["Every calculation", "Every unit", "100% verified"], end: ["Pure math.", "Zero hallucinations."] },
      curves: { page: "page1", x: 760, y: 400, z: 1.5, rect: [392, 110, 1260, 492] },
      result: { page: "page3", x: 900, y: 650, z: 1.6, rect: [333, 596, 1374, 140] },
    }),
  },
  {
    id: "B-EN-3-The-Universal-Brain", vo: voEn3, voice: voiceEn3, music: asset("music-tech3.mp3"), seed: 13,
    scenes: universalBrain({ ids: ["lawen", "meden", "circen"], subjects: ["Law", "Medicine", "Engineering"], w: { three: ["Law", "Medicine", "Engineering"], tutor: "tutor", circuits: "circuit" }, t: { adapts: "TRED adapts to your major.", pocket: ["The ultimate university.", "In your pocket."], end: ["One app.", "Every subject."] } }),
  },
  {
    id: "B-DE-1-Der-magische-Button", vo: voDe1, voice: voiceDe1, music: asset("music-tech1.mp3"), seed: 14,
    scenes: magicButton({ id: "de1", chipX: 1228, w: { click: "Klick" }, t: { walls: "Endlose Textwüsten.", button: "Als Video erklären", studio: ["Ein Hollywood-Studio.", "In deinem Browser."], end: ["Probier es aus."] } }),
  },
  {
    id: "B-DE-2-Null-Halluzinationen", vo: voDe2, voice: voiceDe2, music: asset("music-tech2.mp3"), seed: 15,
    scenes: zeroHallucination({
      id: "de2", w: { solvers: "deterministische", calc: "Berechnung", unit: "Einheit", hundred: "100" },
      t: { label: "KI-Antwort", says: "Das maximale Biegemoment ist vermutlich", wrong: "frei erfunden", lines: ["KI, die sich Formeln ausdenkt?", "Ja, ich auch nicht."], verified: ["Jede Berechnung", "Jede Einheit", "100% verifiziert"], end: ["Reine Mathematik.", "Null Halluzinationen."] },
      curves: { page: "page1", x: 1020, y: 530, z: 1.4, rect: [392, 380, 1260, 300] },
      result: { page: "page2", x: 900, y: 700, z: 1.5, rect: [333, 646, 1374, 130] },
    }),
  },
  {
    id: "B-DE-3-Das-universelle-Gehirn", vo: voDe3, voice: voiceDe3, music: asset("music-tech3.mp3"), seed: 16,
    scenes: universalBrain({ ids: ["lawde", "medde", "de1"], subjects: ["Jura", "Medizin", "Ingenieurwesen"], w: { three: ["Jura", "Medizin", "Ingenieurwesen"], tutor: "Tutor", circuits: "Schaltplänen" }, t: { adapts: "TRED passt sich deinem Studiengang an.", pocket: ["Die ultimative Universität.", "Für die Hosentasche."], end: ["Eine App.", "Jedes Fach."] } }),
  },
];

/** [id de composition, composant, durée en images] — pour Root.tsx. */
export const CINEMATIC_B = FILMS.map((film) => {
  const Component = () => <CinematicShort vo={film.vo} voice={film.voice} music={film.music} look={LOOK} scenes={film.scenes} seed={film.seed} musicVolume={0.55} />;
  return [`Cine-${film.id}`, Component, planFilm(film.vo, film.scenes).frames] as const;
});
