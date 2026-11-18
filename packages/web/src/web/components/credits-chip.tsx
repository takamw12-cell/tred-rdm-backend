import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Coins, UserPlus } from "lucide-react";
import { useT } from "@/i18n";
import { creditsMeOptions } from "@/queries/credits";
import { useLocaleStore } from "@/stores/locale";
import { formatCredits } from "@/lib/credit-format";
import { cn } from "@/lib/utils";

/**
 * Le solde de crédits, sur l'en-tête du tableau de bord (modèle « stock de
 * crédits », 18 nov. 2026). Un clic mène aux tarifs ; à côté, l'invitation
 * d'amis. Posé sur la photo assombrie : couleurs fixes.
 */
export function CreditsChip({ className }: { className?: string }) {
  const { t } = useT();
  const locale = useLocaleStore((s) => s.locale);
  const { data } = useQuery({ ...creditsMeOptions(), staleTime: 30_000 });
  if (!data) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Link
        href="/pricing"
        data-testid="credits-chip"
        data-credits={data.unlimited ? "unlimited" : data.purchasedCredits}
        title={data.unlimited ? t("credits.founderTitle", { n: formatCredits(data.purchasedCredits, locale) }) : undefined}
        className="inline-flex items-center gap-1.5 rounded-full border border-[#EAB308]/50 bg-[#0F172A]/55 px-3 py-1 text-sm font-semibold text-[#FEF3C7] tabular-nums backdrop-blur-sm hover:bg-[#0F172A]/70"
      >
        <Coins className="size-4 text-[#EAB308]" aria-hidden />
        {data.unlimited ? t("credits.founderChip") : t("credits.chip", { n: formatCredits(data.purchasedCredits, locale) })}
      </Link>
      <Link href="/invite" data-testid="invite-link" className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/30 px-3 py-1 text-sm text-white/90 backdrop-blur-sm hover:bg-black/45">
        <UserPlus className="size-4" aria-hidden />
        {t("invite.short")}
      </Link>
    </div>
  );
}
