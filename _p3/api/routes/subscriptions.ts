import { z } from "zod";
import { ORPCError } from "@orpc/server";
import type Stripe from "stripe";

import { authed } from "../middleware/auth";
import {
  getOrCreateCustomer,
  getPlanRow,
  knownPriceIds,
  PRICE_MONTHLY,
  PRICE_SEMESTER,
  trialDays,
} from "../lib/billing";
import { getStripe } from "../lib/stripe";
import { getOutputTokens, getPlan, getUsage, LIMITS, OUTPUT_TOKEN_CAP } from "../lib/plan";

/**
 * Tarif-Prozeduren (oRPC, erreichbar unter /api/rpc/subscriptions.*).
 *
 * Der Stripe-Webhook liegt NICHT hier, sondern als schlichte Hono-Route in
 * src/api/index.ts: die Signaturprüfung braucht den unveränderten Rohkörper,
 * den ein RPC-Handler bereits geparst hätte.
 */

export type Interval = "monthly" | "semester";

export interface PlanOffer {
  interval: Interval;
  priceId: string;
  /** In Cent, wie Stripe es liefert. */
  amount: number;
  currency: string;
  /** Auf einen Monat heruntergerechnet, für den Vergleich. */
  amountPerMonth: number;
  months: number;
  name: string;
  description: string | null;
}

