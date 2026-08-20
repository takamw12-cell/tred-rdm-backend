import Stripe from "stripe";

/**
 * Client Stripe partagé.
 *
 * On n'épingle PAS `apiVersion` ici : le SDK utilise alors la version d'API
 * configurée sur ton compte (Dashboard > Workbench). Si tu veux l'épingler,
 * la valeur DOIT correspondre au literal type du SDK installé, sinon TS casse
 * à chaque bump de `stripe`.
 */
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("[stripe] STRIPE_SECRET_KEY manquant dans l'environnement");
  }

  _stripe = new Stripe(secretKey, {
    // Railway = Node, mais on garde fetch pour rester portable (edge/workers).
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    appInfo: { name: "TRED", version: "1.0.0" },
  });

  return _stripe;
}

/**
 * Depuis l'API Stripe `2025-06-30.basil`, `current_period_end` n'est PLUS sur
 * l'objet Subscription : il vit sur chaque subscription item (pour supporter
 * les abonnements à cadences mixtes). Ce helper lit les deux emplacements pour
 * que le code marche quelle que soit la version d'API du compte.
 *
 * Retourne un timestamp UNIX en secondes, ou null si introuvable.
 */
export function resolveCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  // Nouvelle position (Basil+) : on prend la période qui se termine le plus tard.
  const itemPeriods = (subscription.items?.data ?? [])
    .map((item) => (item as unknown as { current_period_end?: number }).current_period_end)
    .filter((value): value is number => typeof value === "number");

  if (itemPeriods.length > 0) {
    return Math.max(...itemPeriods);
  }

  // Ancienne position (pré-Basil).
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return typeof legacy === "number" ? legacy : null;
}

/** Convertit un timestamp Stripe (secondes) en Date pour Drizzle `mode: "timestamp"`. */
export function stripeTimestampToDate(seconds: number | null | undefined): Date | null {
  return typeof seconds === "number" ? new Date(seconds * 1000) : null;
}

/** Extrait un id depuis un champ Stripe qui peut être `string | { id } | null`. */
export function extractId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
