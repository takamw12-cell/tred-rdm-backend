import {
  BookOpen,
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
import { useState } from "react";
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
 */

const NAV = [
  { icon: LayoutDashboard, label: "Tableau de bord" },
  { icon: MessageSquare, label: "Tuteur IA", active: true },
  { icon: PenLine, label: "Exercices" },
  { icon: Sigma, label: "Formules" },
  { icon: FileText, label: "Documents" },
  { icon: BookOpen, label: "Cours" },
];

const DONE_STEPS = ["Beobachtung", "Physik"];

const PROFESSOR_IMG =
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=600&h=600&fit=crop&crop=faces&fm=jpg&q=80";

export function VirtualClassroom() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#FDFBF7] text-[#1A1A1A]">
      <Sidebar />
      <Tafel />
      <ProfessorPanel />
    </div>
  );
}

/* ── Sidebar ─────────────────────────────────────────────────────────── */

function Sidebar() {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col bg-[#0F172A] px-4 py-6 text-white">
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
              active ? "bg-[#EAB308] text-[#1A1A1A]" : "text-white/75 hover:bg-white/10 hover:text-white",
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

function Tafel() {
  return (
    <main className="relative flex min-w-0 flex-1 flex-col bg-white bg-[radial-gradient(#CBD5E1_1.2px,transparent_1.2px)] [background-size:24px_24px]">
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
      <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-10 pb-10">
        {/* Étapes déjà écrites, en retrait */}
        <ol className="flex flex-wrap justify-center gap-2">
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
        <article className="w-full max-w-2xl rounded-3xl border-2 border-[#EAB308] bg-white px-8 py-7 shadow-[0_24px_60px_-30px_rgb(15_23_42/0.35)]">
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
      </div>
    </main>
  );
}

/* ── Professeur ──────────────────────────────────────────────────────── */

export function ProfessorAvatar() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative">
        <div className="size-40 overflow-hidden rounded-full border-4 border-white shadow-[0_18px_40px_-18px_rgb(15_23_42/0.45)] ring-2 ring-[#EAB308]">
          <img
            src={PROFESSOR_IMG}
            alt="Professeur TRED"
            className="size-full object-cover"
            loading="eager"
          />
        </div>
        <span className="absolute right-2 bottom-2 size-5 rounded-full border-[3px] border-white bg-emerald-500" />
      </div>
      <h2 className="font-display mt-4 text-xl font-semibold">Prof. TRED</h2>
      <p className="text-sm text-[#64748B]">Grundlagen der Elektrotechnik</p>
    </div>
  );
}

function AudioBar() {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="w-full rounded-2xl border border-[#E7E2D8] bg-white p-4 shadow-sm">
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

function ProfessorPanel() {
  return (
    <aside className="flex w-[350px] shrink-0 flex-col gap-6 border-l border-[#E7E2D8] bg-[#FDFBF7] px-6 py-8">
      <ProfessorAvatar />
      <AudioBar />

      {/* Bulle du professeur */}
      <div className="rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-relaxed shadow-sm">
        Regarde la Tafel : R₂ et R₃ sont en parallèle, donc on les remplace par 2 Ω.
        <p className="mt-3 font-medium">À toi : que se passe-t-il pour I₁ si R₃ → ∞ ?</p>
      </div>

      <div className="mt-auto">
        <div className="flex items-center gap-2 rounded-2xl border border-[#E7E2D8] bg-white px-4 py-3 shadow-sm">
          <input
            placeholder="Réponds au professeur…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#94A3B8]"
          />
          <button
            type="button"
            className="rounded-xl bg-[#0F172A] px-3 py-1.5 text-xs font-medium text-white"
          >
            Envoyer
          </button>
        </div>
      </div>
    </aside>
  );
}

export default VirtualClassroom;
