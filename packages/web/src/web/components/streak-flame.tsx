import { useQuery } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { useT } from "@/i18n";
import { orpc } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * La flamme : la série de jours d'étude, sur le tableau de bord.
 *
 *     🔥 3 Tage in Folge
 *
 * Le chiffre vient du serveur (api/lib/streak.ts) : jours d'affilée où une
 * question a été posée. Quand la série d'hier n'a pas encore été prolongée
 * aujourd'hui, la flamme pâlit et une phrase le dit — une seule, sans compte à
 * rebours ni couleur d'alarme : un rappel, pas une pression.
 *
 * Posée sur la photo assombrie de l'en-tête : couleurs fixes, lisibles dans
 * les deux thèmes. Rien ne s'affiche tant que le serveur n'a pas répondu.
 */
export function StreakFlame({ className }: { className?: string }) {
  const { t } = useT();
  const { data } = useQuery({ ...orpc.streak.me.queryOptions(), staleTime: 60_000 });
  if (!data) return null;

  const lit = data.current > 0 && data.activeToday;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span
        data-testid="streak-flame"
        data-streak={data.current}
        title={t("streak.label")}
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums backdrop-blur-sm",
          lit ? "border-[#FB923C]/50 bg-[#7C2D12]/55 text-[#FED7AA]" : "border-white/25 bg-black/30 text-white/85",
        )}
      >
        <Flame className={cn("size-4", data.current > 0 ? "text-[#FB923C]" : "text-white/55")} fill={lit ? "currentColor" : "none"} aria-hidden />
        {data.current > 0 ? t("streak.days", { n: data.current }) : t("streak.none")}
      </span>
      {data.atRisk && (
        <p data-testid="streak-at-risk" className="on-photo max-w-xl text-sm text-white/85">
          {t("streak.atRisk")}
        </p>
      )}
    </div>
  );
}
