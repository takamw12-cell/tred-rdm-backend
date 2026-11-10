import type { ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Check, FileText } from "lucide-react";
import { Logo } from "@/components/logo";
import { ProfessorHalo } from "@/components/hoersaal";
import { professorText, type Professor } from "../../../web/src/api/lib/professors";
import { CREAM, INK, NIGHT, YELLOW, pop, progress, rise } from "./kit";
import type { Lang } from "./board";

/** Fin de vidéo : logo TRED, signature, adresse du site. */
export function Outro({ tagline, sub, taglineAt = 6 }: { tagline: ReactNode; sub?: string; taglineAt?: number }) {
  const frame = useCurrentFrame();
  const k = pop(frame, 0);
  return (
    <AbsoluteFill style={{ background: CREAM, color: INK, alignItems: "center", justifyContent: "center", gap: 28, padding: 36 }}>
      <div style={{ transform: `scale(${0.86 + 0.14 * k})`, opacity: Math.min(1, k * 1.5) }}>
        <Logo variant="stacked" markClassName="h-36 text-[#1A1A1A]" />
      </div>
      <h2
        className="font-display text-center font-semibold tracking-tight"
        style={{ ...rise(frame, taglineAt), margin: 0, fontSize: 38, lineHeight: 1.12, maxWidth: 470 }}
      >
        {tagline}
      </h2>
      <p
        style={{ ...rise(frame, taglineAt + 8), margin: 0, fontSize: 28, fontWeight: 600 }}
        className="inline-flex items-center gap-3 rounded-full bg-[#1A1A1A] px-6 py-3 text-white"
      >
        <span className="size-2.5 rounded-full bg-[#EAB308]" />
        tred-tutor.de
      </p>
      {sub && (
        <p style={{ ...rise(frame, taglineAt + 14), margin: 0, fontSize: 18, color: "#6B6B6B", textAlign: "center", maxWidth: 420 }}>
          {sub}
        </p>
      )}
    </AbsoluteFill>
  );
}

/** Le vestiaire : les 4 professeurs ; `chosen` s'illumine à l'image `chooseAt`. */
export function ProfGrid({
  profs,
  lang,
  title,
  chosen,
  chooseAt,
}: {
  profs: Professor[];
  lang: Lang;
  title: string;
  chosen?: string;
  chooseAt?: number;
}) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 80% 45% at 50% 42%, rgb(234 179 8 / 0.16), transparent 70%), ${NIGHT}`,
        alignItems: "center",
        justifyContent: "flex-start",
        paddingTop: 120,
        gap: 24,
      }}
    >
      <h2 className="font-display" style={{ ...rise(frame, 0), margin: 0, color: "#FFFFFF", fontSize: 34, fontWeight: 600 }}>
        {title}
      </h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 18px" }}>
        {profs.map((p, i) => {
          const k = pop(frame, 3 + i * 3);
          const isChosen = chosen === p.id && chooseAt !== undefined && frame >= chooseAt;
          const sel = chooseAt !== undefined ? progress(frame, chooseAt, chooseAt + 6) : 0;
          const dim = chooseAt !== undefined && chosen && chosen !== p.id ? 1 - 0.55 * sel : 1;
          return (
            <div
              key={p.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                padding: "14px 10px",
                borderRadius: 22,
                width: 210,
                opacity: Math.min(1, k * 1.4) * dim,
                transform: `translateY(${(1 - k) * 28}px) scale(${(0.9 + 0.1 * k) * (isChosen ? 1 + 0.05 * sel : 1)})`,
                background: isChosen ? "rgb(234 179 8 / 0.14)" : "rgb(255 255 255 / 0.04)",
                border: `1.5px solid ${isChosen ? YELLOW : "rgb(255 255 255 / 0.08)"}`,
              }}
            >
              <div style={{ transform: "scale(0.78)", margin: -18 }}>
                <ProfessorHalo professor={p} size="lg" online={isChosen} />
              </div>
              <p className="font-display" style={{ margin: 0, color: "#FFFFFF", fontSize: 20, fontWeight: 600 }}>
                {p.name}
              </p>
              <p style={{ margin: 0, color: "rgb(255 255 255 / 0.65)", fontSize: 13 }}>{professorText(p.title, lang)}</p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}

/** Une tuile de filière (icône + nom), qui s'allume à l'image `at`. */
export function SubjectTile({ icon, label, at, check }: { icon: ReactNode; label: string; at: number; check?: number }) {
  const frame = useCurrentFrame();
  const on = progress(frame, at, at + 6);
  const k = pop(frame, at);
  const ok = check !== undefined ? pop(frame, check) : 0;
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        width: 210,
        height: 190,
        borderRadius: 26,
        background: on > 0 ? `rgb(253 251 247 / ${0.06 + 0.94 * on})` : "rgb(255 255 255 / 0.06)",
        border: `1.5px solid ${on > 0.5 ? YELLOW : "rgb(255 255 255 / 0.14)"}`,
        color: on > 0.5 ? INK : "rgb(255 255 255 / 0.5)",
        transform: `scale(${0.92 + 0.08 * (on > 0 ? k : 0)})`,
        boxShadow: on > 0.5 ? "0 24px 50px -20px rgb(234 179 8 / 0.55)" : "none",
      }}
    >
      <div style={{ color: on > 0.5 ? "#A16207" : "rgb(255 255 255 / 0.45)" }}>{icon}</div>
      <span className="font-display" style={{ fontSize: 24, fontWeight: 600 }}>
        {label}
      </span>
      {ok > 0 && (
        <span
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            transform: `scale(${ok})`,
            background: YELLOW,
            color: NIGHT,
            borderRadius: 999,
            width: 30,
            height: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={18} strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

/** Un document de cours qui arrive dans TRED (barre de progression, puis coche). */
export function DocUpload({
  name,
  meta,
  at,
  doneLabel,
}: {
  name: string;
  meta: string;
  at: number;
  doneLabel: string;
}) {
  const frame = useCurrentFrame();
  const k = pop(frame, at);
  const bar = progress(frame, at + 6, at + 30);
  const done = frame >= at + 30;
  return (
    <div
      style={{
        opacity: Math.min(1, k * 1.4),
        transform: `translateY(${(1 - k) * -40}px) rotate(${(1 - k) * -4}deg)`,
        width: 400,
        borderRadius: 20,
        background: "#FFFFFF",
        boxShadow: "0 30px 60px -24px rgb(0 0 0 / 0.6)",
        padding: 18,
        display: "flex",
        gap: 14,
        alignItems: "center",
        color: INK,
      }}
    >
      <div
        style={{
          width: 56,
          height: 68,
          borderRadius: 10,
          background: "#FEF3C7",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#A16207",
          flexShrink: 0,
        }}
      >
        <FileText size={30} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 17 }}>{name}</p>
        <p style={{ margin: "2px 0 8px", fontSize: 13, color: "#6B6B6B" }}>{meta}</p>
        <div style={{ height: 7, borderRadius: 99, background: "#F1EDE4", overflow: "hidden" }}>
          <div style={{ width: `${bar * 100}%`, height: "100%", background: YELLOW }} />
        </div>
      </div>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 99,
          background: done ? "#10B981" : "#F1EDE4",
          color: "#FFFFFF",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${done ? pop(frame, at + 30) : 1})`,
        }}
        title={doneLabel}
      >
        {done && <Check size={20} strokeWidth={3} />}
      </div>
    </div>
  );
}
