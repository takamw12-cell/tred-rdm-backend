import { usePaywallStore, type PaywallInfo } from "@/stores/paywall";
import type { PaywallMetric } from "@/lib/pricing-copy";

const METRICS: PaywallMetric[] = ["chat", "exercise", "video", "formulas", "documents"];

/**
 * Lit le corps d'un 402 du serveur (api/lib/plan.ts, `quotaError`).
 * `fallback` : le compteur de la surface appelante, si le serveur ne le dit
 * pas (plafond de tokens, ancien serveur). Pure (testée).
 */
export function readPaywallBody(body: unknown, fallback: PaywallMetric): PaywallInfo {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const metric = METRICS.includes(b.metric as PaywallMetric) ? (b.metric as PaywallMetric) : fallback;
  const ad = b.rewardedAd as { seconds?: unknown; credits?: unknown } | null | undefined;
  return {
    metric,
    plan: typeof b.plan === "string" ? b.plan : undefined,
    used: typeof b.used === "number" ? b.used : undefined,
    limit: typeof b.limit === "number" ? b.limit : undefined,
    creditCost: typeof b.creditCost === "number" ? b.creditCost : null,
    rewardedAd: ad && typeof ad.seconds === "number" && typeof ad.credits === "number" ? { seconds: ad.seconds, credits: ad.credits } : null,
  };
}

/**
 * À appeler sur toute réponse `fetch` d'une action facturable. Si c'est un
 * 402, ouvre la fenêtre de limite et renvoie true : l'appelant n'affiche
 * alors pas son message d'erreur générique.
 */
export async function paywallFromResponse(res: Response, fallback: PaywallMetric, retry?: () => void): Promise<boolean> {
  if (res.status !== 402) return false;
  const body = await res.clone().json().catch(() => ({}));
  usePaywallStore.getState().show(readPaywallBody(body, fallback), retry);
  return true;
}
