import { Check, Palette, RotateCcw } from "lucide-react";
import { BOARD_THEMES, useBoardTheme, type BoardTheme } from "@/stores/board-theme";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ProfessorPortrait } from "@/components/professor-portrait";
import type { Professor } from "@/lib/professors";
import { DEFAULT_TAFEL_COLORS, effectiveBoardTheme, tafelStyle } from "@/lib/tafel-colors";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Les pièces du Digitaler Hörsaal, partagées par la maquette (/classroom) et
 * le vrai tuteur (chat → TafelBoard). Une seule source : ce que le fondateur a
 * validé sur la maquette est exactement ce que voient les étudiants.
 *
 *   <GlassBoard>    cadre métal brossé + verre trempé + rebord (couleurs du tableau)
 *   <PaperNote>     une feuille posée sur le verre, tenue par un aimant
 *   <SolverStamp>   le tampon « Berechnet mit dem Löser »
 *   <ProfessorHalo> le portrait du professeur, halo jaune et ombre portée
 */

/**
 * Encre du feutre sur le tableau. Variable CSS : elle suit le thème choisi
 * (bleu nuit sur « Weiß », craie blanche sur « Grün », blanc sur « Dunkel »).
 */
export const INK = "var(--board-ink, #1B2A4A)";

/**
 * Fond « salle sombre » : bleu nuit éclairé par le haut. Translucide depuis
 * le 2026-11-09 : la photo de la filière (DynamicBackground, voile sombre
 * « vivid ») se devine autour du tableau. Rien n'est écrit directement
 * dessus : la Tafel, la barre du chat et le professeur ont leur propre fond.
 */
export const ROOM_BG =
  "bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgb(30_42_68/0.55)_0%,rgb(11_18_34/0.65)_55%,rgb(7_11_20/0.8)_100%)]";

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
  className,
  "aria-label": ariaLabel,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  /** Pastille à droite de l'en-tête (« Le professeur écrit… »). */
  status?: ReactNode;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const theme = useBoardTheme((s) => s.theme);
  // Couleurs libres : appliquées en direct (style inline, priment sur le thème).
  const custom = useBoardTheme((s) => s.custom);
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
        data-board-theme={effectiveBoardTheme(theme, custom)}
        data-tafel-custom={custom ? "" : undefined}
        style={tafelStyle(custom) as CSSProperties | undefined}
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

      <ChalkLedge />
    </section>
  );
}

