import { useEffect, useRef } from "react";
import { AD_CONFIG, fillAdSenseSlot, loadAdSense } from "@/lib/ad-runtime";
import { cn } from "@/lib/utils";

/**
 * Un bloc AdSense. Le script n'est chargé qu'au montage de ce composant —
 * donc uniquement sur une surface publicitaire autorisée. `onError` permet
 * au parent de retomber sur la ressource maison (bloqueur de pub, réseau).
 */
export function AdSenseUnit({
  slot,
  className,
  onError,
}: {
  slot: string;
  className?: string;
  onError?: () => void;
}) {
  const ref = useRef<HTMLModElement>(null);

  useEffect(() => {
    const ctl = new AbortController();
    loadAdSense()
      .then(() => {
        // Un bloc déjà rempli (re-montage rapide) ne se redemande pas.
        if (!ctl.signal.aborted && ref.current && !ref.current.getAttribute("data-adsbygoogle-status")) fillAdSenseSlot();
      })
      .catch(() => {
        if (!ctl.signal.aborted) onError?.();
      });
    return () => ctl.abort();
  }, [slot, onError]);

  return (
    <ins
      ref={ref}
      className={cn("adsbygoogle block min-h-[90px]", className)}
      style={{ display: "block" }}
      data-ad-client={AD_CONFIG.adsenseClient}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  );
}
