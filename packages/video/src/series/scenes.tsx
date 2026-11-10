import type { ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BookText, Check, Eye, Headphones, MessagesSquare, Shuffle } from "lucide-react";
import { ProfessorHalo } from "@/components/hoersaal";
import { professorText, type Professor } from "../../../web/src/api/lib/professors";
import { npvAt } from "../../../web/src/api/lib/solvers/finance-solver";
import { en as enMessages } from "@/i18n/messages/en";
import { de as deMessages } from "@/i18n/messages/de";
import { CREAM, INK, NIGHT, PhotoBackdrop, YELLOW, clamp, easeOut, pop, progress, rise } from "../promo/kit";
import { DocUpload } from "../promo/parts";

/* ── Deux panneaux qui s'ouvrent quand la voix les nomme ─────────────── */

export type PanelDef = { at: number; icon: ReactNode; label: string; img?: string; tint?: string };

export function SplitPanels({ panels }: { panels: PanelDef[] }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ flexDirection: "column", gap: 4, background: NIGHT }}>
      {panels.map((p, i) => {
        const o = progress(frame, p.at - 4, p.at + 8);
        const k = pop(frame, p.at);
        return (
          <div
            key={p.label}
            style={{
              position: "relative",
              flex: 1,
              overflow: "hidden",
              clipPath: i % 2 === 0 ? `inset(0 ${(1 - o) * 100}% 0 0)` : `inset(0 0 0 ${(1 - o) * 100}%)`,
              background: p.tint ?? NIGHT,
            }}
          >
            {p.img && <PhotoBackdrop src={p.img} opacity={0.75} veil={0.55} />}
            {/* Panneau du bas : contenu remonté, les sous-titres occupent le bas de l'écran. */}
            <AbsoluteFill style={{ alignItems: "center", justifyContent: i % 2 === 0 ? "center" : "flex-start", paddingTop: i % 2 === 0 ? 0 : 56, gap: 14 }}>
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
                {p.icon}
              </div>
              <span className="font-display text-center" style={{ ...rise(frame, p.at + 4), color: "#FFFFFF", fontSize: 40, fontWeight: 600, padding: "0 20px", lineHeight: 1.1 }}>
                {p.label}
              </span>
            </AbsoluteFill>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

/* ── Nuage de filières (taxonomie réelle de l'app) ───────────────────── */

export type ChipDef = { label: string; at: number; icon?: ReactNode; strong?: boolean };

export function ChipCloud({ title, chips, kicker }: { title: ReactNode; chips: ChipDef[]; kicker?: ReactNode }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 80% 50% at 50% 45%, rgb(234 179 8 / 0.14), transparent 70%), ${NIGHT}`,
        alignItems: "center",
        paddingTop: 120,
        gap: 26,
      }}
    >
      <h2 className="font-display text-center" style={{ ...rise(frame, 2), margin: 0, color: "#FFFFFF", fontSize: 40, fontWeight: 600, lineHeight: 1.1, padding: "0 24px" }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10, padding: "0 22px" }}>
        {chips.map((c) => {
          const k = pop(frame, c.at);
          return (
            <span
              key={c.label}
              style={{
                opacity: Math.min(1, k * 1.5),
                transform: `scale(${0.7 + 0.3 * k})`,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: c.strong ? "11px 18px" : "8px 14px",
                borderRadius: 999,
                background: c.strong ? CREAM : "rgb(255 255 255 / 0.08)",
                border: `1.5px solid ${c.strong ? YELLOW : "rgb(255 255 255 / 0.16)"}`,
                color: c.strong ? INK : "#FFFFFF",
                fontSize: c.strong ? 22 : 17,
                fontWeight: c.strong ? 700 : 500,
              }}
            >
              {c.icon}
              {c.label}
            </span>
          );
        })}
      </div>
      {kicker && (
        <div style={{ ...rise(frame, chips[chips.length - 1].at + 10), color: YELLOW, fontSize: 24, fontWeight: 700 }} className="font-display">
          {kicker}
        </div>
      )}
    </AbsoluteFill>
  );
}

/* ── Les profs défilent, chacun avec une matière ─────────────────────── */

export function ProfCarousel({ items, title }: { items: { prof: Professor; subject: string; at: number }[]; title: ReactNode }) {
  const frame = useCurrentFrame();
  let idx = 0;
  items.forEach((it, i) => {
    if (frame >= it.at) idx = i;
  });
  const cur = items[idx];
  const k = pop(frame, cur.at);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 70% 40% at 50% 45%, rgb(234 179 8 / 0.22), transparent 70%), ${NIGHT}`,
        alignItems: "center",
        justifyContent: "center",
        gap: 26,
      }}
    >
      <h2 className="font-display text-center" style={{ ...rise(frame, 0), margin: 0, color: "#FFFFFF", fontSize: 36, fontWeight: 600, position: "absolute", top: 110 }}>
        {title}
      </h2>
      <div style={{ transform: `scale(${0.85 + 0.25 * k}) rotate(${(1 - k) * -6}deg)`, opacity: Math.min(1, k * 1.5) }}>
        <ProfessorHalo professor={cur.prof} size="lg" />
      </div>
      <div style={{ textAlign: "center", opacity: Math.min(1, k * 1.5) }}>
        <p className="font-display" style={{ margin: 0, color: "#FFFFFF", fontSize: 32, fontWeight: 600 }}>
          {cur.prof.name}
        </p>
        <span
          style={{ display: "inline-block", marginTop: 12, padding: "8px 18px", borderRadius: 999, background: YELLOW, color: NIGHT, fontWeight: 700, fontSize: 20 }}
        >
          {cur.subject}
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, position: "absolute", bottom: 250 }}>
        {items.map((it, i) => (
          <span key={i} style={{ width: i === idx ? 26 : 8, height: 8, borderRadius: 99, background: i === idx ? YELLOW : "rgb(255 255 255 / 0.3)" }} />
        ))}
      </div>
    </AbsoluteFill>
  );
}

