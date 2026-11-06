import { lazy, Suspense, useMemo, useRef, useState } from "react";
import { AlertTriangle, Box, Loader2, Maximize2, RotateCcw } from "lucide-react";
import { Modal } from "@/components/modal";
import { describePart, looksIncomplete, parseModel3D } from "@/lib/model3d";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Bloc ```3d-json dans une réponse du tuteur (chat, Hörsaal, exercices) :
 * valide le JSON (lib/model3d.ts), puis affiche la maquette manipulable.
 * Three.js n'est téléchargé qu'à l'affichage de la première maquette.
 */
const Model3DViewer = lazy(() => import("./Model3DViewer"));

const FRAME =
  "my-4 overflow-hidden rounded-2xl border border-[#EAB308]/45 bg-[#FDFBF7]/80 shadow-[0_8px_30px_-12px_rgb(15_23_42/0.25)] backdrop-blur-md dark:border-[#EAB308]/35 dark:bg-[#0F172A]/70";

export function Model3DBlock({ code }: { code: string }) {
  const { t } = useT();
  const parsed = useMemo(() => parseModel3D(code), [code]);
  const reset = useRef<(() => void) | null>(null);
  const [showJson, setShowJson] = useState(false);
  // La colonne du professeur est étroite sur PC : la maquette s'ouvre en grand.
  const [big, setBig] = useState(false);

  if (!parsed.ok) {
    // Pendant l'écriture de la réponse, le bloc arrive par morceaux.
    if (looksIncomplete(code)) {
      return (
        <div className={cn(FRAME, "text-muted-foreground flex h-24 items-center justify-center gap-2 text-sm")}>
          <Loader2 className="size-4 animate-spin text-[#EAB308]" aria-hidden /> {t("model3d.loading")}
        </div>
      );
    }
    return (
      <div className={cn(FRAME, "p-3 text-sm")}>
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
          <AlertTriangle className="size-3.5" aria-hidden /> {t("model3d.invalid")} — {parsed.error}
        </div>
      </div>
    );
  }

  const { model } = parsed;
  const parts = model.parts.map(describePart);
  const label = `${t("model3d.title")}: ${model.title ? `${model.title} — ` : ""}${parts.join(", ")}`;

  return (
    <figure className={FRAME}>
      <div className="flex items-center gap-2 border-b border-[#EAB308]/25 px-3 py-2">
        <span className="grid size-6 place-items-center rounded-md bg-[#0F172A] text-[#EAB308] dark:bg-[#EAB308]/15">
          <Box className="size-3.5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#1A1A1A] dark:text-white">
          {model.title ?? t("model3d.title")}
        </span>
        <button
          type="button"
          onClick={() => reset.current?.()}
          className="text-muted-foreground flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[#EAB308]/15 hover:text-[#1A1A1A] dark:hover:text-white"
          title={t("model3d.reset")}
        >
          <RotateCcw className="size-3.5" aria-hidden />
          <span className="sr-only">{t("model3d.reset")}</span>
        </button>
        <button
          type="button"
          onClick={() => setBig(true)}
          className="text-muted-foreground flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors hover:bg-[#EAB308]/15 hover:text-[#1A1A1A] dark:hover:text-white"
          title={t("model3d.expand")}
        >
          <Maximize2 className="size-3.5" aria-hidden />
          <span className="sr-only">{t("model3d.expand")}</span>
        </button>
      </div>

      <div className="relative h-72 bg-[radial-gradient(ellipse_at_center,#FFFFFF_0%,#F4EFE4_100%)] sm:h-96 dark:bg-[radial-gradient(ellipse_at_center,#1E293B_0%,#0F172A_100%)]">
        <Suspense
          fallback={
            <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin text-[#EAB308]" aria-hidden /> {t("model3d.loading")}
            </div>
          }
        >
          <Model3DViewer model={model} label={label} noWebGL={t("model3d.noWebgl")} onResetReady={(fn) => (reset.current = fn)} />
        </Suspense>
        <span className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-white/70 px-2 py-0.5 text-[10px] text-[#3A3A3A] backdrop-blur dark:bg-black/40 dark:text-white/75">
          {t("model3d.hint")}
        </span>
      </div>

      <Modal
        open={big}
        onClose={() => setBig(false)}
        title={model.title ?? t("model3d.title")}
        className="max-w-5xl border-[#EAB308]/45 bg-[#FDFBF7] dark:bg-[#0F172A]"
      >
        {big && (
          <div className="h-[70dvh] overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_center,#FFFFFF_0%,#F4EFE4_100%)] dark:bg-[radial-gradient(ellipse_at_center,#1E293B_0%,#0F172A_100%)]">
            <Suspense fallback={null}>
              <Model3DViewer model={model} label={label} noWebGL={t("model3d.noWebgl")} onResetReady={() => {}} />
            </Suspense>
          </div>
        )}
        <p className="text-muted-foreground mt-2 text-xs">{t("model3d.hint")}</p>
      </Modal>

      <figcaption className="flex flex-wrap items-center gap-1.5 border-t border-[#EAB308]/25 px-3 py-2 text-[11px]">
        <span className="text-muted-foreground mr-1">{t("model3d.unit")}</span>
        {parts.slice(0, 8).map((p, i) => (
          <span key={i} className="rounded-full border border-[#E7E2D8] bg-white/70 px-2 py-0.5 text-[#3A3A3A] dark:border-white/10 dark:bg-white/5 dark:text-white/75">
            {p}
          </span>
        ))}
        {parts.length > 8 && <span className="text-muted-foreground">+{parts.length - 8}</span>}
        {model.holes.length > 0 && (
          <span className="rounded-full bg-[#EAB308]/15 px-2 py-0.5 text-[#854D0E] dark:text-[#FDE047]">
            {t("model3d.holes", { n: model.holes.length })}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowJson((v) => !v)}
          aria-expanded={showJson}
          className="text-muted-foreground hover:text-foreground ml-auto underline-offset-2 hover:underline"
        >
          {t("model3d.json")}
        </button>
        {showJson && (
          <pre className="bg-secondary/60 mt-2 max-h-48 w-full overflow-auto rounded-lg p-2 font-mono text-[11px]">{code.trim()}</pre>
        )}
      </figcaption>
    </figure>
  );
}
