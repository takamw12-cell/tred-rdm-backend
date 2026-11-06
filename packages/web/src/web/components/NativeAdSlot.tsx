import { useCallback, useRef, useState } from "react";
import { ExternalLink, Sparkles, X } from "lucide-react";
import { useUserStore } from "@/stores/user";
import { categoryForProgram } from "@/lib/background-sets";
import { partnerUrl, resourcesFor } from "@/lib/partner-resources";
import { adsAllowed, targetingFor, type AdNetwork, type SponsorTarget } from "@/lib/ad-mediation";
import { AD_CONFIG, trackAd, webNetwork } from "@/lib/ad-runtime";
import { useAdCopy, useAdImpression, useAdPlan } from "@/lib/use-ads";
import { track } from "@/lib/analytics";
import { AdSenseUnit } from "@/components/adsense-unit";
import { hiddenNow, hideFor30Days, ResourceLink } from "@/components/AdBanner";
import { cn } from "@/lib/utils";

/**
 * « Ressource partenaire » — l'encart natif, SOUS le Dashboard.
 *
 * Jamais dans le Hörsaal ni le Chat (lib/ad-mediation.ts › adsAllowed),
 * jamais pour un abonné, jamais animé. Verre dépoli, bordure crème.
 *
 *   AdSense configuré → un bloc AdSense, marqué « Anzeige ».
 *   Sinon (ou bloqueur) → la maison : le sponsor ciblé par filière
 *   (MATLAB pour le Maschinenbau, CATIA pour la Luft- und Raumfahrt…) et
 *   trois ressources Amazon. Aucun script tiers.
 */
export function NativeAdSlot({ className }: { className?: string }) {
  const program = useUserStore((s) => s.profile.degree);
  const plan = useAdPlan();
  const c = useAdCopy();
  const [hidden, setHidden] = useState(hiddenNow);
  const [adsenseFailed, setAdsenseFailed] = useState(false);
  const ref = useRef<HTMLElement>(null);

  const allowed = adsAllowed({ surface: "dashboard", format: "native", plan });
  const picked = webNetwork("native");
  const network: AdNetwork | null = !allowed || hidden ? null : picked === "adsense" && !adsenseFailed ? "adsense" : "house";
  const sponsor = targetingFor(program);
  useAdImpression(ref, { network, format: "native", surface: "dashboard", sponsor: network === "house" ? sponsor.id : undefined });
  const onAdsenseError = useCallback(() => setAdsenseFailed(true), []);

  if (!network) return null;

  const hide = () => {
    hideFor30Days();
    track("partner_hidden", { category: categoryForProgram(program) });
    setHidden(true);
  };
  const tag = import.meta.env.VITE_AMAZON_PARTNER_TAG as string | undefined;
  const category = categoryForProgram(program);

  return (
    <aside
      ref={ref}
      aria-label={`${c.partnerTitle} (${c.ad})`}
      className={cn(
        "relative rounded-2xl border border-[#F1E7CF]/45 bg-white/[0.07] p-4 text-white backdrop-blur-md sm:p-5",
        "shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2 pr-8">
        <span className="rounded-full border border-[#F1E7CF]/50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-[#F1E7CF] uppercase">
          {c.ad}
        </span>
        <p className="text-sm font-semibold">{c.partnerTitle}</p>
      </div>
      <button
        type="button"
        onClick={hide}
        className="absolute top-3 right-3 grid size-7 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        aria-label={c.hide}
        title={c.hideTitle}
      >
        <X className="size-4" />
      </button>

      {network === "adsense" && AD_CONFIG.adsenseSlotNative ? (
        <AdSenseUnit slot={AD_CONFIG.adsenseSlotNative} onError={onAdsenseError} className="overflow-hidden rounded-xl" />
      ) : (
        <>
          <SponsorTile s={sponsor} label={sponsor.paid ? c.ad : c.recommendation} onClick={() => trackAd("ad_click", { network: "house", format: "native", surface: "dashboard", sponsor: sponsor.id })} />
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {resourcesFor(category).map((r) => (
              <li key={r.id}>
                <ResourceLink
                  r={r}
                  href={partnerUrl(r, tag)}
                  onClick={() => {
                    track("partner_click", { category, id: r.id });
                    trackAd("ad_click", { network: "house", format: "native", surface: "dashboard", sponsor: r.id });
                  }}
                />
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-white/70">
            {tag ? "Als Amazon-Partner verdient TRED an qualifizierten Verkäufen — für dich ändert sich der Preis nicht. " : ""}
            {c.noDataShared}
          </p>
        </>
      )}
    </aside>
  );
}

/** Le sponsor ciblé par filière — une ligne, pleine largeur. */
export function SponsorTile({ s, label, onClick, large }: { s: SponsorTarget; label: string; onClick: () => void; large?: boolean }) {
  return (
    <a
      href={s.url}
      target="_blank"
      rel={s.paid ? "sponsored noopener noreferrer" : "noopener noreferrer"}
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 rounded-xl border border-[#F1E7CF]/30 bg-[#F1E7CF]/[0.08] p-3 transition-colors hover:border-[#F1E7CF]/60 hover:bg-[#F1E7CF]/[0.12]",
        large && "p-5",
      )}
    >
      <span className={cn("grid shrink-0 place-items-center rounded-lg bg-[#EAB308]/20 text-[#EAB308]", large ? "size-12" : "size-9")}>
        <Sparkles className={large ? "size-6" : "size-4"} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className={cn("font-semibold", large ? "text-base" : "text-sm")}>{s.product}</span>
          <ExternalLink className="size-3 shrink-0 opacity-50 group-hover:opacity-90" aria-hidden />
          <span className="text-[10px] tracking-wide text-[#F1E7CF]/80 uppercase">
            {label} · {s.sponsor}
          </span>
        </span>
        <span className={cn("mt-1 block leading-snug text-white/80", large ? "text-sm" : "text-xs")}>{s.pitch}</span>
      </span>
    </a>
  );
}
