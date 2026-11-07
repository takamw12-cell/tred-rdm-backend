import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react";
import { motion } from "framer-motion";
import { GripHorizontal } from "lucide-react";
import { ROOM_BG } from "@/components/hoersaal";
import { HologramProfessor } from "@/components/hologram-professor";
import type { Professor } from "@/lib/professors";
import type { ProfessorPose } from "@/lib/professor-choreography";
import { cn } from "@/lib/utils";

/**
 * La scène du Hörsaal — UN seul conteneur, tout le reste en `absolute` :
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  la Tafel : 100 % de la largeur et de la      │
 *   │  hauteur                       ┌──────────┐   │
 *   │                                │ prof     │ ← flottant, déplaçable (drag)
 *   │                                │ holo.    │   │
 *   │                                └──────────┘   │
 *   │      ┌─────────────────────────────────┐      │
 *   │      │ messages + saisie (verre dépoli)│ ← barre flottante, centrée
 *   │      └─────────────────────────────────┘      │
 *   │  ═══ rebord : couleurs du tableau ═══         │
 *   └───────────────────────────────────────────────┘
 *
 * La barre flotte AU-DESSUS du rebord : les réglages de couleur restent
 * accessibles. Sa hauteur est mesurée et publiée dans `--dock-space` ; le
 * tableau ajoute cet espace en fin de défilement (components/hoersaal.tsx),
 * pour que la dernière étape ne reste jamais cachée derrière la barre.
 */

/** Le conteneur de la scène : limite du glisser-déposer du professeur. */
const StageContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

export function HoersaalStage({
  board,
  dock,
  children,
  bottomNav = false,
  className,
}: {
  /** Le tableau (plein cadre). */
  board: ReactNode;
  /** Le contenu de la barre flottante du bas (messages + saisie). */
  dock: ReactNode;
  /** Les éléments posés sur le tableau (le professeur flottant). */
  children?: ReactNode;
  /** La page vit sous la barre de navigation mobile (fixe, en bas) : on lui laisse sa place. */
  bottomNav?: boolean;
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const dock = dockRef.current;
    if (!stage || !dock || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      stage.style.setProperty("--dock-space", `${Math.ceil(dock.getBoundingClientRect().height) + 16}px`);
    });
    ro.observe(dock);
    return () => ro.disconnect();
  }, []);

  return (
    <StageContext.Provider value={stageRef}>
      <div
        ref={stageRef}
        data-slot="hoersaal-stage"
        className={cn("relative isolate min-h-0 w-full flex-1 overflow-hidden", ROOM_BG, className)}
      >
        {/* La Tafel, plein cadre */}
        <div
          data-slot="stage-board"
          className={cn(
            "absolute inset-0 flex flex-col p-2 sm:p-3 lg:p-4",
            bottomNav && "pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-4",
          )}
        >
          {board}
        </div>

        {/* Ce qui est posé sur le tableau */}
        {children}

        {/* La barre du bas : centrée, en verre dépoli, au-dessus du rebord */}
        <div
          data-slot="stage-dock"
          className={cn(
            "pointer-events-none absolute inset-x-0 z-30 flex justify-center px-3 sm:px-6",
            bottomNav
              ? "bottom-[calc(7.75rem+env(safe-area-inset-bottom))] sm:bottom-[calc(8.25rem+env(safe-area-inset-bottom))] lg:bottom-[4.75rem]"
              : "bottom-[4.25rem] sm:bottom-[4.5rem] lg:bottom-[4.75rem]",
          )}
        >
          <div
            ref={dockRef}
            data-slot="chat-dock"
            className="border-border/50 bg-background/70 supports-[backdrop-filter]:bg-background/50 pointer-events-auto w-full max-w-3xl rounded-3xl border shadow-[0_24px_60px_-18px_rgb(0_0_0/0.75),0_2px_10px_-2px_rgb(0_0_0/0.35)] ring-1 ring-white/30 backdrop-blur-xl backdrop-saturate-150 dark:ring-white/10"
          >
            {dock}
          </div>
        </div>
      </div>
    </StageContext.Provider>
  );
}

/**
 * Le professeur flottant : posé sur le tableau, on le déplace au doigt ou à
 * la souris (framer-motion `drag`, borné à la scène). L'hologramme suit la
 * chorégraphie : de dos pendant l'écriture, il se retourne, puis il parle.
 * Les boutons (`actions`) ne déclenchent jamais le glisser.
 */
export function FloatingProfessor({
  professor,
  pose,
  beat,
  status,
  subtitle,
  actions,
  video,
  dragLabel,
  className,
}: {
  professor: Professor;
  pose: ProfessorPose;
  beat?: number;
  /** Ce qu'il fait en ce moment (« écrit au tableau »…), sinon `subtitle`. */
  status?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** Vidéo de l'avatar temps réel : remplace l'hologramme. */
  video?: ReactNode;
  /** Infobulle : « Ziehen zum Verschieben ». */
  dragLabel?: string;
  className?: string;
}) {
  const stage = useContext(StageContext);
  return (
    <motion.div
      data-slot="floating-professor"
      data-pose={pose}
      drag
      dragConstraints={stage ?? undefined}
      dragMomentum={false}
      dragElastic={0.06}
      whileDrag={{ scale: 1.04 }}
      title={dragLabel}
      className={cn(
        "absolute top-[5.5rem] right-3 z-20 flex cursor-grab touch-none flex-col items-center gap-2 select-none active:cursor-grabbing sm:top-28 sm:right-8 [&_img]:pointer-events-none",
        className,
      )}
    >
      {video ?? <HologramProfessor professor={professor} pose={pose} beat={beat} size="float" />}
      <div className="flex max-w-[15rem] items-center gap-1 rounded-full border border-white/10 bg-slate-950/60 py-1 pr-1 pl-2 text-white shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)] backdrop-blur-md">
        <GripHorizontal className="size-3.5 shrink-0 text-white/40" aria-hidden />
        <div className="min-w-0 px-1 leading-tight">
          <p className="font-display truncate text-xs font-semibold">{professor.name}</p>
          {(status ?? subtitle) && (
            <p className={cn("truncate text-[10px]", status ? "text-[#FACC15]" : "text-white/60")}>{status ?? subtitle}</p>
          )}
        </div>
        {actions && (
          // Appuyer sur un bouton ne doit pas faire partir le professeur.
          <div className="flex shrink-0 items-center" onPointerDownCapture={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </motion.div>
  );
}
