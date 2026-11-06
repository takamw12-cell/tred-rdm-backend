import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { useToastStore } from "@/stores/toast";
import { cn } from "@/lib/utils";

/**
 * Zone des toasts : en bas au centre, au-dessus de la barre mobile. Annoncée
 * aux lecteurs d'écran (`<output>` = région live polie).
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <output
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className={cn(
              "pointer-events-auto flex max-w-sm items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg",
              "border-[#E7E2D8] bg-[#FDFBF7] text-[#0F172A] dark:border-white/10 dark:bg-[#0F172A] dark:text-white",
            )}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="size-4 shrink-0 text-[#EAB308]" aria-hidden />
            ) : (
              <AlertCircle className="text-destructive size-4 shrink-0" aria-hidden />
            )}
            <span>{t.message}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="-mr-1 ml-1 opacity-50 transition-opacity hover:opacity-100"
              aria-label="OK"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </output>
  );
}