/* -------------------------------------------------------------------------- */
/* Preise kommen aus Stripe, nicht aus dem Code                               */
/* -------------------------------------------------------------------------- */
/*
 * Der angezeigte Betrag wird bei Stripe gelesen. Vorher stand er in den
 * Übersetzungsdateien — also an einer zweiten Stelle, die niemand mitpflegt.
 * Genau daraus entsteht der schlimmste Fehler eines Bezahlsystems: die Karte
 * zeigt 9,99 €, die Kasse bucht 14,99 €. Jetzt gibt es nur noch eine Wahrheit.
 *
 * Gecacht, weil diese Seite oft geöffnet wird und Preise sich selten ändern.
 * Nach einer Preisänderung in Stripe dauert es höchstens fünf Minuten.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { at: number; offers: PlanOffer[] } | null = null;

function monthsForPrice(price: Stripe.Price): number {
  const r = price.recurring;
  if (!r) return 1;
  const count = r.interval_count ?? 1;
  if (r.interval === "year") return 12 * count;
  if (r.interval === "month") return count;
  if (r.interval === "week") return Math.max(1, Math.round((count * 7) / 30));
  return Math.max(1, Math.round(count / 30));
}

async function loadOffers(): Promise<PlanOffer[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.offers;

  const wanted: Array<{ interval: Interval; id: string | null }> = [
    { interval: "monthly", id: PRICE_MONTHLY() },
    { interval: "semester", id: PRICE_SEMESTER() },
  ];

  const stripe = getStripe();
  const offers: PlanOffer[] = [];

  for (const entry of wanted) {
    if (!entry.id) continue;
    try {
      const price = await stripe.prices.retrieve(entry.id, { expand: ["product"] });
      const product = price.product as Stripe.Product | Stripe.DeletedProduct;
      const months = monthsForPrice(price);
      const amount = price.unit_amount ?? 0;

      offers.push({
        interval: entry.interval,
        priceId: price.id,
        amount,
        currency: (price.currency ?? "eur").toUpperCase(),
        amountPerMonth: Math.round(amount / months),
        months,
        name: "deleted" in product && product.deleted ? "TRED" : (product as Stripe.Product).name,
        description:
          "deleted" in product && product.deleted
            ? null
            : ((product as Stripe.Product).description ?? null),
      });
    } catch (error) {
      // Ein unlesbarer Preis darf die Seite nicht leeren: die andere Formel
      // bleibt kaufbar, und der Fehler steht im Log.
      console.error(`[subscriptions] price ${entry.id} not readable`, error);
    }
  }

  cache = { at: Date.now(), offers };
  return offers;
}

export const subscriptions = {
  /**
   * Alles, was die Tarifseite braucht: aktueller Tarif, Limits, Verbrauch und
   * die bei Stripe hinterlegten Formeln. Eine Runde statt drei.
   */
  me: authed.handler(async ({ context }) => {
    const [plan, usage, row, tokensUsed, offers] = await Promise.all([
      getPlan(context.user.id),
      getUsage(context.user.id),
      getPlanRow(context.user.id),
      getOutputTokens(context.user.id).catch(() => 0),
      loadOffers().catch((error) => {
        console.error("[subscriptions] loadOffers failed", error);
        return [] as PlanOffer[];
      }),
    ]);

    const limits = LIMITS[plan];

    return {
      plan,
      limits,
      usage,
      tokens: { used: tokensUsed, cap: OUTPUT_TOKEN_CAP },
      validUntil: row?.validUntil ?? null,
      manageable: !!row?.customerId,
      configured: knownPriceIds().length > 0,
      offers,
      /** 0 = keine Testphase. Nur für Erstabonnenten (siehe createCheckout). */
      trialDays: trialDays(),
      /** Hatte dieses Konto schon einmal ein Abo? Dann gibt es keine Testphase mehr. */
      trialUsed: !!row?.subscriptionId || plan !== "free",
    };
  }),

  /** Startet den Bezahlvorgang und liefert die URL, die der Client öffnet. */
  createCheckout: authed
    .input(
      z.object({
        priceId: z.string().min(1),
        successUrl: z.string().url().optional(),
        cancelUrl: z.string().url().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      // Nur konfigurierte Preise akzeptieren. Ohne diese Prüfung könnte ein
      // Client eine beliebige (auch 0-Euro-) Preis-ID unterschieben.
      const allowed = knownPriceIds();
      if (allowed.length === 0) {
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "Zahlungen sind noch nicht konfiguriert.",
        });
      }
      if (!allowed.includes(input.priceId)) {
        throw new ORPCError("BAD_REQUEST", { message: "Unbekannte Preis-ID." });
      }

      const appUrl = process.env.WEBSITE_URL ?? "";

      try {
        const existing = await getPlanRow(context.user.id);
        const customerId = await getOrCreateCustomer(context.user);

        // Testphase nur beim ERSTEN Abo. Sonst genügt kündigen und neu
        // abschließen, um dauerhaft gratis zu bleiben.
        const days = trialDays();
        const eligibleForTrial = days > 0 && !existing?.subscriptionId;

        const session = await getStripe().checkout.sessions.create({
          mode: "subscription",
          customer: customerId,
          line_items: [{ price: input.priceId, quantity: 1 }],
          client_reference_id: context.user.id,
          metadata: { userId: context.user.id },
          subscription_data: {
            // Ohne diese Metadaten kann der Webhook die Subscription keinem
            // Konto zuordnen, wenn der Kunde noch nicht in user_plan steht.
            metadata: { userId: context.user.id },
            ...(eligibleForTrial ? { trial_period_days: days } : {}),
          },
          allow_promotion_codes: true,
          success_url: input.successUrl ?? `${appUrl}/pricing?checkout=success`,
          cancel_url: input.cancelUrl ?? `${appUrl}/pricing?checkout=cancel`,
        });

        if (!session.url) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Stripe hat keine Checkout-URL geliefert.",
          });
        }

        return { url: session.url, sessionId: session.id };
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        console.error("[subscriptions] createCheckout failed", error);
        throw new ORPCError("BAD_GATEWAY", {
          message: "Der Bezahlvorgang konnte nicht gestartet werden.",
        });
      }
    }),

  /** Stripe-Kundenportal: Karte ändern, Rechnungen, Kündigung. */
  portal: authed
    .input(z.object({ returnUrl: z.string().url().optional() }).optional())
    .handler(async ({ input, context }) => {
      const row = await getPlanRow(context.user.id);
      if (!row?.customerId) {
        throw new ORPCError("NOT_FOUND", { message: "Kein Stripe-Kunde für dieses Konto." });
      }

      try {
        const portal = await getStripe().billingPortal.sessions.create({
          customer: row.customerId,
          return_url: input?.returnUrl ?? `${process.env.WEBSITE_URL ?? ""}/pricing`,
        });
        return { url: portal.url };
      } catch (error) {
        console.error("[subscriptions] portal failed", error);
        throw new ORPCError("BAD_GATEWAY", { message: "Kundenportal nicht erreichbar." });
      }
    }),
};
