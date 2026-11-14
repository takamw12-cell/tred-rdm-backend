import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ImportQueueList, ImportQueueSummary } from "@/components/import-queue";
import { ProfessorPortrait } from "@/components/professor-portrait";
import { useT } from "@/i18n";
import type { QueueItem } from "@/lib/import-batch";
import type { ImportStatus } from "@/lib/import-job";
import { PROFESSORS } from "@/lib/professors";

/**
 * L'écran d'attente d'un import : un film TRED de 10 s en boucle, VERTICAL
 * (9:16, comme sur TikTok), muet (ses sous-titres sont dans l'image), et une
 * barre qui suit l'état du travail.
 *
 * v2 (2026-11-14) : extrait du pilote « Die Klausur morgen » de la campagne
 * « Survive Your Klausur » — 0 Ahnung → le trait orange → TRED explique.
 * Le fichier porte sa version dans son nom : il est servi avec un cache d'un
 * an (__server.ts). Changer le film = changer le nom.
 *
 * Sous le film, un professeur de l'app dit ce qui se passe : « Ich lese dein
 * Skript … einen Moment bitte. » (décision du fondateur, 2026-11-14).
 *
 * Import PAR LOT (`state.queue`) : la file prend la place du film — une ligne
 * par fichier, avec son statut. C'est elle que l'étudiant regarde, et elle
 * demande une carte plus large que le film vertical.
 */
export const WAIT_VIDEO = "/videos/import-wait-v2.mp4";
export const WAIT_POSTER = "/videos/import-wait-v2.webp";

/**
 * Prof. Kenta, « Das junge Genie » : le visage de la campagne « Survive Your
 * Klausur » — celui que l'étudiant a vu sur TikTok l'accueille ici. Toujours
 * lui, quel que soit le professeur choisi pour le Hörsaal.
 */
export const WAIT_PROFESSOR = PROFESSORS.genius;

/**
 * Le professeur en hologramme, comme dans le Hörsaal (anneau cyan, trame,
 * halo qui pulse quand il parle). Version courte de `HologramProfessor`, qui
 * embarquerait ici toute la voix et le chat pour un simple portrait.
 */
function WaitProfessor({ still }: { still: boolean }) {
  return (
    <div className="relative size-14 shrink-0" aria-hidden="true">
      <div className="pointer-events-none absolute -bottom-1.5 left-1/2 h-2.5 w-[120%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgb(103_232_249/0.45),transparent_70%)] blur-[2px]" />
      <motion.div
        className="absolute inset-0 rounded-full bg-cyan-300/20 shadow-[0_0_24px_6px_rgb(34_211_238/0.25),0_0_14px_3px_rgb(234_179_8/0.25)]"
        animate={still ? { opacity: 0.6 } : { scale: [1, 1.1, 1], opacity: [0.55, 1, 0.55] }}
        transition={still ? { duration: 0 } : { duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 overflow-hidden rounded-full ring-2 ring-cyan-300/70">
        <ProfessorPortrait professor={WAIT_PROFESSOR} eager />
        <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgb(103_232_249/0.10),rgb(34_211_238/0.22))] mix-blend-screen" />
        <span className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(180deg,rgb(255_255_255/0.25)_0px,rgb(255_255_255/0.25)_1px,transparent_1px,transparent_3px)]" />
      </div>
    </div>
  );
}

export interface ImportWaitState {
  /** `uploading` : le fichier monte encore vers le serveur. */
  status: "uploading" | ImportStatus;
  /** 0…100. `null` : serveur sans file, durée inconnue (barre indéterminée). */
  progress: number | null;
  title: string;
  /** Import par lot : la file, un élément par fichier déposé. */
  queue?: QueueItem[];
}

