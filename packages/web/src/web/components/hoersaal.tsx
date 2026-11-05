import { Check, Maximize2, Undo2 } from "lucide-react";
import { BOARD_THEMES, useBoardTheme, type BoardTheme } from "@/stores/board-theme";
import { useState, type ReactNode } from "react";
import { ProfessorPortrait } from "@/components/professor-portrait";
import type { Professor } from "@/lib/professors";
import { cn } from "@/lib/utils";

/**
 * Les pièces du Digitaler Hörsaal, partagées par la maquette (/classroom) et
 * le vrai tuteur (chat → TafelBoard). Une seule source : ce que le fondateur a
 * validé sur la maquette est exactement ce que voient les étudiants.
 *
 *   <GlassBoard>    cadre métal brossé + verre trempé + rebord
 *   <PaperNote>     une feuille posée sur le verre, tenue par un aimant
 *   <SolverStamp>   le tampon « Berechnet mit dem Löser »
 *   <ProfessorHalo> le portrait du professeur, halo jaune et ombre portée
 */

/**
 * Encre du feutre sur le tableau. Variable CSS : elle suit le thème choisi
 * (bleu nuit sur « Weiß », craie blanche sur « Grün », blanc sur « Dunkel »).
 */
export const INK = "var(--board-ink, #1B2A4A)";

/** Fond « salle sombre » : bleu nuit éclairé par le haut. */
export const ROOM_BG =
  "bg-[#070B14] bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,#1E2A44_0%,#0B1222_55%,#070B14_100%)]";

/**
 * Le tableau : verre trempé dans un cadre en métal brossé, posé sur un
 * rebord. Trois couches de lumière font le relief : l'ombre portée (le
 * tableau avance hors du mur sombre), l'ombre interne (le verre est en
 * retrait du cadre), et un reflet diagonal (c'est du verre).
 */
