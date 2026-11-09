import { createContext, useContext, useRef, type ReactNode, type RefObject } from "react";
import { motion } from "framer-motion";
import { GripHorizontal } from "lucide-react";
import { ROOM_BG } from "@/components/hoersaal";
import { HologramProfessor } from "@/components/hologram-professor";
import type { Professor } from "@/lib/professors";
import type { ProfessorPose } from "@/lib/professor-choreography";
import { cn } from "@/lib/utils";

/**
 * La scène du Hörsaal. De haut en bas, sur TOUS les écrans, dans le flux
 * (flex-col) :
 *
 *   ┌───────────────────────────────────────────────┐
 *   │  la Tafel                      ┌──────────┐   │
 *   │                                │ prof     │ ← flottant, déplaçable (drag)
 *   │                                │ holo.    │   │
 *   │                                └──────────┘   │
 *   │  ═══ rebord « Farben » : couleurs du tableau ═══│
 *   └───────────────────────────────────────────────┘
 *        ┌─────────────────────────────────┐
 *        │ messages + saisie (verre dépoli)│ ← barre du chat, tout en bas
 *        └─────────────────────────────────┘
 *
 * Décision fondateur (2026-11-09) : le rebord « Farben » reste TOUJOURS
 * visible au-dessus de la saisie. Avant, la barre du chat flottait
 * (absolute) à une distance fixe du bas et recouvrait les réglages dès
 * qu'une hauteur changeait (barre de navigation, zone sûre de l'iPhone,
 * taille du texte). Dans le flux, aucun chevauchement n'est possible.
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
  /** Le contenu de la barre du chat (messages + saisie). */
  dock: ReactNode;
  /** Les éléments posés sur le tableau (le professeur flottant). */
  children?: ReactNode;
  /** La page vit sous la barre de navigation mobile (fixe, en bas) : on lui laisse sa place. */
  bottomNav?: boolean;
  className?: string;
}) {
  const stageRef = useRef<HTMLDivElement>(null);

  return (
    <StageContext.Provider value={stageRef}>
      <div
        ref={stageRef}
        data-slot="hoersaal-stage"
        className={cn("relative isolate flex min-h-0 w-full flex-1 flex-col overflow-hidden", ROOM_BG, className)}
      >
        {/* La Tafel et son rebord « Farben » : tout l'espace au-dessus de la barre du chat */}
        <div data-slot="stage-board" className="relative flex min-h-0 flex-1 flex-col p-2 sm:p-3 lg:p-4">
          {board}
        </div>

        {/* Ce qui est posé sur le tableau */}
        {children}

        {/* La barre du chat : sous le rebord, tout en bas */}
        <div
          data-slot="stage-dock"
          className={cn(
            "relative z-30 flex shrink-0 justify-center px-2 sm:px-3 lg:px-4",
            // Au-dessus de la barre de navigation mobile (fixe), jamais dessous.
            bottomNav
              ? "pb-[calc(4.25rem+env(safe-area-inset-bottom))] sm:pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-4"
              : "pb-2 sm:pb-3 lg:pb-4",
          )}
        >
          {/* Posée sur la salle sombre : à 50 % la barre virerait au gris et le
              texte gris tomberait à 1,4:1 → 95 % de crème, le flou reste. */}
          <div
            data-slot="chat-dock"
            className="border-border/50 bg-background/95 w-full max-w-3xl rounded-3xl border shadow-[0_24px_60px_-18px_rgb(0_0_0/0.75),0_2px_10px_-2px_rgb(0_0_0/0.35)] ring-1 ring-white/30 backdrop-blur-xl backdrop-saturate-150 dark:ring-white/10"
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
