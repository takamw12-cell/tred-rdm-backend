import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useT } from "@/i18n";
import type { ImportStatus } from "@/lib/import-job";

/**
 * L'écran d'attente d'un import : un film TRED de 10 s en boucle, muet (ses
 * sous-titres sont dans l'image), et une barre qui suit l'état du travail.
 *
 * Le fichier porte sa version dans son nom (`-v1`) : il est servi avec un
 * cache d'un an (__server.ts). Changer le film = changer le nom.
 */
export const WAIT_VIDEO = "/videos/import-wait-v1.mp4";
export const WAIT_POSTER = "/videos/import-wait-v1.webp";

export interface ImportWaitState {
  /** `uploading` : le fichier monte encore vers le serveur. */
  status: "uploading" | ImportStatus;
  /** 0…100. `null` : serveur sans file, durée inconnue (barre indéterminée). */
  progress: number | null;
  title: string;
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
            className="bg-card border-border w-full max-w-2xl overflow-hidden rounded-lg border shadow-xl"
          >
            <div className="relative aspect-video bg-black">
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

            <div className="p-4 sm:p-5">
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
          </motion.div>
        </motion.section>
      )}
    </AnimatePresence>,
    document.body,
  );
}
