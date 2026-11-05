import {
  BookOpen,
  CircleHelp,
  CornerDownLeft,
  Check,
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
 *   avatar    ↔ Figma « Professor/AvatarSlot »  (défaut : photo du professeur)
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

/** Photo provisoire (Unsplash, voir public/images/professor/CREDITS.md). */
const PROFESSOR_PHOTO = "/images/professor/professor-01.webp";

/** Encre du feutre sur le verre. */
const INK = "#1B2A4A";

export function VirtualClassroom({ sidebar, board, avatar }: VirtualClassroomSlots = {}) {
  return (
    <div
      data-slot="virtual-classroom"
      // La salle : sombre, éclairée par le haut, comme un amphi lumières baissées.
      className="flex h-screen w-full overflow-hidden bg-[#070B14] bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#1E2A44_0%,#0B1222_55%,#070B14_100%)] text-white"
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
          <a
            key={label}
            href="#"
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-[#EAB308] text-[#0F172A] shadow-[0_6px_20px_-8px_rgb(234_179_8/0.7)]"
                : "text-white/70 hover:bg-white/10 hover:text-white",
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
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/70 hover:bg-white/10 hover:text-white"
        >
          <Settings className="size-4" />
          Paramètres
        </a>
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
 * Le tableau : verre trempé dans un cadre en métal brossé, posé sur un
 * rebord où l'on range les feutres. Trois couches de lumière font le relief :
 * l'ombre portée (le tableau avance hors du mur sombre), l'ombre interne (le
 * verre est en retrait du cadre), et un reflet diagonal (c'est du verre).
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

      {/* Cadre en métal brossé */}
      <div
        data-slot="tafel-frame"
        className="relative flex min-h-0 flex-1 flex-col rounded-[22px] bg-[linear-gradient(180deg,#E6E9ED_0%,#A9B1BB_48%,#C9CFD6_52%,#8D96A1_100%)] p-[10px] shadow-[0_50px_100px_-30px_rgb(0_0_0/0.9),0_20px_40px_-20px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.8)]"
      >
        {/* Grain du métal brossé */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[22px] opacity-40 mix-blend-overlay [background-image:repeating-linear-gradient(90deg,rgb(255_255_255/0.35)_0px,rgb(0_0_0/0.15)_1px,transparent_2px,transparent_4px)]"
        />

        {/* Le verre */}
        <div
          data-slot="tafel-glass"
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] bg-[linear-gradient(160deg,#FFFFFF_0%,#F6F8FB_45%,#EAEFF5_100%)] text-[#0F172A] shadow-[inset_0_3px_14px_rgb(15_23_42/0.22),inset_0_0_0_1px_rgb(255_255_255/0.9),inset_0_-2px_6px_rgb(15_23_42/0.08)]"
        >
          {/* Reflet diagonal : on sait tout de suite que c'est du verre */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-1/3 -left-1/4 h-[160%] w-1/3 rotate-[18deg] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.55),transparent)]"
          />
          {/* Traces de feutre mal effacées, très légères */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:radial-gradient(ellipse_30%_6%_at_22%_88%,#1B2A4A,transparent)]"
          />

          {/* En-tête écrit au feutre */}
          <header className="relative flex items-start justify-between px-12 pt-8">
            <div>
              <p className="font-mono text-[11px] tracking-[0.16em] text-[#64748B] uppercase">
                Digitaler Hörsaal · Grundlagen der Elektrotechnik
              </p>
              <h1 className="font-hand mt-1 text-5xl leading-none font-bold" style={{ color: INK }}>
                Kirchhoffsche Gesetze
              </h1>
              <HandUnderline />
            </div>
            <span className="flex items-center gap-2 rounded-full bg-[#0F172A]/[0.06] px-3 py-1.5 text-xs font-medium text-[#334155] ring-1 ring-[#0F172A]/10 backdrop-blur">
              <span className="size-2 rounded-full bg-[#EAB308] motion-safe:animate-pulse" />
              Le professeur écrit…
            </span>
          </header>

          {/* Contenu du tableau */}
          <div
            data-slot="tafel-board"
            className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-12 pb-8"
          >
            {children}
          </div>
        </div>

        <ChalkLedge />
      </div>
    </main>
  );
}

/** Trait jaune « tiré à la main » sous le titre. */
function HandUnderline() {
  return (
    <svg aria-hidden viewBox="0 0 320 14" className="mt-1 h-3 w-72" preserveAspectRatio="none">
      <path
        d="M3 9 C 60 3, 120 12, 180 6 S 280 4, 316 8"
        fill="none"
        stroke="#EAB308"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

/**
 * Le rebord du tableau : les outils sont des objets posés dessus — deux
 * feutres et une brosse — plutôt qu'une barre de boutons flottante.
 */
const MARKERS = [
  { label: "Feutre bleu nuit", body: "#1B2A4A", cap: "#0F172A", active: true },
  { label: "Surligneur jaune", body: "#FACC15", cap: "#CA8A04" },
  { label: "Feutre rouge", body: "#DC2626", cap: "#991B1B" },
];

function ChalkLedge() {
  const [active, setActive] = useState(0);
  return (
    <div
      data-slot="tafel-ledge"
      className="relative mx-6 -mb-[10px] mt-2 flex h-12 items-center gap-4 rounded-b-xl bg-[linear-gradient(180deg,#B9C0C8_0%,#8E97A2_40%,#6B7480_100%)] px-5 shadow-[0_14px_24px_-10px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.6)]"
    >
      {/* Gouttière où reposent les feutres */}
      <div
        aria-hidden
        className="absolute inset-x-3 top-1 h-3 rounded-full bg-[#5B636E] shadow-[inset_0_2px_3px_rgb(0_0_0/0.5)]"
      />

      <fieldset className="relative flex items-end gap-3 border-0 p-0">
        <legend className="sr-only">Feutres</legend>
        {MARKERS.map((m, i) => (
          <button
            key={m.label}
            type="button"
            title={m.label}
            aria-label={m.label}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
            className={cn(
              "group flex h-4 items-center transition-transform",
              active === i ? "-translate-y-1.5" : "hover:-translate-y-0.5",
            )}
          >
            <span
              className="h-3.5 w-14 rounded-l-full shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_2px_3px_rgb(0_0_0/0.4)]"
              style={{ background: m.body }}
            />
            <span
              className="h-4 w-5 rounded-r-md shadow-[0_2px_3px_rgb(0_0_0/0.4)]"
              style={{ background: m.cap }}
            />
          </button>
        ))}
        {/* La brosse */}
        <button
          type="button"
          title="Effacer"
          aria-label="Effacer"
          className="flex h-5 w-16 items-end overflow-hidden rounded-md bg-[#1F2937] shadow-[0_2px_4px_rgb(0_0_0/0.5)] transition-transform hover:-translate-y-0.5"
        >
          <span className="h-1.5 w-full bg-[#9CA3AF]" />
        </button>
      </fieldset>

      <div className="relative ml-auto flex items-center gap-1">
        {[
          { icon: Undo2, label: "Annuler" },
          { icon: Maximize2, label: "Plein écran" },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            className="flex size-8 items-center justify-center rounded-lg text-[#1F2937] transition-colors hover:bg-white/30"
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Contenu de démonstration : sera remplacé par les étapes réelles (lib/tafel.ts). */
function TafelPlaceholderContent() {
  return (
    <>
      {/* Étapes déjà écrites : une liste cochée au feutre, pas des pastilles web */}
      <ol data-slot="tafel-steps" className="font-hand flex flex-wrap justify-center gap-x-8 gap-y-1 text-2xl">
        {DONE_STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5 text-[#64748B] line-through decoration-[#EAB308]/70 decoration-2">
            <Check className="size-5 text-[#16A34A]" strokeWidth={3} /> {i + 1}. {s}
          </li>
        ))}
        <li className="flex items-center gap-1.5 font-bold" style={{ color: INK }}>
          <span className="text-[#EAB308]">➜</span> 3. Gleichungen
        </li>
      </ol>

      {/* L'étape en cours : une feuille posée sur le verre, tenue par un aimant */}
      <article
        data-slot="tafel-current-step"
        className="relative w-full max-w-2xl -rotate-[0.6deg] bg-[#FFFDF6] px-10 pt-9 pb-8 shadow-[0_1px_1px_rgb(15_23_42/0.08),0_18px_30px_-14px_rgb(15_23_42/0.45),0_4px_10px_-4px_rgb(15_23_42/0.15)]"
      >
        {/* Aimant */}
        <span
          aria-hidden
          className="absolute -top-3 left-1/2 size-7 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#FDE68A,#EAB308_55%,#A16207)] shadow-[0_4px_8px_rgb(0_0_0/0.35)]"
        />
        {/* Lignes du papier */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-16 bottom-6 opacity-50 [background-image:repeating-linear-gradient(180deg,transparent_0px,transparent_31px,#DCE6F2_31px,#DCE6F2_32px)]"
        />

        <div className="relative mb-4 flex items-start justify-between gap-4">
          <h2 className="font-hand text-3xl leading-none font-bold" style={{ color: INK }}>
            Schritt 3 — Gleichungen
          </h2>
          <SolverStamp />
        </div>

        <div
          className="relative [&_.katex]:text-[1.5em] [&_.katex-display]:my-4 [&_.katex-display]:!overflow-visible"
          style={{ color: INK }}
        >
          <MarkdownContent
            content={
              "Knotenregel: $I_1 = I_2 + I_3$\n\n" +
              "$$\n" +
              "I_1 = \\frac{U_q}{R_1 + R_2 \\parallel R_3} = \\frac{12\\,\\mathrm{V}}{2\\,\\Omega + 2\\,\\Omega} = 3\\,\\mathrm{A}\n" +
              "$$"
            }
          />
        </div>

        <p className="font-hand relative mt-2 text-xl text-[#475569]">
          R₂ ∥ R₃ — zwei gleiche Widerstände parallel ergeben die Hälfte.
        </p>
      </article>
    </>
  );
}

/**
 * « Berechnet mit dem Löser » : un tampon encreur, pas un bouton. Légèrement
 * de travers, encre irrégulière (masque), double filet — comme un visa
 * apposé par l'institut.
 */
function SolverStamp() {
  return (
    <span
      data-slot="solver-stamp"
      title="Résultat vérifié par le solveur numérique"
      className="inline-flex shrink-0 rotate-[-6deg] flex-col items-center rounded-md border-[3px] border-double border-[#1D4ED8]/80 px-3 py-1 font-mono text-[10px] leading-tight font-bold tracking-[0.18em] text-[#1D4ED8]/80 uppercase [mask-image:radial-gradient(circle_at_30%_40%,#000_55%,rgb(0_0_0/0.75)_75%,#000_100%)]"
    >
      <span className="flex items-center gap-1">
        <Check className="size-3" strokeWidth={3} /> Berechnet
      </span>
      <span className="text-[8px] tracking-[0.3em]">mit dem Löser</span>
    </span>
  );
}

/* ── Professeur ──────────────────────────────────────────────────────── */

export function ProfessorAvatar({ video }: { video?: ReactNode }) {
  return (
    <div data-slot="professor-avatar" className="flex flex-col items-center text-center">
      <div className="relative">
        {/* Halo : la lumière du tableau sur le professeur */}
        <div
          aria-hidden
          className="absolute inset-2 rounded-full bg-[#EAB308]/30 shadow-[0_0_60px_24px_rgb(234_179_8/0.35),0_0_120px_50px_rgb(234_179_8/0.15)]"
        />
        <div
          data-slot="avatar-video"
          className="relative size-44 overflow-hidden rounded-full ring-2 ring-[#EAB308]/80 ring-offset-4 ring-offset-[#0F172A] [filter:drop-shadow(0_24px_30px_rgb(0_0_0/0.65))]"
        >
          {video ?? (
            <img
              src={PROFESSOR_PHOTO}
              alt="Prof. TRED"
              width={480}
              height={480}
              className="size-full object-cover"
              loading="eager"
              decoding="async"
            />
          )}
        </div>
        <span className="absolute right-3 bottom-3 size-5 rounded-full border-[3px] border-[#0F172A] bg-emerald-500 shadow-[0_0_12px_rgb(16_185_129/0.8)]" />
      </div>
      <h2 className="font-display mt-6 text-xl font-semibold text-white">Prof. TRED</h2>
      <p className="text-sm text-white/60">Grundlagen der Elektrotechnik</p>
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
