import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { MarkdownContent } from "@/components/markdown-content";
import { isFinalStep, type TafelStep } from "@/lib/tafel";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Die Tafel — le tableau du Tuteur Actif.
 *
 * Les étapes de la réponse (format NIVEAU 7) s'y écrivent une par une : chaque
 * carte apparaît en fondu quand elle arrive dans le flux, comme si le prof
 * l'écrivait. L'étape encore en cours porte un curseur jaune. La dernière
 * étape « Endgleichung / Ergebnis » est mise en avant ; si le calcul vient du
 * solveur (outils rechnen / balkenstatik), elle porte le badge
 * « Berechnet mit dem Löser ».
 */
export function TafelBoard({
  steps,
  solverUsed,
  writing,
}: {
  steps: TafelStep[];
  /** Un outil de calcul (rechnen, balkenstatik) a servi pour cette réponse. */
  solverUsed: boolean;
  /** La réponse est encore en cours de génération. */
  writing: boolean;
}) {
  const { t } = useT();
  const lastIndex = steps.length - 1;

  return (
    <section
      aria-label={t("tafel.title")}
      className="relative flex min-h-full flex-col gap-4 rounded-[22px] border border-[#E7E2D8] bg-white bg-[radial-gradient(#E7E2D8_1px,transparent_1px)] [background-size:22px_22px] p-4 shadow-[0_1px_2px_rgb(26_26_26/0.04),0_18px_40px_-24px_rgb(26_26_26/0.18)] sm:p-6"
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-2xl font-semibold">{t("tafel.title")}</h2>
        {writing && (
          <span className="text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
            {t("tafel.writing")}
            <span className="bg-signature size-1.5 animate-pulse rounded-full" />
          </span>
        )}
      </header>

      {/* Progression : une pastille par étape. */}
      <ol className="flex flex-wrap gap-1.5" aria-label={t("tafel.progress")}>
        {steps.map((s, i) => (
          <li
            key={i}
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              s.complete && !(writing && i === lastIndex)
                ? "bg-primary text-primary-foreground"
                : "border-signature bg-accent border",
            )}
          >
            {i + 1} {s.label}
          </li>
        ))}
      </ol>

      {steps.map((s, i) => {
        const final = isFinalStep(s.label) && i === lastIndex;
        const inProgress = !s.complete || (writing && i === lastIndex);
        return (
          <motion.article
            key={`${i}-${s.label}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "rounded-2xl bg-white px-4 py-4 sm:px-5",
              final ? "border-signature border-2 bg-[#FFFDF5]" : "border border-[#E7E2D8]",
            )}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-muted-foreground font-mono text-[11px] tracking-[0.12em] uppercase">
                {String(i + 1).padStart(2, "0")} · {s.label}
              </p>
              {final && solverUsed && !inProgress && (
                <span className="bg-primary text-primary-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs">
                  <Check className="size-3" aria-hidden /> {t("tafel.solver")}
                </span>
              )}
            </div>
            {/* Formules en grand : la Tafel se lit de loin. */}
            <div className={cn("[&_.katex-display]:my-3", final ? "[&_.katex]:text-[1.45em]" : "[&_.katex-display_.katex]:text-[1.25em]")}>
              <MarkdownContent content={s.body} />
            </div>
            {inProgress && (
              <span aria-hidden className="bg-signature mt-1 inline-block h-5 w-[3px] animate-pulse align-middle" />
            )}
          </motion.article>
        );
      })}
    </section>
  );
}
