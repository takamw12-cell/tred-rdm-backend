import { useQueryClient } from "@tanstack/react-query";
import { SmartPaywallModal } from "@/components/SmartPaywallModal";
import { creditsMeKey } from "@/queries/credits";
import { usePaywallStore } from "@/stores/paywall";

/**
 * L'unique fenêtre de limite de l'app, hors du chat (qui garde la sienne,
 * liée à la question à relancer). Monté une fois dans le layout ; ouvert par
 * `paywallFromResponse` (lib/paywall.ts) sur tout 402.
 */
export function PaywallHost() {
  const qc = useQueryClient();
  const info = usePaywallStore((s) => s.info);
  const retry = usePaywallStore((s) => s.retry);
  const hide = usePaywallStore((s) => s.hide);

  return (
    <SmartPaywallModal
      open={info !== null}
      onClose={hide}
      offer={info?.rewardedAd ?? null}
      metric={info?.metric}
      used={info?.used}
      limit={info?.limit}
      onUnlocked={() => {
        void qc.invalidateQueries({ queryKey: creditsMeKey() });
        hide();
        retry?.();
      }}
    />
  );
}
