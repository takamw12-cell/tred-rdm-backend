import type { ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Check, Clock, FileText, Moon, Sparkles, X } from "lucide-react";
import { Logo } from "@/components/logo";
import { CREAM, INK, NIGHT, YELLOW, clamp, easeOut, pop, progress, rise } from "../promo/kit";

/**
 * Les briques visuelles de la campagne de 30 s. Les photos viennent des fonds
 * de l'app (packages/web/public/backgrounds, FLUX 1.1 Pro Ultra) : ce que
 * l'étudiant voit vraiment derrière son tableau de bord.
 */

export const BG = (cat: string, n: number) => `backgrounds/${cat}/${cat}-u${String(n).padStart(2, "0")}.webp`;
export const mark = (t: ReactNode) => <span className="bg-[linear-gradient(transparent_58%,#EAB30880_58%)] px-1">{t}</span>;

/* ── Photo plein écran, mouvement de caméra ──────────────────────────── */

type Move = "in" | "out" | "left" | "right" | "up";

export function Shot({ src, move = "in", veil = 0.35, children }: { src: string; move?: Move; veil?: number; children?: ReactNode }) {
  const frame = useCurrentFrame();
  const t = frame / 30;
  const z = move === "out" ? 1.22 - t * 0.035 : 1.06 + t * 0.035;
  const x = move === "left" ? -t * 9 : move === "right" ? t * 9 : 0;
  const y = move === "up" ? -t * 9 : 0;
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: NIGHT }}>
      <Img src={staticFile(src)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${z}) translate(${x}px, ${y}px)` }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgb(7 11 20 / ${veil + 0.25}) 0%, rgb(7 11 20 / ${veil * 0.5}) 40%, rgb(7 11 20 / ${veil + 0.3}) 100%)` }} />
      {children}
    </AbsoluteFill>
  );
}

/** Coupes rapides sur des photos, avec un « punch » de zoom à chaque coupe et l'étiquette de la filière. */
export function Montage({ items, every = 14, start = 0 }: { items: { src: string; label?: string }[]; every?: number; start?: number }) {
  const frame = useCurrentFrame();
  const i = Math.max(0, Math.min(items.length - 1, Math.floor((frame - start) / every)));
  const local = frame - start - i * every;
  const punch = 1 + 0.06 * Math.exp(-Math.max(0, local) / 4);
  const it = items[i];
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: NIGHT }}>
      <AbsoluteFill style={{ transform: `scale(${punch})` }}>
        <Shot key={it.src} src={it.src} move={i % 2 ? "left" : "in"} veil={0.25} />
      </AbsoluteFill>
      {/* Flash blanc très bref à la coupe. */}
      <AbsoluteFill style={{ background: "#FFF", opacity: interpolate(local, [0, 3], [0.18, 0], clamp) }} />
      {it.label && (
        <div style={{ position: "absolute", top: 150, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
          <span
            className="font-display"
            style={{
              ...rise(local, 0, 14, 6),
              padding: "10px 22px",
              borderRadius: 999,
              background: "rgb(253 251 247 / 0.94)",
              color: INK,
              fontSize: 30,
              fontWeight: 700,
              boxShadow: "0 18px 40px -16px rgb(0 0 0 / 0.8)",
              border: `2px solid ${YELLOW}`,
            }}
          >
            {it.label}
          </span>
        </div>
      )}
    </AbsoluteFill>
  );
}

/* ── Phrase choc, mot par mot ─────────────────────────────────────────── */

