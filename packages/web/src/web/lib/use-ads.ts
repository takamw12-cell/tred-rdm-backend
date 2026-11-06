import { useEffect, useRef, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { creditsMeOptions } from "@/queries/credits";
import { useLocaleStore } from "@/stores/locale";
import { adCopy } from "./ad-copy";
import { trackAd } from "./ad-runtime";
import type { AdFormat, AdNetwork, AdSurface } from "./ad-mediation";

/**
 * Le tarif de l'étudiant, pour la règle d'or. `null` tant qu'il n'est pas
 * chargé — et `adsAllowed(null)` vaut false : aucun abonné ne voit de pub
 * pendant le premier rendu.
 */
export function useAdPlan(): string | null {
  const { data } = useQuery({ ...creditsMeOptions(), staleTime: 60_000 });
  return data?.plan ?? null;
}

export function useAdCopy() {
  return adCopy(useLocaleStore((s) => s.locale));
}

/**
 * ad_impression quand l'encart est visible à 50 % pendant 1 s (norme
 * IAB/MRC pour le display). Une seule fois par montage.
 */
export function useAdImpression(
  ref: RefObject<HTMLElement | null>,
  p: { network: AdNetwork | null; format: AdFormat; surface: AdSurface; sponsor?: string },
) {
  const sent = useRef(false);
  const { network, format, surface, sponsor } = p;
  useEffect(() => {
    const el = ref.current;
    if (!el || !network || sent.current || typeof IntersectionObserver === "undefined") return;
    const timer = { id: 0 };
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          timer.id = window.setTimeout(() => {
            if (sent.current) return;
            sent.current = true;
            trackAd("ad_impression", { network, format, surface, sponsor });
            io.disconnect();
          }, 1000);
        } else window.clearTimeout(timer.id);
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => {
      window.clearTimeout(timer.id);
      io.disconnect();
    };
  }, [ref, network, format, surface, sponsor]);
}
