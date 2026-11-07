import { useQuery } from "@tanstack/react-query";
import { FileCheck, Loader2, Radar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { orpc } from "@/lib/api";
import { useT } from "@/i18n";

/**
 * Onglet « Prognose » de Übungen & Klausuren (V2 — Pilier 2, FONDATIONS).
 *
 * Aujourd'hui : l'état réel des données (combien d'Altklausuren, quelles
 * années) et ce que la prognose fera. Pas de pourcentage inventé : la carte
 * de probabilité arrive quand le calcul (lib/exam-predictor.ts) sera branché
 * sur l'étiquetage des examens.
 */
export function ExamPredictionTab() {
  const { t } = useT();
  const { data, isLoading } = useQuery(orpc.examPredictor.status.queryOptions());

  if (isLoading || !data) {
    return <Loader2 className="text-muted-foreground mx-auto my-12 size-5 animate-spin" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-start gap-4 pt-0">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#EAB308]/15 text-[#CA8A04] dark:text-[#EAB308]">
            <Radar className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold">{t("examPrediction.title")}</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{t("examPrediction.intro")}</p>
            <p className="mt-3 inline-flex rounded-full border border-[#EAB308]/50 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#CA8A04] uppercase dark:text-[#EAB308]">
              {t("examPrediction.soon")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileCheck className="size-4" />
            {t("examPrediction.examsFound", { n: data.examCount })}
          </div>
          {data.years.length > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">{t("examPrediction.years", { years: data.years.join(", ") })}</p>
          )}
          <p className="text-muted-foreground mt-3 text-sm">
            {data.enoughData ? t("examPrediction.enough") : t("examPrediction.needMore", { min: data.minExams })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