export function Punch({ words, at, size = 62, top = 300 }: { words: readonly ReactNode[]; at: number; size?: number; top?: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top, left: 28, right: 28, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "4px 14px" }}>
      {words.map((w, i) => {
        const k = pop(frame, at + i * 4);
        return (
          <span
            key={i}
            className="font-display"
            style={{
              display: "inline-block",
              color: "#FFFFFF",
              fontSize: size,
              fontWeight: 700,
              lineHeight: 1.04,
              letterSpacing: "-0.02em",
              opacity: Math.min(1, k * 1.6),
              transform: `translateY(${(1 - k) * 26}px) scale(${0.85 + 0.15 * k})`,
              textShadow: "0 6px 30px rgb(0 0 0 / 0.7)",
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
}

/* ── « Tu te noies dans les PDF » ─────────────────────────────────────── */

export function PdfAvalanche({ files, at }: { files: string[]; at: number }) {
  const frame = useCurrentFrame();
  const rise_ = progress(frame, at + 10, at + 60);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: `radial-gradient(ellipse 80% 60% at 50% 30%, #1B2A4A, ${NIGHT})` }}>
      {files.map((name, i) => {
        const start = at + i * 3;
        const fall = interpolate(frame, [start, start + 16], [-260, 0], { ...clamp, easing: easeOut });
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 30 + col * 165 + ((i * 37) % 23) - 11;
        const y = 760 - row * 92 - rise_ * 40;
        const rot = ((i * 53) % 30) - 15;
        return (
          <div
            key={name}
            style={{
              position: "absolute",
              left: x,
              top: y + fall,
              width: 150,
              padding: "12px 10px",
              borderRadius: 12,
              background: CREAM,
              color: INK,
              transform: `rotate(${rot}deg)`,
              boxShadow: "0 16px 30px -12px rgb(0 0 0 / 0.7)",
              opacity: frame >= start ? 1 : 0,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FileText size={18} color="#B91C1C" />
              <span style={{ fontSize: 10, fontWeight: 800, color: "#B91C1C" }}>PDF</span>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.15, wordBreak: "break-all" }}>{name}</span>
            <div style={{ height: 4, borderRadius: 2, background: "#E5E1D8", width: "80%" }} />
            <div style={{ height: 4, borderRadius: 2, background: "#E5E1D8", width: "60%" }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/* ── Le téléphone : le tableau de bord de TRED, sur un fond qui tourne ── */

export function Phone({
  greeting,
  cards,
  backgrounds,
  every = 30,
  at = 0,
  dark = true,
  scale = 1,
}: {
  greeting: string;
  cards: { title: string; sub: string }[];
  backgrounds: string[];
  every?: number;
  at?: number;
  dark?: boolean;
  scale?: number;
}) {
  const frame = useCurrentFrame();
  const k = progress(frame, at, at + 16);
  const n = Math.floor(frame / every);
  const fade = progress(frame % every, every - 10, every);
  const a = backgrounds[n % backgrounds.length];
  const b = backgrounds[(n + 1) % backgrounds.length];
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: 330,
        height: 680,
        marginLeft: -165,
        marginTop: -360,
        transform: `translateY(${(1 - k) * 140}px) scale(${scale * (0.92 + 0.08 * k)}) rotate(${(1 - k) * -6}deg)`,
        opacity: k,
        borderRadius: 46,
        padding: 10,
        background: "linear-gradient(145deg,#2A2F3A,#0B0E14)",
        boxShadow: "0 50px 90px -30px rgb(0 0 0 / 0.95), inset 0 0 0 1.5px rgb(255 255 255 / 0.12)",
      }}
    >
      <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 37, overflow: "hidden", background: NIGHT }}>
        <Img src={staticFile(a)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${1.05 + (frame % every) * 0.002})` }} />
        <Img src={staticFile(b)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: fade }} />
        <div style={{ position: "absolute", inset: 0, background: dark ? "linear-gradient(180deg, rgb(7 11 20 / 0.8), rgb(11 18 34 / 0.45) 45%, rgb(7 11 20 / 0.6))" : "linear-gradient(180deg, rgb(253 251 247 / 0.85), rgb(253 251 247 / 0.65))" }} />
        <div style={{ position: "absolute", top: 10, left: "50%", marginLeft: -48, width: 96, height: 26, borderRadius: 14, background: "#000" }} />
        <div style={{ position: "absolute", inset: 0, padding: "54px 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Logo markClassName={`h-6 ${dark ? "text-white" : "text-[#1A1A1A]"}`} />
            <Moon size={16} color={dark ? YELLOW : INK} />
          </div>
          <h3 className="font-display" style={{ margin: "8px 0 0", color: dark ? "#FFF" : INK, fontSize: 26, fontWeight: 600 }}>
            {greeting}
          </h3>
          {cards.map((c, i) => (
            <div
              key={c.title}
              style={{
                ...rise(frame, at + 12 + i * 6),
                padding: "12px 14px",
                borderRadius: 18,
                background: dark ? "rgb(255 255 255 / 0.1)" : "rgb(255 255 255 / 0.7)",
                border: `1px solid ${dark ? "rgb(255 255 255 / 0.16)" : "rgb(0 0 0 / 0.06)"}`,
                backdropFilter: "blur(14px)",
                color: dark ? "#FFF" : INK,
              }}
            >
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>{c.title}</p>
              <p style={{ margin: "3px 0 0", fontSize: 11.5, opacity: 0.75 }}>{c.sub}</p>
            </div>
          ))}
          <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
            <div style={{ flex: 1, borderRadius: 14, padding: "10px 12px", background: dark ? "rgb(255 255 255 / 0.12)" : "#FFF", color: dark ? "#CBD5E1" : "#64748B", fontSize: 11 }}>…</div>
            <div style={{ borderRadius: 14, padding: "10px 14px", background: YELLOW, color: NIGHT, fontSize: 11, fontWeight: 800 }}>↑</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Simulation de Klausur : chrono, questions, correction ───────────── */

export function ExamSim({
  title,
  timerFrom,
  questions,
  at,
  correctAt,
  scoreLabel,
  score,
}: {
  title: string;
  timerFrom: number; // secondes affichées au départ
  questions: string[];
  at: number;
  correctAt: number;
  scoreLabel: string;
  score: number; // 0-100
}) {
  const frame = useCurrentFrame();
  const left = Math.max(0, timerFrom - Math.floor(Math.max(0, frame - at) * 2.4));
  const hh = String(Math.floor(left / 3600)).padStart(2, "0");
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const ring = progress(frame, correctAt + questions.length * 7, correctAt + questions.length * 7 + 26);
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 110, gap: 18 }}>
      <div style={{ ...rise(frame, at), display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", borderRadius: 999, background: "rgb(15 23 42 / 0.85)", border: "1px solid rgb(234 179 8 / 0.5)", color: YELLOW, fontFamily: "ui-monospace, monospace", fontSize: 26, fontWeight: 800 }}>
        <Clock size={24} /> {hh}:{mm}:{ss}
      </div>
      <div style={{ ...rise(frame, at + 4), width: 470, borderRadius: 26, padding: "20px 22px", background: "rgb(253 251 247 / 0.96)", color: INK, boxShadow: "0 40px 80px -30px rgb(0 0 0 / 0.9)" }}>
        <p className="font-display" style={{ margin: "0 0 12px", fontSize: 24, fontWeight: 700 }}>{title}</p>
        {questions.map((q, i) => {
          const c = correctAt + i * 7;
          const ok = i !== 1; // une erreur, corrigée : c'est le but de l'exercice
          const k = pop(frame, c);
          return (
            <div key={q} style={{ ...rise(frame, at + 8 + i * 5), display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: i ? "1px solid #ECE7DC" : "none" }}>
              <span style={{ flex: 1, fontSize: 16, lineHeight: 1.25 }}>{q}</span>
              <span style={{ transform: `scale(${k})`, width: 30, height: 30, borderRadius: 15, display: "grid", placeItems: "center", background: ok ? "#16A34A" : "#DC2626", color: "#FFF" }}>
                {ok ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ ...rise(frame, correctAt + questions.length * 7), display: "flex", alignItems: "center", gap: 16 }}>
        <svg width={92} height={92} viewBox="0 0 92 92">
          <circle cx={46} cy={46} r={38} fill="none" stroke="rgb(255 255 255 / 0.15)" strokeWidth={9} />
          <circle cx={46} cy={46} r={38} fill="none" stroke={YELLOW} strokeWidth={9} strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 38 * ring * (score / 100)} 999`} transform="rotate(-90 46 46)" />
          <text x={46} y={53} textAnchor="middle" fill="#FFF" fontSize={22} fontWeight={800} fontFamily="Inter, sans-serif">{Math.round(ring * score)}%</text>
        </svg>
        <span className="font-display" style={{ color: "#FFF", fontSize: 26, fontWeight: 600, maxWidth: 260, lineHeight: 1.15 }}>{scoreLabel}</span>
      </div>
    </AbsoluteFill>
  );
}

/* ── « L'IA invente » contre « le solveur calcule » ───────────────────── */

export function GuessVsSolver({
  at,
  solveAt,
  guessLabel,
  solverLabel,
  tex,
}: {
  at: number;
  solveAt: number;
  guessLabel: string;
  solverLabel: ReactNode;
  tex: { wrong: string; right: string };
}) {
  const frame = useCurrentFrame();
  const glitch = frame < solveAt ? Math.sin(frame * 2.3) * 3 : 0;
  const strike = progress(frame, solveAt - 8, solveAt);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", gap: 28, background: `radial-gradient(ellipse 70% 50% at 50% 45%, rgb(220 38 38 / ${0.16 * (1 - strike)}), transparent 70%), ${NIGHT}` }}>
      <div style={{ ...rise(frame, at), position: "relative", transform: `translateX(${glitch}px)`, width: 460, padding: "18px 20px", borderRadius: 22, background: "rgb(255 255 255 / 0.06)", border: "1.5px dashed rgb(248 113 113 / 0.7)", color: "#FCA5A5" }}>
        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{guessLabel}</p>
        <p style={{ margin: "8px 0 0", fontFamily: "ui-monospace, monospace", fontSize: 26, color: "#FFF", opacity: 1 - 0.55 * strike }}>{tex.wrong}</p>
        <div style={{ position: "absolute", left: 16, right: 16, top: "62%", height: 4, borderRadius: 2, background: "#DC2626", transform: `scaleX(${strike})`, transformOrigin: "left" }} />
      </div>
      <div style={{ ...rise(frame, solveAt), width: 460, padding: "18px 20px", borderRadius: 22, background: CREAM, color: INK, boxShadow: "0 30px 60px -24px rgb(0 0 0 / 0.9)", border: `2px solid ${YELLOW}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#15803D" }}>✓ Solver</p>
          <span style={{ transform: `scale(${pop(frame, solveAt + 8)}) rotate(-6deg)` }}>{solverLabel}</span>
        </div>
        <p style={{ margin: "8px 0 0", fontFamily: "ui-monospace, monospace", fontSize: 26 }}>{tex.right}</p>
      </div>
    </AbsoluteFill>
  );
}

/* ── Une ligne de texte posée sur une photo ──────────────────────────── */

export function Caption({ at, children, top = 140 }: { at: number; children: ReactNode; top?: number }) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top, left: 26, right: 26, display: "flex", justifyContent: "center" }}>
      <h2 className="font-display text-center" style={{ ...rise(frame, at), margin: 0, color: "#FFF", fontSize: 44, lineHeight: 1.08, fontWeight: 650, textShadow: "0 6px 30px rgb(0 0 0 / 0.8)" }}>
        {children}
      </h2>
    </div>
  );
}

export function SparkleBurst({ at }: { at: number }) {
  const frame = useCurrentFrame();
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const d = progress(frame, at, at + 18) * 170;
        return (
          <span key={i} style={{ position: "absolute", left: 270 + Math.cos(a) * d - 12, top: 470 + Math.sin(a) * d - 12, opacity: 1 - progress(frame, at + 10, at + 24), color: YELLOW }}>
            <Sparkles size={24} />
          </span>
        );
      })}
    </>
  );
}

/** Un calque qui apparaît en fondu entre deux images (relatives à la scène). */
export function FadeLayer({ from, to, children }: { from: number; to: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  return <AbsoluteFill style={{ opacity: progress(frame, from, to) }}>{children}</AbsoluteFill>;
}
