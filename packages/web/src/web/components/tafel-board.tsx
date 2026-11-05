import { motion } from "framer-motion";
import { MarkdownContent } from "@/components/markdown-content";
import {
  BoardStatus,
  GlassBoard,
  INK,
  PaperNote,
  SolverStamp,
  StepChecklist,
} from "@/components/hoersaal";
import { isFinalStep, type TafelStep } from "@/lib/tafel";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Die Tafel — le tableau du Tuteur Actif, dans le décor validé du Digitaler
 * Hörsaal (components/hoersaal.tsx) : verre trempé, cadre en métal brossé,
 * rebord avec les feutres.
 *
 * Les étapes de la réponse (format NIVEAU 7) s'y posent une par une, chacune
 * sur sa feuille tenue par un aimant, en fondu quand elle arrive dans le flux
 * — comme si le prof l'écrivait. L'étape encore en cours porte un curseur.
 * La dernière étape « Endgleichung / Ergebnis » est encadrée ; si le calcul
 * vient du solveur (outils rechnen / balkenstatik), elle porte le tampon
 * « Berechnet mit dem Löser ».
 */
export function TafelBoard({
  steps,
  solverUsed,
  writing,
  className,
}: {
  steps: TafelStep[];
  /** Un outil de calcul (rechnen, balkenstatik) a servi pour cette réponse. */
  solverUsed: boolean;
  /** La réponse est encore en cours de génération. */
  writing: boolean;
  className?: string;
}) {
  const { t, locale } = useT();
  const lastIndex = steps.length - 1;
  const empty = steps.length === 0;

  return (
    <GlassBoard
      aria-label={t("tafel.title")}
      eyebrow="Digitaler Hörsaal"
      title={t("tafel.title")}
      status={writing && !empty ? <BoardStatus>{t("tafel.writing")}</BoardStatus> : undefined}
      className={className}
    >
      {empty ? (
        <p className="font-hand my-auto max-w-md text-center text-3xl leading-snug text-[#94A3B8]">
          {EMPTY[locale === "de" || locale === "fr" ? locale : "en"]}
        </p>
      ) : (
        <>
          <StepChecklist
            label={t("tafel.progress")}
            steps={steps.map((s, i) => ({
              label: s.label,
              done: s.complete && !(writing && i === lastIndex),
            }))}
          />

          {steps.map((s, i) => {
            const final = isFinalStep(s.label) && i === lastIndex;
            const inProgress = !s.complete || (writing && i === lastIndex);
            return (
              <motion.div
                key={`${i}-${s.label}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="flex w-full justify-center"
              >
                <PaperNote
                  // Deux feuilles voisines ne sont jamais parallèles.
                  tilt={i % 2 === 0 ? -0.5 : 0.4}
                  highlight={final}
                  title={`${i + 1}. ${s.label}`}
                  stamp={
                    final && solverUsed && !inProgress ? (
                      <SolverStamp label={t("tafel.solver")} sublabel="" />
                    ) : undefined
                  }
                >
                  {/* Formules en grand : la Tafel se lit de loin. */}
                  <div
                    className={cn(
                      "[&_.katex-display]:my-3 [&_.katex-display]:!overflow-x-auto",
                      final
                        ? "[&_.katex]:text-[1.45em]"
                        : "[&_.katex-display_.katex]:text-[1.25em]",
                    )}
                  >
                    <MarkdownContent content={s.body} />
                  </div>
                  {inProgress && (
                    <span
                      aria-hidden
                      className="mt-1 inline-block h-6 w-[3px] animate-pulse align-middle"
                      style={{ background: INK }}
                    />
                  )}
                </PaperNote>
              </motion.div>
            );
          })}
        </>
      )}
    </GlassBoard>
  );
}

/** Tableau vide : une invitation écrite au feutre. */
const EMPTY = {
  de: "Die Tafel ist bereit. Stell deine Frage — ich schreibe die Lösung Schritt für Schritt an.",
  en: "The board is ready. Ask your question — I'll write the solution step by step.",
  fr: "Le tableau est prêt. Pose ta question — j'écris la solution étape par étape.",
};