export function ImportWaitOverlay({ state, onHide }: { state: ImportWaitState | null; onHide: () => void }) {
  const { t } = useT();
  const reduced = useReducedMotion();
  const video = useRef<HTMLVideoElement>(null);

  // Échap masque l'écran ; l'import, lui, continue.
  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onHide();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, onHide]);

  if (typeof document === "undefined") return null;

  const label =
    state?.status === "uploading"
      ? t("library.wait.uploading")
      : state?.status === "pending"
        ? t("library.wait.pending")
        : state?.status === "done"
          ? t("library.wait.done")
          : t("library.wait.processing");
  const pct = state?.progress ?? null;

  return createPortal(
    <AnimatePresence>
      {state && (
        <motion.section
          key="import-wait"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 grid place-items-center bg-[#0f172a]/80 p-4 backdrop-blur-sm"
          aria-label={t("library.wait.title")}
          data-testid="import-wait"
        >
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25 }}
            // Écran bas (téléphone couché) : la carte défile au lieu de déborder.
            className="bg-card border-border max-h-full w-fit max-w-full overflow-x-hidden overflow-y-auto rounded-lg border shadow-xl"
          >
            {state.queue ? (
              <div className="p-4" style={{ width: "min(92vw, 26rem)" }} data-testid="import-wait-batch">
                <div className="mb-4 flex items-end gap-3" data-testid="import-wait-professor">
                  <WaitProfessor still={Boolean(reduced)} />
                  <p className="bg-secondary text-foreground min-w-0 rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-snug font-medium">
                    <span className="label-tech mb-0.5 block">{WAIT_PROFESSOR.name}</span>
                    {t("library.wait.professorLineBatch")}
                  </p>
                </div>
                <ImportQueueSummary items={state.queue} />
                <ImportQueueList items={state.queue} className="mt-2" />
                <div className="mt-2 flex justify-end">
                  <button type="button" onClick={onHide} className="text-muted-foreground hover:text-foreground shrink-0 text-xs font-medium underline underline-offset-2">
                    {t("library.wait.hide")}
                  </button>
                </div>
              </div>
            ) : (
              <>
            {/* Vertical : la hauteur suit l'écran (62 % au plus), la largeur s'en déduit ; le pied de carte prend la même largeur. */}
            <div className="relative mx-auto bg-black" style={{ height: "min(62dvh, 640px)", aspectRatio: "9 / 16" }}>
              <video
                ref={video}
                src={WAIT_VIDEO}
                poster={WAIT_POSTER}
                // Mouvement réduit demandé : pas de lecture automatique, l'étudiant décide.
                autoPlay={!reduced}
                controls={Boolean(reduced)}
                loop
                muted
                playsInline
                preload="auto"
                className="size-full object-cover"
                data-testid="import-wait-video"
              />
            </div>

            <div className="p-4" style={{ width: "calc(min(62dvh, 640px) * 9 / 16)", minWidth: "100%" }}>
              {/* Le professeur parle : sa bulle part de son portrait. */}
              <div className="mb-4 flex items-end gap-3" data-testid="import-wait-professor">
                <WaitProfessor still={Boolean(reduced)} />
                <p className="bg-secondary text-foreground min-w-0 rounded-2xl rounded-bl-sm px-3 py-2 text-sm leading-snug font-medium">
                  <span className="label-tech mb-0.5 block">{WAIT_PROFESSOR.name}</span>
                  {t("library.wait.professorLine")}
                </p>
              </div>

              <div className="flex items-baseline justify-between gap-3">
                <p className="label-tech">{t("library.wait.title")}</p>
                {pct !== null && <p className="label-tech tabular-nums">{pct} %</p>}
              </div>
              <p className="text-foreground mt-1 truncate text-sm font-semibold">{state.title}</p>

              {/* La vraie barre, pour les lecteurs d'écran ; celle qu'on voit est dessinée dessous. */}
              <progress className="sr-only" max={100} value={pct ?? undefined} aria-label={label} data-testid="import-wait-bar" />
              <div className="bg-secondary mt-3 h-2 overflow-hidden rounded-full" aria-hidden="true">
                {pct !== null ? (
                  <div className="bg-signature h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
                ) : (
                  <motion.div
                    className="bg-signature h-full w-1/3 rounded-full"
                    animate={reduced ? undefined : { x: ["-100%", "300%"] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs" aria-live="polite">
                  {label}
                </p>
                <button type="button" onClick={onHide} className="text-muted-foreground hover:text-foreground shrink-0 text-xs font-medium underline underline-offset-2">
                  {t("library.wait.hide")}
                </button>
              </div>
            </div>
              </>
            )}
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>,
    document.body,
  );
}
