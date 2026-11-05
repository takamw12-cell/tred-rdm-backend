import {
  BookOpen,
  CircleHelp,
  CornerDownLeft,
  FileText,
  GraduationCap,
  LayoutDashboard,
  MessageSquare,
  Pause,
  PenLine,
  Play,
  Settings,
  Sigma,
  Volume2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { MarkdownContent } from "@/components/markdown-content";
import {
  BoardStatus,
  GlassBoard,
  PaperNote,
  ProfessorHalo,
  ROOM_BG,
  SolverStamp,
  StepChecklist,
} from "@/components/hoersaal";
import { professorText, useProfessor } from "@/lib/professors";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Digitaler Hörsaal — maquette visuelle (aucune donnée, aucune IA).
 *
 * L'idée : entrer dans un amphithéâtre, pas sur un site web.
 *
 *   ┌──────────┬────────────────────────────────────┬──────────────┐
 *   │ Sidebar  │  salle sombre (dégradé bleu nuit)  │ Professeur   │
 *   │ 240px    │  ┌── cadre métal brossé ────────┐  │ 360px        │
 *   │          │  │ tableau en verre, éclairé    │  │ photo + halo │
 *   │          │  │ notes posées + aimants       │  │ jaune        │
 *   │          │  └──────── rebord (marqueurs) ──┘  │              │
 *   └──────────┴────────────────────────────────────┴──────────────┘
 *
 * Écriture : police manuscrite Caveat (auto-hébergée, public/fonts) pour ce
 * que le professeur ÉCRIT ; Inter / Fraunces pour l'interface. Les formules
 * restent en KaTeX : l'exactitude passe avant le style.
 *
 * SLOTS — chaque zone porte un `data-slot` qui correspond au calque Figma du
 * même nom (voir GUIDE_FOUNDER.md, Étape A). Les composants « premium » se
 * branchent via les props de <VirtualClassroom> sans refondre la mise en page :
 *
 *   sidebar   ↔ Figma « Sidebar »               (défaut : <Sidebar />)
 *   board     ↔ Figma « Tafel »                 (défaut : <TafelPlaceholderContent />)
 *   avatar    ↔ Figma « Professor/AvatarSlot »  (défaut : professeur choisi, lib/professors.ts)
 *
 * L'avatar temps réel (HeyGen LiveAvatar) ne sera rendu que si
 * VITE_AVATAR_ENABLED=true ET qu'un composant est passé dans `avatar`.
 */

export const AVATAR_ENABLED = import.meta.env.VITE_AVATAR_ENABLED === "true";

export interface VirtualClassroomSlots {
  /** Remplace toute la colonne de gauche. */
  sidebar?: ReactNode;
  /** Remplace le contenu du tableau (sous l'en-tête). */
  board?: ReactNode;
  /** Vidéo de l'avatar (ex. <LiveAvatarStream />). Ignoré si le flag est éteint. */
  avatar?: ReactNode;
}

const NAV = [
  { icon: LayoutDashboard, label: "Tableau de bord" },
  { icon: MessageSquare, label: "Tuteur IA", active: true },
  { icon: PenLine, label: "Exercices" },
  { icon: Sigma, label: "Formules" },
  { icon: FileText, label: "Documents" },
  { icon: BookOpen, label: "Cours" },
];

const DONE_STEPS = ["Beobachtung", "Physik"];


export function VirtualClassroom({ sidebar, board, avatar }: VirtualClassroomSlots = {}) {
  return (
    <div
      data-slot="virtual-classroom"
      // La salle : sombre, éclairée par le haut, comme un amphi lumières baissées.
      className={cn("flex h-screen w-full overflow-hidden text-white", ROOM_BG)}
    >
      {sidebar ?? <Sidebar />}
      <Tafel>{board ?? <TafelPlaceholderContent />}</Tafel>
      <ProfessorPanel avatar={AVATAR_ENABLED ? avatar : undefined} />
    </div>
  );
}

/* ── Sidebar ─────────────────────────────────────────────────────────── */

function Sidebar() {
  return (
    <aside
      data-slot="sidebar"
      className="flex w-[240px] shrink-0 flex-col border-r border-white/5 bg-[#0F172A]/90 px-4 py-6 text-white shadow-[8px_0_40px_-12px_rgb(0_0_0/0.6)]"
    >
      <div className="mb-10 flex items-center gap-2.5 px-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-[#EAB308] text-[#0F172A] shadow-[0_0_24px_-4px_rgb(234_179_8/0.6)]">
          <GraduationCap className="size-5" />
        </span>
        <span className="font-display text-xl font-semibold tracking-tight">TRED</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ icon: Icon, label, active }) => (
          <button
            key={label}
            type="button"
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors",
              active
                ? "bg-[#EAB308] text-[#0F172A] shadow-[0_6px_20px_-8px_rgb(234_179_8/0.7)]"
                : "text-white/70 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>

      <div className="mt-auto">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Settings className="size-4" />
          Paramètres
        </button>
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3 ring-1 ring-white/5">
          <span className="flex size-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold">
            RE
          </span>
          <div className="text-xs leading-tight">
            <p className="font-medium">Rached</p>
            <p className="text-white/55">Elektrotechnik · 2. Sem.</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ── Tafel ───────────────────────────────────────────────────────────── */

/**
 * Le tableau de la maquette : le même <GlassBoard> que le vrai tuteur
 * (components/hoersaal.tsx), avec un spot au-dessus et des feutres cliquables.
 */
function Tafel({ children }: { children: ReactNode }) {
  return (
    <main
      data-slot="tafel"
      className="relative flex min-w-0 flex-1 flex-col items-stretch justify-center px-10 py-8"
    >
      {/* Le spot au-dessus du tableau */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-48 bg-[radial-gradient(ellipse_50%_100%_at_50%_0%,rgb(255_255_255/0.10),transparent)]"
      />
      <GlassBoard
        eyebrow="Digitaler Hörsaal · Grundlagen der Elektrotechnik"
        title="Kirchhoffsche Gesetze"
        status={<BoardStatus>Le professeur écrit…</BoardStatus>}
        interactiveLedge
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-6">{children}</div>
      </GlassBoard>
    </main>
  );
}

/** Contenu de démonstration : sera remplacé par les étapes réelles (lib/tafel.ts). */
function TafelPlaceholderContent() {
  return (
    <>
      <StepChecklist
        steps={[...DONE_STEPS.map((label) => ({ label, done: true })), { label: "Gleichungen", done: false }]}
      />
      <PaperNote title="Schritt 3 — Gleichungen" stamp={<SolverStamp />}>
        <div className="[&_.katex]:text-[1.5em] [&_.katex-display]:my-4 [&_.katex-display]:!overflow-visible">
          <MarkdownContent
            content={
              "Knotenregel: $I_1 = I_2 + I_3$\n\n" +
              "$$\n" +
              "I_1 = \\frac{U_q}{R_1 + R_2 \\parallel R_3} = \\frac{12\\,\\mathrm{V}}{2\\,\\Omega + 2\\,\\Omega} = 3\\,\\mathrm{A}\n" +
              "$$"
            }
          />
        </div>
        <p className="font-hand mt-2 text-xl text-[color:var(--board-muted)]">
          R₂ ∥ R₃ — zwei gleiche Widerstände parallel ergeben die Hälfte.
        </p>
      </PaperNote>
    </>
  );
}

/* ── Professeur ──────────────────────────────────────────────────────── */

/** Le professeur choisi par l'étudiant (vestiaire), éclairé par le tableau. */
export function ProfessorAvatar({ video }: { video?: ReactNode }) {
  const { locale } = useT();
  const professor = useProfessor();
  return (
    <div data-slot="professor-avatar" className="flex flex-col items-center text-center">
      <ProfessorHalo professor={professor} video={video} />
      <h2 className="font-display mt-6 text-xl font-semibold text-white">{professor.name}</h2>
      <p className="text-sm text-white/60">{professorText(professor.title, locale)}</p>
    </div>
  );
}

type ProfessorMode = "answer" | "ask";

/** « Je réponds » / « Pose une question » — juste sous l'avatar. */
function ModeSwitch({ mode, onChange }: { mode: ProfessorMode; onChange: (m: ProfessorMode) => void }) {
  const options: { value: ProfessorMode; label: string; icon: typeof CircleHelp }[] = [
    { value: "answer", label: "Je réponds", icon: CornerDownLeft },
    { value: "ask", label: "Pose une question", icon: CircleHelp },
  ];
  return (
    <div
      data-slot="professor-mode"
      aria-label="Mode d'échange avec le professeur"
      className="grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1 ring-1 ring-white/10"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors",
            mode === value
              ? "bg-[#EAB308] text-[#0F172A] shadow-[0_6px_18px_-8px_rgb(234_179_8/0.8)]"
              : "text-white/70 hover:bg-white/10 hover:text-white",
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

function AudioBar() {
  const [playing, setPlaying] = useState(false);
  return (
    <div data-slot="audio-bar" className="w-full rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#EAB308] text-[#0F172A] shadow-[0_0_20px_-4px_rgb(234_179_8/0.7)] transition-transform hover:scale-105"
        >
          {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-white">
            <Volume2 className="size-3.5 text-white/50" /> Écoute la leçon
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[38%] rounded-full bg-[#EAB308]" />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-white/40">
            <span>1:12</span>
            <span>3:08</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfessorPanel({ avatar }: { avatar?: ReactNode }) {
  const [mode, setMode] = useState<ProfessorMode>("answer");
  return (
    <aside
      data-slot="professor"
      className="relative flex w-[360px] shrink-0 flex-col gap-6 border-l border-white/5 bg-[#0F172A]/70 px-6 py-10 shadow-[-12px_0_50px_-12px_rgb(0_0_0/0.7)] backdrop-blur-xl"
    >
      <ProfessorAvatar video={avatar} />
      <ModeSwitch mode={mode} onChange={setMode} />
      <AudioBar />

      {/* Bulle du professeur : sa parole, en clair sur le sombre */}
      <div
        data-slot="professor-bubble"
        className="relative rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-relaxed text-[#0F172A] shadow-2xl"
      >
        Regarde la Tafel : R₂ et R₃ sont en parallèle, donc on les remplace par 2 Ω.
        <p className="mt-3 font-medium">À toi : que se passe-t-il pour I₁ si R₃ → ∞ ?</p>
      </div>

      <div className="mt-auto">
        <div className="flex items-center gap-2 rounded-2xl bg-white/5 px-4 py-3 ring-1 ring-white/10 focus-within:ring-[#EAB308]/60">
          <input
            aria-label={mode === "ask" ? "Ta question au professeur" : "Ta réponse au professeur"}
            placeholder={mode === "ask" ? "Pose ta question au professeur…" : "Réponds au professeur…"}
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/40"
          />
          <button
            type="button"
            className="rounded-xl bg-[#EAB308] px-3 py-1.5 text-xs font-semibold text-[#0F172A]"
          >
            {mode === "ask" ? "Demander" : "Envoyer"}
          </button>
        </div>
      </div>
    </aside>
  );
}

/** Route /classroom : wouter passe ses propres props, on ne les transmet pas. */
export default function VirtualClassroomPage() {
  return <VirtualClassroom />;
}
