import { useMemo, type ReactNode } from "react";
import katex from "katex";
import { AbsoluteFill, useCurrentFrame } from "remotion";
// Les VRAIS composants du Digitaler Hörsaal (packages/web).
import { BoardStatus, GlassBoard } from "@/components/hoersaal";
import { HoersaalStage } from "@/components/hoersaal-stage";
import { HologramProfessor } from "@/components/hologram-professor";
import { professorText, type Professor } from "../../../web/src/api/lib/professors";
import { PhotoBackdrop, progress } from "./kit";

export type Lang = "fr" | "de" | "en";

/** Les textes d'interface de l'app (packages/web/src/web/i18n/messages). */
export const UI: Record<Lang, { writing: string; profWriting: string; profExplaining: string; ask: string; send: string }> = {
  fr: { writing: "TRED écrit …", profWriting: "écrit au tableau", profExplaining: "explique", ask: "Pose une question sur ton cours …", send: "Envoyer" },
  de: { writing: "TRED schreibt …", profWriting: "schreibt an die Tafel", profExplaining: "erklärt", ask: "Stelle eine Frage zu deinem Kurs …", send: "Senden" },
  en: { writing: "TRED is writing …", profWriting: "is writing on the board", profExplaining: "is explaining", ask: "Ask a question about your course …", send: "Send" },
};

/**
 * Le Hörsaal de l'app : la scène, la Tafel (cadre en métal brossé, verre,
 * rebord « Farben » avec la saisie) et le professeur en hologramme.
 * `scroll` fait monter le contenu du tableau (piloté par la timeline).
 */
export function HoersaalBoard({
  lang,
  eyebrow,
  title,
  professor,
  writing = true,
  scroll = 0,
  backdrop,
  children,
}: {
  lang: Lang;
  eyebrow: string;
  title: string;
  professor: Professor;
  writing?: boolean;
  scroll?: number;
  backdrop?: string;
  children: ReactNode;
}) {
  const ui = UI[lang];
  const composer = (
    <div className="flex items-center gap-2 rounded-2xl border border-white/50 bg-white/45 px-3 py-1.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_6px_16px_-10px_rgb(0_0_0/0.5)] backdrop-blur-xl backdrop-saturate-150">
      <span className="min-w-0 flex-1 truncate py-1 text-sm text-[#475569]">{ui.ask}</span>
      <span className="rounded-xl bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-[#0F172A]">{ui.send}</span>
    </div>
  );
  return (
    <AbsoluteFill>
      {backdrop && <PhotoBackdrop src={backdrop} opacity={0.5} veil={0.5} />}
      <HoersaalStage
        board={
          <GlassBoard
            eyebrow={eyebrow}
            title={title}
            status={writing ? <BoardStatus>{ui.writing}</BoardStatus> : undefined}
            composer={composer}
          >
            <div className="flex w-full flex-col items-center gap-6" style={{ transform: `translateY(${-scroll}px)` }}>
              {children}
            </div>
          </GlassBoard>
        }
      >
        {/* Le professeur flottant (même hologramme et même pastille que FloatingProfessor,
            sans le glisser-déposer de framer-motion, qui se mesure mal dans une vidéo). */}
        <div className="absolute top-[64px] right-3 z-20 flex flex-col items-center gap-2">
          <HologramProfessor professor={professor} pose="idle" size="float" />
          <div className="flex max-w-[15rem] items-center gap-1 rounded-full border border-white/10 bg-slate-950/75 py-1 pr-2 pl-2 text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)] backdrop-blur-md">
            <div className="min-w-0 px-1 leading-tight">
              <p className="font-display truncate text-xs font-semibold">{professor.name}</p>
              <p className="truncate text-[10px] text-[#FACC15]">
                {writing ? ui.profWriting : professorText(professor.title, lang)}
              </p>
            </div>
          </div>
        </div>
      </HoersaalStage>
    </AbsoluteFill>
  );
}

/** Une formule KaTeX qui « s'écrit » de gauche à droite. */
export function Tex({ tex, reveal = 1, size = 1.25 }: { tex: string; reveal?: number; size?: number }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: true }), [tex]);
  return (
    <div
      style={{ clipPath: `inset(-10% ${(1 - reveal) * 100}% -10% 0)`, fontSize: `${size}em` }}
      className="[&_.katex-display]:my-1.5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Une ligne écrite au feutre (police Caveat de l'app), révélée de gauche à droite. */
export function HandLine({
  children,
  reveal = 1,
  className = "",
  muted = false,
}: {
  children: ReactNode;
  reveal?: number;
  className?: string;
  muted?: boolean;
}) {
  return (
    <p
      className={`font-hand text-[22px] leading-snug ${muted ? "text-[color:var(--board-muted)]" : ""} ${className}`}
      style={{ clipPath: `inset(-20% ${(1 - reveal) * 100}% -20% 0)`, margin: "4px 0" }}
    >
      {children}
    </p>
  );
}

/** Apparition d'un bloc sur le tableau (fondu + légère montée). */
export function Appear({ at, children, className = "" }: { at: number; children: ReactNode; className?: string }) {
  const frame = useCurrentFrame();
  const p = progress(frame, at, at + 9);
  return (
    <div className={`w-full ${className}`} style={{ opacity: p, transform: `translateY(${(1 - p) * 22}px)` }}>
      {children}
    </div>
  );
}