/* ── Plusieurs documents qui arrivent ────────────────────────────────── */

export function DocStack({ title, docs, doneLabel }: { title: ReactNode; docs: { name: string; meta: string; at: number }[]; doneLabel: string }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ alignItems: "center", paddingTop: 150, gap: 18 }}>
      <PhotoBackdrop src="backgrounds/general/bg-03.webp" opacity={0.5} veil={0.75} />
      <h2 className="font-display text-center" style={{ ...rise(frame, 2), margin: 0, color: "#FFFFFF", fontSize: 36, fontWeight: 600, lineHeight: 1.1, position: "relative" }}>
        {title}
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, position: "relative", marginTop: 8 }}>
        {docs.map((d) => (
          <DocUpload key={d.name} name={d.name} meta={d.meta} at={d.at} doneLabel={doneLabel} />
        ))}
      </div>
    </AbsoluteFill>
  );
}

/* ── Style d'apprentissage (réglages de l'app, textes réels) ─────────── */

const STYLE_ICONS = { visual: Eye, auditory: Headphones, text: BookText, interactive: MessagesSquare, balanced: Shuffle } as const;
type StyleKey = keyof typeof STYLE_ICONS;

export function StylePicker({ lang, highlights, chosen }: { lang: "en" | "de"; highlights: { style: StyleKey; at: number }[]; chosen?: { style: StyleKey; at: number } }) {
  const frame = useCurrentFrame();
  const m = (lang === "en" ? enMessages : deMessages).settings;
  const rows: { key: StyleKey; label: string; desc: string }[] = [
    { key: "visual", label: m.lsVisual, desc: m.lsVisualDesc },
    { key: "auditory", label: m.lsAuditory, desc: m.lsAuditoryDesc },
    { key: "text", label: m.lsText, desc: m.lsTextDesc },
    { key: "interactive", label: m.lsInteractive, desc: m.lsInteractiveDesc },
    { key: "balanced", label: m.lsBalanced, desc: m.lsBalancedDesc },
  ];
  const active = highlights.filter((h) => frame >= h.at).at(-1)?.style;
  const picked = chosen && frame >= chosen.at ? chosen.style : undefined;
  return (
    <AbsoluteFill style={{ background: CREAM, alignItems: "center", paddingTop: 110, color: INK }}>
      <div style={{ width: 470, ...rise(frame, 0, 30) }}>
        <p className="font-display" style={{ margin: 0, fontSize: 30, fontWeight: 600 }}>
          {m.learningStyleSection}
        </p>
        <p style={{ margin: "6px 0 18px", fontSize: 15, color: "#6B6B6B" }}>{m.learningStyleDesc}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((r, i) => {
            const Icon = STYLE_ICONS[r.key];
            const on = r.key === (picked ?? active);
            const k = pop(frame, 4 + i * 3);
            return (
              <div
                key={r.key}
                style={{
                  opacity: Math.min(1, k * 1.5),
                  transform: `translateX(${(1 - k) * 30}px) scale(${on ? 1.03 : 1})`,
                  display: "flex",
                  gap: 14,
                  alignItems: "center",
                  padding: "13px 15px",
                  borderRadius: 18,
                  background: on ? "#FEF9C3" : "#FFFFFF",
                  border: `2px solid ${on ? YELLOW : "#E7E2D8"}`,
                  boxShadow: on ? "0 16px 30px -18px rgb(234 179 8 / 0.9)" : "none",
                }}
              >
                <span style={{ width: 42, height: 42, borderRadius: 12, background: on ? YELLOW : "#F1EDE4", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Icon size={22} />
                </span>
                <span style={{ flex: 1 }}>
                  <b style={{ fontSize: 17 }}>{r.label}</b>
                  <span style={{ display: "block", fontSize: 13, color: "#6B6B6B", lineHeight: 1.3 }}>{r.desc}</span>
                </span>
                {picked === r.key && (
                  <span style={{ transform: `scale(${pop(frame, chosen!.at)})`, background: "#10B981", color: "#FFF", borderRadius: 99, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={16} strokeWidth={3} />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
}

/* ── Les solveurs de TRED (packages/web/src/api/lib/solvers) ─────────── */

export function ToolGrid({ title, tools, stampAt, stamp }: { title: ReactNode; tools: { label: string; icon: ReactNode; at: number }[]; stampAt: number; stamp: string }) {
  const frame = useCurrentFrame();
  const k = pop(frame, stampAt);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 80% 50% at 50% 45%, rgb(56 189 248 / 0.12), transparent 70%), ${NIGHT}`,
        alignItems: "center",
        paddingTop: 120,
        gap: 24,
      }}
    >
      <h2 className="font-display text-center" style={{ ...rise(frame, 2), margin: 0, color: "#FFFFFF", fontSize: 36, fontWeight: 600, lineHeight: 1.1, padding: "0 24px" }}>
        {title}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {tools.map((t) => {
          const kk = pop(frame, t.at);
          return (
            <div
              key={t.label}
              style={{
                opacity: Math.min(1, kk * 1.5),
                transform: `scale(${0.85 + 0.15 * kk})`,
                width: 220,
                padding: "16px 14px",
                borderRadius: 18,
                background: "rgb(255 255 255 / 0.06)",
                border: "1.5px solid rgb(255 255 255 / 0.12)",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span style={{ color: YELLOW }}>{t.icon}</span>
              <span style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.2 }}>{t.label}</span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          opacity: Math.min(1, k * 1.5),
          transform: `scale(${2.2 - 1.2 * k}) rotate(-6deg)`,
          border: "4px double #60A5FA",
          color: "#93C5FD",
          borderRadius: 8,
          padding: "8px 18px",
          fontFamily: "ui-monospace, monospace",
          fontWeight: 800,
          letterSpacing: "0.18em",
          fontSize: 18,
          textTransform: "uppercase",
          marginTop: 10,
        }}
      >
        <Check size={16} strokeWidth={3} style={{ display: "inline", marginRight: 6 }} />
        {stamp}
      </div>
    </AbsoluteFill>
  );
}

/* ── Schémas scientifiques (tracés au feutre sur la Tafel) ───────────── */

const BOARD_INK = "var(--board-ink, #1B2A4A)";

/** Circulation sanguine : petite et grande circulation, valves dans l'ordre. */
export function CirculationDiagram({ draw, labels }: { draw: number; labels: Record<string, string> }) {
  const boxes = [
    { id: "ra", x: 40, y: 150 },
    { id: "rv", x: 40, y: 250 },
    { id: "lungs", x: 160, y: 20 },
    { id: "la", x: 280, y: 150 },
    { id: "lv", x: 280, y: 250 },
    { id: "body", x: 160, y: 360 },
  ];
  const seg = (i: number, n: number) => interpolate(draw, [i / n, (i + 1) / n], [0, 1], clamp);
  const order = ["ra", "rv", "lungs", "la", "lv", "body"];
  const arrows = [
    { d: "M95 195 L95 245", label: labels.tricuspid, lx: 102, ly: 225 },
    { d: "M95 295 C 95 330, 20 120, 150 50", label: labels.pulmonary, lx: 6, ly: 120 },
    { d: "M290 50 C 340 60, 340 100, 335 145", label: "", lx: 0, ly: 0 },
    { d: "M335 195 L335 245", label: labels.mitral, lx: 342, ly: 225 },
    { d: "M335 295 C 335 330, 330 360, 280 380", label: labels.aortic, lx: 300, ly: 345 },
    { d: "M160 385 C 60 385, 40 300, 40 280", label: "", lx: 0, ly: 0 },
  ];
  return (
    <svg viewBox="0 0 440 420" style={{ width: "100%", height: "auto" }}>
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={BOARD_INK} />
        </marker>
      </defs>
      {boxes.map((b) => {
        const i = order.indexOf(b.id);
        const o = seg(i, order.length);
        const red = b.id === "la" || b.id === "lv" || b.id === "body";
        const wide = b.id === "lungs" || b.id === "body";
        return (
          <g key={b.id} opacity={o} transform={`translate(${(1 - o) * -8} 0)`}>
            <rect x={b.x} y={b.y} width={wide ? 130 : 110} height={45} rx={12} fill={red ? "#FEE2E2" : "#DBEAFE"} stroke={red ? "#B91C1C" : "#1D4ED8"} strokeWidth={2} />
            <text x={b.x + (wide ? 65 : 55)} y={b.y + 28} textAnchor="middle" fontFamily="Caveat, cursive" fontSize={22} fontWeight={700} fill={BOARD_INK}>
              {labels[b.id]}
            </text>
          </g>
        );
      })}
      {arrows.map((a, i) => {
        const o = seg(i + 0.6, arrows.length + 0.6);
        return (
          <g key={i}>
            <path d={a.d} fill="none" stroke={BOARD_INK} strokeWidth={2.4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - o} markerEnd={o > 0.95 ? "url(#arr)" : undefined} />
            {a.label && (
              <text x={a.lx} y={a.ly} fontFamily="Caveat, cursive" fontSize={17} fill="#64748B" opacity={o}>
                {a.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Potentiel d'action d'un neurone : −70 mV → +30 mV → hyperpolarisation → repos. */
export function ActionPotential({ draw, labels }: { draw: number; labels: { rest: string; depol: string; repol: string; hyper: string; threshold: string } }) {
  const X0 = 50;
  const Y = (mv: number) => 230 - (mv + 90) * 1.7; // −90 mV → 230, +40 mV → 9
  const pts: [number, number][] = [
    [0, -70], [40, -70], [55, -55], [62, -55], [75, 30], [90, 20], [110, -75], [125, -82], [160, -72], [200, -70], [330, -70],
  ];
  const path = pts.map(([t, v], i) => `${i ? "L" : "M"}${X0 + t} ${Y(v)}`).join(" ");
  const show = (from: number) => interpolate(draw, [from, from + 0.12], [0, 1], clamp);
  return (
    <svg viewBox="0 0 400 260" style={{ width: "100%", height: "auto" }}>
      <line x1={X0} y1={10} x2={X0} y2={240} stroke="#94A3B8" strokeWidth={1.5} />
      <line x1={X0} y1={Y(-70)} x2={385} y2={Y(-70)} stroke="#94A3B8" strokeWidth={1} strokeDasharray="4 4" />
      <line x1={X0} y1={Y(-55)} x2={385} y2={Y(-55)} stroke="#F59E0B" strokeWidth={1} strokeDasharray="2 5" opacity={show(0.15)} />
      {[30, 0, -55, -70].map((mv) => (
        <text key={mv} x={X0 - 6} y={Y(mv) + 4} textAnchor="end" fontSize={11} fill="#64748B">
          {mv}
        </text>
      ))}
      <text x={X0 - 6} y={8} textAnchor="end" fontSize={11} fill="#64748B">mV</text>
      <path d={path} fill="none" stroke="#1D4ED8" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      <g fontFamily="Caveat, cursive" fontSize={18} fill={BOARD_INK}>
        <text x={X0 + 2} y={Y(-70) - 8} opacity={show(0.05)}>{labels.rest}</text>
        <text x={X0 + 200} y={Y(-55) - 6} fill="#B45309" fontSize={15} opacity={show(0.2)}>{labels.threshold}</text>
        <text x={X0 + 28} y={Y(10)} opacity={show(0.4)}>{labels.depol}</text>
        <text x={X0 + 100} y={Y(0)} opacity={show(0.6)}>{labels.repol}</text>
        <text x={X0 + 120} y={Y(-82) + 22} opacity={show(0.78)}>{labels.hyper}</text>
      </g>
    </svg>
  );
}

/** Courbe C₀(i) d'une investissement — calculée par le solveur financier de TRED (npvAt). */
export function NpvCurve({ cashflows, rate, irr, draw, labels }: { cashflows: number[]; rate: number; irr: number; draw: number; labels: { x: string; y: string; irr: string } }) {
  const W = 400, H = 230, L = 50, B = 195;
  const xs = Array.from({ length: 41 }, (_, k) => k * 0.005); // 0 % … 20 %
  const ys = xs.map((i) => npvAt(cashflows, i));
  const yMax = Math.max(...ys), yMin = Math.min(...ys);
  const X = (i: number) => L + (i / 0.2) * (W - L - 15);
  const Yv = (v: number) => 20 + ((yMax - v) / (yMax - yMin)) * (B - 20);
  const d = xs.map((i, k) => `${k ? "L" : "M"}${X(i).toFixed(1)} ${Yv(ys[k]).toFixed(1)}`).join(" ");
  const showIrr = interpolate(draw, [0.85, 1], [0, 1], clamp);
  return (
    <svg viewBox={`0 0 ${W} ${H + 10}`} style={{ width: "100%", height: "auto" }}>
      <line x1={L} y1={Yv(0)} x2={W - 10} y2={Yv(0)} stroke="#94A3B8" strokeWidth={1.4} />
      <line x1={L} y1={12} x2={L} y2={B + 5} stroke="#94A3B8" strokeWidth={1.4} />
      {[0, 5, 10, 15, 20].map((p) => (
        <text key={p} x={X(p / 100)} y={B + 22} textAnchor="middle" fontSize={11} fill="#64748B">{p} %</text>
      ))}
      <text x={W - 12} y={B + 38} textAnchor="end" fontSize={12} fill="#64748B">{labels.x}</text>
      <text x={L + 4} y={14} fontSize={12} fill="#64748B">{labels.y}</text>
      <path d={d} fill="none" stroke="#059669" strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      <circle cx={X(rate)} cy={Yv(npvAt(cashflows, rate))} r={5} fill="#EAB308" opacity={interpolate(draw, [0.4, 0.5], [0, 1], clamp)} />
      <g opacity={showIrr}>
        <circle cx={X(irr)} cy={Yv(0)} r={6} fill="#DC2626" />
        <text x={X(irr) + 8} y={Yv(0) - 10} fontSize={14} fontWeight={700} fill="#DC2626">{labels.irr}</text>
      </g>
    </svg>
  );
}

/** Question d'examen à choix : la bonne réponse se valide à `answerAt`. */
export function ExamChoices({ options, correct, answerAt }: { options: string[]; correct: number; answerAt: number }) {
  const frame = useCurrentFrame();
  const ok = progress(frame, answerAt, answerAt + 6);
  return (
    <div className="mt-2 grid grid-cols-1 gap-2">
      {options.map((o, i) => {
        const isOk = i === correct && ok > 0;
        return (
          <div
            key={o}
            className="flex items-center gap-3 rounded-xl border-2 px-3 py-2 text-[15px]"
            style={{
              ...rise(frame, 6 + i * 4, 10, 8),
              borderColor: isOk ? "#16A34A" : "#E2E8F0",
              background: isOk ? `rgb(220 252 231 / ${ok})` : "#FFFFFF",
              transform: `${(rise(frame, 6 + i * 4, 10, 8).transform as string) ?? ""} scale(${isOk ? 1 + 0.03 * ok : 1})`,
            }}
          >
            <span className="flex size-7 items-center justify-center rounded-full font-bold" style={{ background: isOk ? "#16A34A" : "#F1F5F9", color: isOk ? "#FFF" : INK }}>
              {isOk ? <Check size={16} strokeWidth={3} /> : String.fromCharCode(65 + i)}
            </span>
            <span style={{ color: INK }}>{o}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Un graphique d'offre et de demande, au feutre. */
export function SupplyDemand({ draw, labels }: { draw: number; labels: { p: string; q: string; s: string; d: string; eq: string } }) {
  const o = (a: number) => interpolate(draw, [a, a + 0.35], [0, 1], { ...clamp, easing: easeOut });
  return (
    <svg viewBox="0 0 300 200" style={{ width: "100%", height: "auto" }}>
      <path d="M30 10 L30 180 L290 180" fill="none" stroke="#94A3B8" strokeWidth={1.5} />
      <text x={36} y={18} fontSize={13} fill="#64748B">{labels.p}</text>
      <text x={286} y={196} fontSize={13} textAnchor="end" fill="#64748B">{labels.q}</text>
      <path d="M45 165 L270 30" stroke="#1D4ED8" strokeWidth={3} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - o(0)} />
      <path d="M45 30 L270 165" stroke="#DC2626" strokeWidth={3} fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - o(0.25)} />
      <g fontFamily="Caveat, cursive" fontSize={20} fontWeight={700}>
        <text x={262} y={26} fill="#1D4ED8" opacity={o(0.3)}>{labels.s}</text>
        <text x={262} y={160} fill="#DC2626" opacity={o(0.55)}>{labels.d}</text>
      </g>
      <g opacity={o(0.65)}>
        <circle cx={157.5} cy={97.5} r={6} fill="#EAB308" />
        <path d="M157.5 97.5 L157.5 180 M157.5 97.5 L30 97.5" stroke="#EAB308" strokeDasharray="4 4" strokeWidth={1.5} />
        <text x={166} y={92} fontFamily="Caveat, cursive" fontSize={18} fill={BOARD_INK}>{labels.eq}</text>
      </g>
    </svg>
  );
}

export { professorText };