/** Pastille « le professeur écrit… » posée sur le verre. */
export function BoardStatus({ children }: { children: ReactNode }) {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full bg-[color:var(--board-pill)] px-3 py-1.5 text-xs font-medium text-[color:var(--board-muted)] ring-1 ring-[color:var(--board-pill)] backdrop-blur">
      {/* Point fixe : le tableau et le professeur restent calmes pendant l'écriture. */}
      <span className="size-2 rounded-full bg-[#EAB308]" />
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

/**
 * Le rebord du tableau : plus de feutres décoratifs (ils ne faisaient rien),
 * mais les vrais réglages — les couleurs du tableau et de la craie, avec leur
 * densité, et les trois fonds prêts à l'emploi.
 */
function ChalkLedge() {
  const theme = useBoardTheme((s) => s.theme);
  const custom = useBoardTheme((s) => s.custom);
  const setTheme = useBoardTheme((s) => s.setTheme);
  return (
    <div
      data-slot="tafel-ledge"
      className="relative mx-6 mt-2 -mb-[10px] flex h-12 shrink-0 items-center gap-3 rounded-b-xl bg-[linear-gradient(180deg,#B9C0C8_0%,#8E97A2_40%,#6B7480_100%)] px-4 shadow-[0_14px_24px_-10px_rgb(0_0_0/0.8),inset_0_1px_0_rgb(255_255_255/0.6)]"
    >
      <TafelColorControls />
      {/* Couleurs libres actives : aucun des trois fonds n'est « sélectionné ». */}
      <ThemePicker theme={custom ? null : theme} onTheme={setTheme} />
    </div>
  );
}

/**
 * Sélecteur de couleurs : fond du tableau et craie, chacun avec un curseur de
 * densité (opacité). Chaque mouvement s'applique tout de suite au verre
 * (--tafel-bg, --tafel-text) ; « Zurücksetzen » revient au thème choisi.
 */
function TafelColorControls() {
  const { t } = useT();
  const custom = useBoardTheme((s) => s.custom);
  const setCustom = useBoardTheme((s) => s.setCustom);
  const resetCustom = useBoardTheme((s) => s.resetCustom);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const c = custom ?? DEFAULT_TAFEL_COLORS;

  // Clic à côté ou Échap : le panneau se referme.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const row = (kind: "bg" | "ink") => {
    const color = kind === "bg" ? c.bg : c.ink;
    const alpha = kind === "bg" ? c.bgAlpha : c.inkAlpha;
    const label = kind === "bg" ? t("tafel.colorBoard") : t("tafel.colorChalk");
    return (
      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A]">
          <input
            type="color"
            value={color}
            aria-label={label}
            onChange={(e) => setCustom(kind === "bg" ? { bg: e.target.value } : { ink: e.target.value })}
            className="size-8 cursor-pointer rounded-md border border-black/10 bg-transparent p-0.5"
          />
          {label}
        </label>
        <label className="flex items-center gap-2 text-[11px] text-[#334155]">
          <span className="shrink-0">{t("tafel.density")}</span>
          <input
            type="range"
            min={kind === "bg" ? 20 : 30}
            max={100}
            value={Math.round(alpha * 100)}
            aria-label={`${label} — ${t("tafel.density")}`}
            onChange={(e) => {
              const v = Number(e.target.value) / 100;
              setCustom(kind === "bg" ? { bgAlpha: v } : { inkAlpha: v });
            }}
            className="w-full accent-[#EAB308]"
          />
          <span className="w-11 shrink-0 text-right whitespace-nowrap tabular-nums">{Math.round(alpha * 100)} %</span>
        </label>
      </div>
    );
  };

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-[#0F172A] transition-colors hover:bg-white/35",
          (open || custom) && "bg-white/40",
        )}
      >
        <Palette className="size-4" aria-hidden />
        {t("tafel.colors")}
        {custom && (
          <span
            aria-hidden
            className="size-3.5 rounded-full ring-1 ring-black/20"
            style={{ background: `linear-gradient(135deg, ${c.bg} 50%, ${c.ink} 50%)` }}
          />
        )}
      </button>
      {open && (
        <fieldset className="absolute bottom-full left-0 z-30 mb-3 w-[min(18rem,80vw)] space-y-3 rounded-xl border-0 bg-white/90 p-4 shadow-[0_20px_40px_-12px_rgb(0_0_0/0.6)] ring-1 ring-black/10 backdrop-blur-xl">
          <legend className="sr-only">{t("tafel.colors")}</legend>
          {row("bg")}
          {row("ink")}
          <button
            type="button"
            onClick={resetCustom}
            disabled={!custom}
            className="flex items-center gap-1.5 text-xs font-medium text-[#475569] hover:text-[#0F172A] disabled:opacity-40"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            {t("tafel.colorsReset")}
          </button>
        </fieldset>
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
  avatar,
}: {
  professor: Professor;
  subtitle: ReactNode;
  /** « écrit au tableau… » pendant une réponse. */
  status?: ReactNode;
  /** Lien « changer de professeur ». */
  action?: ReactNode;
  /** Remplace le portrait (le professeur hologramme du tuteur). */
  avatar?: ReactNode;
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
      {avatar ?? <ProfessorHalo professor={professor} size="sm" />}
      <div className="relative min-w-0 flex-1">
        <p className="font-display truncate text-base font-semibold">{professor.name}</p>
        <p className="truncate text-xs text-white/60">
          {status ? (
            <span className="inline-flex items-center gap-1.5 text-[#FACC15]">
              <span className="size-1.5 rounded-full bg-[#FACC15]" />
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
 * Les trois fonds prêts à l'emploi, posés sur le rebord comme trois petits
 * aimants. En choisir un efface les couleurs libres.
 */
function ThemePicker({ theme, onTheme }: { theme: BoardTheme | null; onTheme: (t: BoardTheme) => void }) {
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