export function GlassBoard({
  eyebrow,
  title,
  status,
  children,
  interactiveLedge = false,
  className,
  "aria-label": ariaLabel,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Pastille à droite de l'en-tête (« Le professeur écrit… »). */
  status?: ReactNode;
  children: ReactNode;
  /** Feutres cliquables (maquette). Dans le tuteur, le rebord est décoratif. */
  interactiveLedge?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const theme = useBoardTheme((s) => s.theme);
  const setTheme = useBoardTheme((s) => s.setTheme);
  return (
    <section
      aria-label={ariaLabel}
      data-slot="tafel-frame"
      className={cn(
        "relative flex min-h-0 flex-1 flex-col rounded-[22px] bg-[linear-gradient(180deg,#E6E9ED_0%,#A9B1BB_48%,#C9CFD6_52%,#8D96A1_100%)] p-[10px] shadow-[0_50px_100px_-30px_rgb(0_0_0/0.9),0_20px_40px_-20px_rgb(0_0_0/0.7),inset_0_1px_0_rgb(255_255_255/0.8)]",
        className,
      )}
    >
      {/* Grain du métal brossé */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[22px] opacity-40 mix-blend-overlay [background-image:repeating-linear-gradient(90deg,rgb(255_255_255/0.35)_0px,rgb(0_0_0/0.15)_1px,transparent_2px,transparent_4px)]"
      />

      {/* Le verre */}
      <div
        data-slot="tafel-glass"
        data-board-theme={theme}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] transition-[background] duration-500"
      >
        {/* Reflet diagonal : on sait tout de suite que c'est du verre */}
        <div
          aria-hidden
          data-slot="board-glare"
          className="pointer-events-none absolute -top-1/3 -left-1/4 h-[160%] w-1/3 rotate-[18deg] bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.55),transparent)]"
        />
        {/* Trace de feutre mal effacée, très légère */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.025] [background-image:radial-gradient(ellipse_30%_6%_at_22%_88%,#1B2A4A,transparent)]"
        />

        {/* En-tête écrit au feutre */}
        <header className="relative flex shrink-0 items-start justify-between gap-4 px-6 pt-6 sm:px-10 sm:pt-8">
          <div className="min-w-0">
            {eyebrow && (
              <p className="truncate font-mono text-[11px] tracking-[0.16em] text-[color:var(--board-muted)] uppercase">
                {eyebrow}
              </p>
            )}
            <h1
              className="font-hand mt-1 text-4xl leading-none font-bold sm:text-5xl"
              style={{ color: INK }}
            >
              {title}
            </h1>
            <HandUnderline />
          </div>
          {status}
        </header>

        {/* Contenu du tableau */}
        <div
          data-slot="tafel-board"
          className="relative flex min-h-0 flex-1 flex-col items-center gap-6 overflow-y-auto px-5 pt-4 pb-8 sm:px-10"
        >
          {children}
        </div>
      </div>

      <ChalkLedge interactive={interactiveLedge} theme={theme} onTheme={setTheme} />
    </section>
  );
}

/** Pastille « le professeur écrit… » posée sur le verre. */
export function BoardStatus({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full bg-[color:var(--board-pill)] px-3 py-1.5 text-xs font-medium text-[color:var(--board-muted)] ring-1 ring-[color:var(--board-pill)] backdrop-blur">
      <span className="size-2 rounded-full bg-[#EAB308] motion-safe:animate-pulse" />
      {children}
    </span>
  );
}

/** Trait jaune « tiré à la main » sous le titre. */
export function HandUnderline() {
  return (
    <svg aria-hidden viewBox="0 0 320 14" className="mt-1 h-3 w-56 sm:w-72" preserveAspectRatio="none">
      <path
        d="M3 9 C 60 3, 120 12, 180 6 S 280 4, 316 8"
        fill="none"
        stroke="var(--board-accent, #EAB308)"
        strokeWidth="4"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

const MARKERS = [
  { label: "Feutre bleu nuit", body: "#1B2A4A", cap: "#0F172A" },
  { label: "Surligneur jaune", body: "#FACC15", cap: "#CA8A04" },
  { label: "Feutre rouge", body: "#DC2626", cap: "#991B1B" },
];

/**
 * Le rebord : les outils sont des objets posés dessus — trois feutres et une
 * brosse — plutôt qu'une barre de boutons flottante. Hors maquette, il est
 * purement décoratif : on n'affiche pas de bouton qui ne fait rien.
 */
function ChalkLedge({
  interactive,
  theme,
  onTheme,
}: {
  interactive: boolean;
  theme: BoardTheme;
  onTheme: (t: BoardTheme) => void;
}) {
  const [active, setActive] = useState(0);

  const marker = (m: (typeof MARKERS)[number], i: number) => {
    const shape = (
      <>
        <span
          className="h-3.5 w-14 rounded-l-full shadow-[inset_0_1px_0_rgb(255_255_255/0.35),0_2px_3px_rgb(0_0_0/0.4)]"
          style={{ background: m.body }}
        />
        <span
          className="h-4 w-5 rounded-r-md shadow-[0_2px_3px_rgb(0_0_0/0.4)]"
          style={{ background: m.cap }}
        />
      </>
    );
    if (!interactive) {
      return (
        <span key={m.label} className={cn("flex h-4 items-center", i === 0 && "-translate-y-0.5")}>
          {shape}
        </span>
      );
    }
    return (
      <button
        key={m.label}
        type="button"
        title={m.label}
        aria-label={m.label}
        aria-pressed={active === i}
        onClick={() => setActive(i)}
        className={cn(
          "flex h-4 items-center transition-transform",
          active === i ? "-translate-y-1.5" : "hover:-translate-y-0.5",
        )}
      >
        {shape}
      </button>
    );
  };

  return (
    <div
      data-slot="tafel-ledge"
      className="relative mx-6 mt-2 -mb-[10px] flex h-12 shrink-0 items-center gap-4 rounded-b-xl bg-[linear-gradient(180deg,#B9C0C8_0%,#8E97A2_40%,#6B7480_100%)] px-5 shadow-[0_14px_24px_-10px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.6)]"
    >
      {/* Gouttière où reposent les feutres */}
      <div
        aria-hidden
        className="absolute inset-x-3 top-1 h-3 rounded-full bg-[#5B636E] shadow-[inset_0_2px_3px_rgb(0_0_0/0.5)]"
      />

      {interactive ? (
        <fieldset className="relative flex items-end gap-3 border-0 p-0">
          <legend className="sr-only">Feutres</legend>
          {MARKERS.map(marker)}
          <button
            type="button"
            title="Effacer"
            aria-label="Effacer"
            className="flex h-5 w-16 items-end overflow-hidden rounded-md bg-[#1F2937] shadow-[0_2px_4px_rgb(0_0_0/0.5)] transition-transform hover:-translate-y-0.5"
          >
            <span className="h-1.5 w-full bg-[#9CA3AF]" />
          </button>
        </fieldset>
      ) : (
        <div aria-hidden className="relative flex items-end gap-3">
          {MARKERS.map(marker)}
          <span className="hidden h-5 w-16 items-end overflow-hidden rounded-md bg-[#1F2937] shadow-[0_2px_4px_rgb(0_0_0/0.5)] sm:flex">
            <span className="h-1.5 w-full bg-[#9CA3AF]" />
          </span>
        </div>
      )}

      <ThemePicker theme={theme} onTheme={onTheme} />

      {interactive && (
        <div className="relative flex items-center gap-1">
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
      )}
    </div>
  );
}

/** Liste des étapes cochée au feutre : faites barrées, en cours fléchée. */
export function StepChecklist({
  steps,
  label,
}: {
  steps: { label: string; done: boolean }[];
  label?: string;
}) {
  return (
    <ol
      data-slot="tafel-steps"
      aria-label={label}
      className="font-hand flex flex-wrap justify-center gap-x-7 gap-y-1 text-xl sm:text-2xl"
    >
      {steps.map((s, i) => (
        <li
          key={`${i}-${s.label}`}
          className={cn(
            "flex items-center gap-1.5",
            s.done
              ? "text-[color:var(--board-muted)] line-through decoration-[color:var(--board-accent)] decoration-2"
              : "font-bold",
          )}
          style={s.done ? undefined : { color: INK }}
        >
          {s.done ? (
            <Check className="size-5 text-[color:var(--board-check)]" strokeWidth={3} />
          ) : (
            <span className="text-[color:var(--board-accent)]">➜</span>
          )}
          {i + 1}. {s.label}
        </li>
      ))}
    </ol>
  );
}

/**
 * Une feuille posée sur le verre, tenue par un aimant jaune. Le titre est
 * écrit à la main ; le contenu (formules KaTeX) reste net et exact.
 */
export function PaperNote({
  title,
  stamp,
  children,
  tilt = -0.6,
  highlight = false,
  className,
}: {
  title: ReactNode;
  stamp?: ReactNode;
  children: ReactNode;
  /** Inclinaison en degrés : deux feuilles voisines ne sont jamais parallèles. */
  tilt?: number;
  /** Dernière étape : liseré jaune, comme un résultat encadré au feutre. */
  highlight?: boolean;
  className?: string;
}) {
  return (
    <article
      data-slot="tafel-note"
      className={cn(
        "relative w-full max-w-2xl bg-[#FFFDF6] px-6 pt-9 pb-7 shadow-[0_1px_1px_rgb(15_23_42/0.08),0_18px_30px_-14px_rgb(15_23_42/0.45),0_4px_10px_-4px_rgb(15_23_42/0.15)] sm:px-10",
        highlight && "ring-2 ring-[#EAB308]/70",
        className,
      )}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {/* Aimant */}
      <span
        aria-hidden
        className="absolute -top-3 left-1/2 size-7 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#FDE68A,#EAB308_55%,#A16207)] shadow-[0_4px_8px_rgb(0_0_0/0.35)]"
      />
      {/* Lignes du papier */}
      <div
        aria-hidden
        data-slot="tafel-note-lines"
        className="pointer-events-none absolute inset-x-6 top-16 bottom-6 opacity-50 [background-image:repeating-linear-gradient(180deg,transparent_0px,transparent_31px,#DCE6F2_31px,#DCE6F2_32px)] sm:inset-x-8"
      />

      <div className="relative mb-3 flex items-start justify-between gap-4">
        <h2 className="font-hand text-2xl leading-none font-bold sm:text-3xl" style={{ color: INK }}>
          {title}
        </h2>
        {stamp}
      </div>

      <div className="relative" style={{ color: INK }}>
        {children}
      </div>
    </article>
  );
}

/**
 * « Berechnet mit dem Löser » : un tampon encreur, pas un bouton. Légèrement
 * de travers, encre irrégulière (masque), double filet — comme un visa
 * apposé par l'institut.
 */
export function SolverStamp({ label = "Berechnet", sublabel = "mit dem Löser" }: { label?: string; sublabel?: string }) {
  return (
    <span
      data-slot="solver-stamp"
      className="inline-flex shrink-0 rotate-[-6deg] flex-col items-center rounded-md border-[3px] border-double border-[color:var(--board-stamp)] px-3 py-1 font-mono text-[10px] leading-tight font-bold tracking-[0.18em] text-[color:var(--board-stamp)] uppercase opacity-85 [mask-image:radial-gradient(circle_at_30%_40%,#000_55%,rgb(0_0_0/0.75)_75%,#000_100%)]"
    >
      <span className="flex items-center gap-1">
        <Check className="size-3" strokeWidth={3} /> {label}
      </span>
      {sublabel && <span className="text-[8px] tracking-[0.3em]">{sublabel}</span>}
    </span>
  );
}

/**
 * Le portrait du professeur, éclairé par le tableau : halo jaune doux et
 * ombre portée, comme s'il se tenait à côté. `video` (HeyGen) remplace
 * l'image le jour où l'avatar temps réel est branché.
 */
export function ProfessorHalo({
  professor,
  video,
  size = "lg",
  online = true,
}: {
  professor: Professor;
  video?: ReactNode;
  size?: "sm" | "lg";
  online?: boolean;
}) {
  const lg = size === "lg";
  return (
    <div className="relative shrink-0">
      <div
        aria-hidden
        className={cn(
          "absolute rounded-full bg-[#EAB308]/30",
          lg
            ? "inset-2 shadow-[0_0_60px_24px_rgb(234_179_8/0.35),0_0_120px_50px_rgb(234_179_8/0.15)]"
            : "inset-1 shadow-[0_0_24px_8px_rgb(234_179_8/0.35)]",
        )}
      />
      <div
        data-slot="avatar-video"
        className={cn(
          "relative overflow-hidden rounded-full ring-2 ring-[#EAB308]/80 ring-offset-[#0F172A] [filter:drop-shadow(0_24px_30px_rgb(0_0_0/0.65))]",
          lg ? "size-44 text-6xl ring-offset-4" : "size-14 text-xl ring-offset-2",
        )}
      >
        {video ?? <ProfessorPortrait professor={professor} eager={lg} />}
      </div>
      {online && (
        <span
          className={cn(
            "absolute rounded-full border-[#0F172A] bg-emerald-500 shadow-[0_0_12px_rgb(16_185_129/0.8)]",
            lg ? "right-3 bottom-3 size-5 border-[3px]" : "right-0 bottom-0 size-3.5 border-2",
          )}
        />
      )}
    </div>
  );
}

/**
 * Bandeau du professeur, en tête de la conversation du tuteur : son portrait
 * éclairé, son nom, et ce qu'il fait en ce moment.
 */
export function ProfessorStrip({
  professor,
  subtitle,
  status,
  action,
}: {
  professor: Professor;
  subtitle: ReactNode;
  /** « écrit au tableau… » pendant une réponse. */
  status?: ReactNode;
  /** Lien « changer de professeur ». */
  action?: ReactNode;
}) {
  return (
    <div
      data-slot="professor-strip"
      className="relative flex shrink-0 items-center gap-4 overflow-hidden border-b border-white/5 bg-[#0F172A] px-5 py-4 text-white"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -left-10 size-40 rounded-full bg-[radial-gradient(circle,rgb(234_179_8/0.18),transparent_70%)]"
      />
      <ProfessorHalo professor={professor} size="sm" />
      <div className="relative min-w-0 flex-1">
        <p className="font-display truncate text-base font-semibold">{professor.name}</p>
        <p className="truncate text-xs text-white/60">
          {status ? (
            <span className="inline-flex items-center gap-1.5 text-[#FACC15]">
              <span className="size-1.5 rounded-full bg-[#FACC15] motion-safe:animate-pulse" />
              {status}
            </span>
          ) : (
            subtitle
          )}
        </p>
      </div>
      {action}
    </div>
  );
}

const THEME_SWATCH: Record<BoardTheme, { label: string; bg: string; ring: string }> = {
  white: { label: "Weiß", bg: "linear-gradient(135deg,#FFFFFF,#E2E8F0)", ring: "#94A3B8" },
  green: { label: "Grün", bg: "linear-gradient(135deg,#3B5E4A,#2E4A3A)", ring: "#1F3328" },
  dark: { label: "Dunkel", bg: "linear-gradient(135deg,#1E293B,#0F172A)", ring: "#020617" },
};

/**
 * Le choix du fond, posé sur le rebord comme trois petits aimants de
 * couleur. Toujours actif (maquette ET tuteur) : c'est un vrai réglage.
 */
function ThemePicker({ theme, onTheme }: { theme: BoardTheme; onTheme: (t: BoardTheme) => void }) {
  return (
    <fieldset className="relative ml-auto flex items-center gap-1.5 border-0 p-0">
      <legend className="sr-only">Tafel-Hintergrund</legend>
      {BOARD_THEMES.map((t) => {
        const sw = THEME_SWATCH[t];
        const active = theme === t;
        return (
          <button
            key={t}
            type="button"
            title={sw.label}
            aria-label={`Tafel: ${sw.label}`}
            aria-pressed={active}
            onClick={() => onTheme(t)}
            className={cn(
              "size-6 rounded-full shadow-[0_2px_4px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.4)] transition-transform",
              active ? "scale-110 ring-2 ring-[#EAB308] ring-offset-1 ring-offset-[#8E97A2]" : "hover:scale-105",
            )}
            style={{ background: sw.bg, boxShadow: active ? undefined : `inset 0 0 0 1px ${sw.ring}` }}
          />
        );
      })}
    </fieldset>
  );
}
