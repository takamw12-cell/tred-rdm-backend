import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { ArrowRight, Sparkles } from "lucide-react";
import { pricingCopy } from "@/lib/pricing-copy";
import { subscriptionMeOptions } from "@/queries/subscriptions";
import { useLocaleStore } from "@/stores/locale";

/**
 * « Il te reste X jours d'essai ».
 *
 * Affiché sous la barre du haut pendant les 14 jours d'essai illimité
 * (api/lib/trial.ts). Il disparaît de lui-même : à la fin de l'essai le
 * serveur répond `trial.active = false`, et le compte est Free.
 * Pas de croix : c'est un compte à rebours, pas une publicité.
 */
export function TrialBanner() {
  const locale = useLocaleStore((s) => s.locale);
  const { data } = useQuery({ ...subscriptionMeOptions(), staleTime: 60_000 });
  if (!data?.trial.active || data.trial.daysLeft <= 0) return null;
  const c = pricingCopy(locale);
  // Les trois derniers jours, le bandeau passe en jaune plein.
  const urgent = data.trial.daysLeft <= 3;

  return (
    <div
      role="status"
      data-testid="trial-banner"
      className={
        urgent
          ? "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#EAB308] px-4 py-2 text-center text-sm font-semibold text-[#1A1A1A]"
          : "flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-[#0F172A] px-4 py-2 text-center text-sm font-medium text-white"
      }
    >
      <span className="inline-flex items-center gap-1.5">
        <Sparkles className={urgent ? "size-4" : "size-4 text-[#EAB308]"} aria-hidden />
        {c.trialBanner(data.trial.daysLeft)}
      </span>
      <Link
        href="/pricing"
        className={
          urgent
            ? "inline-flex items-center gap-1 underline underline-offset-4"
            : "inline-flex items-center gap-1 text-[#FACC15] underline-offset-4 hover:underline"
        }
      >
        {c.trialBannerCta}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}
