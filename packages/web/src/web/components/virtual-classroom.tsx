import {
  BookOpen,
  CircleHelp,
  CornerDownLeft,
  Check,
  Eraser,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Maximize2,
  MessageSquare,
  Pause,
  PenLine,
  Play,
  Settings,
  Sigma,
  Undo2,
  Volume2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { MarkdownContent } from "@/components/markdown-content";
import { cn } from "@/lib/utils";

/**
 * Digitaler Hörsaal — maquette visuelle PURE (aucune donnée, aucune IA).
 *
 *   ┌──────────┬──────────────────────────────┬──────────────┐
 *   │ Sidebar  │ Tafel (flex-1)               │ Professeur   │
 *   │ 240px    │ grille de points + outils    │ 350px        │
 *   │ #0F172A  │ carte d'étape + badge Löser  │ avatar+audio │
 *   └──────────┴──────────────────────────────┴──────────────┘
 *
 * Visible en isolation sur /classroom. Quand le rendu est validé, on branche
 * les vraies étapes (lib/tafel.ts) à la place des constantes ci-dessous.
 *
 * SLOTS — chaque zone porte un `data-slot` qui correspond au calque Figma du
 * même nom (voir GUIDE_FOUNDER.md, Étape A). Les composants « premium » se
 * branchent via les props de <VirtualClassroom> sans refondre la mise en page :
 *
 *   sidebar   ↔ Figma « Sidebar »            (défaut : <Sidebar />)
 *   board     ↔ Figma « Tafel »              (défaut : <TafelPlaceholderContent />)
 *   avatar    ↔ Figma « Professor/AvatarSlot » (défaut : <ProfessorIllustration />)
 *
 * L'avatar temps réel (HeyGen LiveAvatar) ne sera rendu que si
 * VITE_AVATAR_ENABLED=true ET qu'un composant est passé dans `avatar`.
 */

export const AVATAR_ENABLED = import.meta.env.VITE_AVATAR_ENABLED === "true";

export interface VirtualClassroomSlots {
  /** Remplace toute la colonne de gauche. */
  sidebar?: ReactNode;
  /** Remplace le contenu du tableau (sous l'en-tête et la barre d'outils). */
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
      className="flex h-screen w-full overflow-hidden bg-[#FDFBF7] text-[#1A1A1A]"
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
      className="flex w-[240px] shrink-0 flex-col bg-[#0F172A] px-4 py-6 text-white"
    >
      <div className="mb-10 flex items-center gap-2.5 px-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-[#EAB308] text-[#1A1A1A]">
          <GraduationCap className="size-5" />
        </span>
        <span className="font-display text-xl font-semibold tracking-tight">TRED</span>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV.map(({ icon: Icon, label, active }) => (
          <a
            key={label}
            href="#"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-[#EAB308] text-[#1A1A1A]"
                : "text-white/75 hover:bg-white/10 hover:text-white",
            )}
          >
            <Icon className="size-4" />
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-auto">
        <a
          href="#"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 hover:bg-white/10 hover:text-white"
        >
          <Settings className="size-4" />
          Paramètres
        </a>
        <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-3">
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

const TOOLS = [
  { icon: PenLine, label: "Stylo", active: true },
  { icon: Eraser, label: "Gomme" },
  { icon: Undo2, label: "Annuler" },
  { icon: Maximize2, label: "Plein écran" },
];

function Tafel({ children }: { children: ReactNode }) {
  return (
    <main
      data-slot="tafel"
      className="relative flex min-w-0 flex-1 flex-col bg-white bg-[radial-gradient(#CBD5E1_1.2px,transparent_1.2px)] [background-size:24px_24px]"
    >
      {/* En-tête */}
      <header className="flex items-center justify-between px-10 pt-24">
        <div>
          <p className="font-mono text-[11px] tracking-[0.14em] text-[#64748B] uppercase">
            Digitaler Hörsaal · Grundlagen der Elektrotechnik
          </p>
          <h1 className="font-display mt-1 text-3xl font-semibold">Kirchhoffsche Gesetze</h1>
        </div>
        <span className="flex items-center gap-2 rounded-full border border-[#E7E2D8] bg-white px-3 py-1.5 text-xs font-medium shadow-sm">
          <span className="size-2 animate-pulse rounded-full bg-[#EAB308]" />
          Le professeur écrit…
        </span>
      </header>

      {/* Barre d'outils flottante */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2">
        <div className="flex items-center gap-1 rounded-2xl border border-[#E7E2D8] bg-white/95 p-1.5 shadow-[0_8px_30px_-12px_rgb(15_23_42/0.25)] backdrop-blur">
          {TOOLS.map(({ icon: Icon, label, active }, i) => (
            <span key={label} className="flex items-center">
              {i === 2 && <span className="mx-1 h-6 w-px bg-[#E7E2D8]" />}
              <button
                type="button"
                title={label}
                aria-label={label}
                className={cn(
                  "flex size-9 items-center justify-center rounded-xl transition-colors",
                  active ? "bg-[#0F172A] text-white" : "text-[#475569] hover:bg-[#F1F5F9]",
                )}
              >
                <Icon className="size-4" />
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Contenu du tableau */}
      <div
        data-slot="tafel-board"
        className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-10 pb-10"
      >
        {children}
      </div>
    </main>
  );
}

/** Contenu de démonstration : sera remplacé par les étapes réelles (lib/tafel.ts). */
function TafelPlaceholderContent() {
  return (
    <>
      {/* Étapes déjà écrites, en retrait */}
      <ol data-slot="tafel-steps" className="flex flex-wrap justify-center gap-2">
        {DONE_STEPS.map((s, i) => (
          <li
            key={s}
            className="flex items-center gap-1.5 rounded-full bg-[#0F172A] px-3 py-1 text-xs font-medium text-white"
          >
            <Check className="size-3" /> {i + 1} {s}
          </li>
        ))}
        <li className="rounded-full border border-[#EAB308] bg-[#FEF9E7] px-3 py-1 text-xs font-medium">
          3 Gleichungen
        </li>
      </ol>

      {/* Carte de l'étape en cours */}
      <article
        data-slot="tafel-current-step"
        className="w-full max-w-2xl rounded-3xl border-2 border-[#EAB308] bg-white px-8 py-7 shadow-[0_24px_60px_-30px_rgb(15_23_42/0.35)]"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className="font-mono text-xs tracking-[0.14em] text-[#64748B] uppercase">
            Étape 3 : Équations
          </p>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0F172A] px-3 py-1 text-xs font-medium text-white">
            <Check className="size-3 text-[#EAB308]" /> Berechnet mit dem Löser
          </span>
        </div>

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

        <p className="mt-2 text-sm text-[#64748B]">
          R₂ ∥ R₃ — zwei gleiche Widerstände parallel ergeben die Hälfte.
        </p>
      </article>
    </>
  );
}

/* ── Professeur ──────────────────────────────────────────────────────── */

export function ProfessorAvatar({ video }: { video?: ReactNode }) {
  return (
    <div data-slot="professor-avatar" className="flex flex-col items-center text-center">
      <div className="relative">
        <div
          data-slot="avatar-video"
          className="size-40 overflow-hidden rounded-full border-4 border-white shadow-[0_18px_40px_-18px_rgb(15_23_42/0.45)] ring-2 ring-[#EAB308]"
        >
          {video ?? <ProfessorIllustration />}
        </div>
        <span className="absolute right-2 bottom-2 size-5 rounded-full border-[3px] border-white bg-emerald-500" />
      </div>
      <h2 className="font-display mt-4 text-xl font-semibold">Prof. TRED</h2>
      <p className="text-sm text-[#64748B]">Grundlagen der Elektrotechnik</p>
    </div>
  );
}

/**
 * En attendant la vidéo HeyGen : un jeune ingénieur souriant, en vectoriel.
 * Volontairement une illustration et non une photo — on ne prête pas le
 * visage d'un inconnu au professeur. Remplacée par le slot `avatar`.
 */
function ProfessorIllustration() {
  return (
    <svg viewBox="0 0 160 160" aria-hidden className="size-full">
      <rect width="160" height="160" fill="#FEF3C7" />
      <circle cx="128" cy="30" r="34" fill="#EAB308" opacity="0.35" />
      {/* Buste : sweat bleu nuit, col de chemise blanc */}
      <path d="M22 160c4-30 26-46 58-46s54 16 58 46Z" fill="#0F172A" />
      <path d="M64 116l16 18 16-18" fill="none" stroke="#F8FAFC" strokeWidth="5" strokeLinejoin="round" />
      <rect x="70" y="96" width="20" height="22" rx="8" fill="#E8B48F" />
      {/* Visage */}
      <ellipse cx="80" cy="72" rx="29" ry="33" fill="#F2C29B" />
      <ellipse cx="50" cy="76" rx="5" ry="8" fill="#E8B48F" />
      <ellipse cx="110" cy="76" rx="5" ry="8" fill="#E8B48F" />
      {/* Cheveux courts, mèche dynamique */}
      <path d="M50 66c-2-24 14-38 33-38 18 0 31 10 30 34-6-9-15-13-24-13-4 6-14 9-24 8-6 0-11 3-15 9Z" fill="#1F2937" />
      <path d="M78 34c10-8 24-6 30 2-9-2-17 0-24 5Z" fill="#374151" />
      {/* Lunettes fines */}
      <g fill="none" stroke="#0F172A" strokeWidth="2.2">
        <rect x="58" y="66" width="18" height="13" rx="5" />
        <rect x="84" y="66" width="18" height="13" rx="5" />
        <path d="M76 71h8" />
      </g>
      <circle cx="67" cy="72.5" r="2.4" fill="#0F172A" />
      <circle cx="93" cy="72.5" r="2.4" fill="#0F172A" />
      {/* Sourcil levé : l'air curieux */}
      <path d="M59 61q8-5 16-1" fill="none" stroke="#1F2937" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M85 59q8-3 16 2" fill="none" stroke="#1F2937" strokeWidth="2.6" strokeLinecap="round" />
      {/* Grand sourire */}
      <path d="M66 88q14 14 28 0" fill="#FFFFFF" stroke="#7C2D12" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="58" cy="86" r="4" fill="#F59E8B" opacity="0.45" />
      <circle cx="102" cy="86" r="4" fill="#F59E8B" opacity="0.45" />
    </svg>
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
      className="grid grid-cols-2 gap-1 rounded-2xl border border-[#E7E2D8] bg-white p-1 shadow-sm"
    >
      {options.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors",
            mode === value ? "bg-[#0F172A] text-white" : "text-[#475569] hover:bg-[#F1F5F9]",
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
    <div
      data-slot="audio-bar"
      className="w-full rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-sm"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#EAB308] text-[#1A1A1A] transition-transform hover:scale-105"
        >
          {playing ? <Pause className="size-5" /> : <Play className="ml-0.5 size-5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Volume2 className="size-3.5 text-[#64748B]" /> Écoute la leçon
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
            <div className="h-full w-[38%] rounded-full bg-[#0F172A]" />
          </div>
          <div className="mt-1 flex justify-between font-mono text-[10px] text-[#94A3B8]">
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
      className="flex w-[350px] shrink-0 flex-col gap-6 border-l border-[#E7E2D8] bg-[#FDFBF7] px-6 py-8"
    >
      <ProfessorAvatar video={avatar} />
      <ModeSwitch mode={mode} onChange={setMode} />
      <AudioBar />

      {/* Bulle du professeur */}
      <div
        data-slot="professor-bubble"
        className="rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-relaxed shadow-sm"
      >
        Regarde la Tafel : R₂ et R₃ sont en parallèle, donc on les remplace par 2 Ω.
        <p className="mt-3 font-medium">À toi : que se passe-t-il pour I₁ si R₃ → ∞ ?</p>
      </div>

      <div className="mt-auto">
        <div className="flex items-center gap-2 rounded-2xl border border-[#E7E2D8] bg-white px-4 py-3 shadow-sm">
          <input
            aria-label={mode === "ask" ? "Ta question au professeur" : "Ta réponse au professeur"}
            placeholder={
              mode === "ask" ? "Pose ta question au professeur…" : "Réponds au professeur…"
            }
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#94A3B8]"
          />
          <button
            type="button"
            className="rounded-xl bg-[#0F172A] px-3 py-1.5 text-xs font-medium text-white"
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
