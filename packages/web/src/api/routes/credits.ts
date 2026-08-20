import { z } from "zod";
import { ORPCError } from "@orpc/server";
import type Stripe from "stripe";

import { authed } from "../middleware/auth";
import { getPurchasedCredits, listTransactions } from "../lib/credits";
import { getOrCreateCustomer } from "../lib/billing";
import { getStripe } from "../lib/stripe";
import { getPlan, getUsage, LIMITS } from "../lib/plan";

/**
 * Credits (oRPC, erreichbar unter /api/rpc/credits.*).
 *
 * Zwei Guthaben, bewusst getrennt gehalten:
 *   • Monatskontingent — verfällt, setzt sich über den Periodenschlüssel selbst
 *     zurück (lib/plan.ts).
 *   • Gekaufte Credits — verfallen nie (lib/credits.ts).
 *
 * Die Gutschrift nach einer Zahlung passiert NICHT hier, sondern im
 * Stripe-Webhook in src/api/index.ts. Grund: nur Stripe weiß verlässlich, ob
 * ein Zahlungsvorgang wirklich abgeschlossen wurde. Ein Client, der nach der
 * Rückkehr "ich habe bezahlt" behauptet, ist keine Grundlage für eine
 * Gutschrift.
 */

export interface CreditPack {
  priceId: string;
  credits: number;
  amount: number;
  currency: string;
  name: string;
  /** Preis je Credit in Cent — macht Pakete vergleichbar. */
  pricePerCredit: number;
}

/** Konfigurierte Credit-Pakete. Die Anzahl steht in den Stripe-Metadaten. */
function packPriceIds(): string[] {
  return [
    process.env.STRIPE_PRICE_CREDITS_SMALL,
    process.env.STRIPE_PRICE_CREDITS_MEDIUM,
    process.env.STRIPE_PRICE_CREDITS_LARGE,
  ].filter((v): v is string => !!v);
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let packCache: { at: number; packs: CreditPack[] } | null = null;

/**
 * Lädt die Pakete bei Stripe. Die Anzahl der Credits steht als Metadatum
 * `credits` am Preis — damit gibt es genau EINE Stelle, an der ein Paket
 * definiert wird. Ein Paket ohne dieses Metadatum wird ausgelassen statt
 * geraten: lieber ein fehlendes Angebot als eine falsche Gutschrift.
 */
async function loadPacks(): Promise<CreditPack[]> {
  if (packCache && Date.now() - packCache.at < CACHE_TTL_MS) return packCache.packs;

  const stripe = getStripe();
  const packs: CreditPack[] = [];

  for (const id of packPriceIds()) {
    try {
      const price = await stripe.prices.retrieve(id, { expand: ["product"] });
      const credits = Number(price.metadata?.credits ?? 0);

      if (!Number.isFinite(credits) || credits <= 0) {
        console.error(
          `[credits] price ${id} has no usable metadata "credits" — pack skipped`,
        );
        continue;
      }

      const product = price.product as Stripe.Product | Stripe.DeletedProduct;
      const amount = price.unit_amount ?? 0;

      packs.push({
        priceId: price.id,
        credits,
        amount,
        currency: (price.currency ?? "eur").toUpperCase(),
        name:
          "deleted" in product && product.deleted
            ? `${credits} Credits`
            : (product as Stripe.Product).name,
        pricePerCredit: Math.round(amount / credits),
      });
    } catch (error) {
      console.error(`[credits] pack ${id} not readable`, error);
    }
  }

  packs.sort((a, b) => a.credits - b.credits);
  packCache = { at: Date.now(), packs };
  return packs;
}

export const credits = {
  /** Beide Guthaben plus die kaufbaren Pakete — eine Runde für das Widget. */
  me: authed.handler(async ({ context }) => {
    const [plan, usage, purchased, packs] = await Promise.all([
      getPlan(context.user.id),
      getUsage(context.user.id),
      getPurchasedCredits(context.user.id),
      loadPacks().catch(() => [] as CreditPack[]),
    ]);

    const limits = LIMITS[plan];
    const monthlyRemaining = Math.max(0, limits.chat - (usage.chat ?? 0));

    return {
      plan,
      /** Verbleibendes Monatskontingent für den Chat. Verfällt am Monatsende. */
      monthlyRemaining,
      monthlyLimit: limits.chat,
      /** Gekaufte Credits. Verfallen nie. */
      purchasedCredits: purchased,
      /** Was das Abzeichen anzeigt: die Summe. */
      total: monthlyRemaining + purchased,
      /** Ab hier färbt sich das Abzeichen — siehe Widget. */
      lowThreshold: 5,
      packs,
    };
  }),

  /** Historie für die Seite "Mein Credit-Verlauf". */
  transactions: authed
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .handler(async ({ input, context }) => {
      return listTransactions(context.user.id, input?.limit ?? 50);
    }),

  /**
   * Startet den Kauf eines Credit-Pakets.
   *
   * `mode`:
   *   • "checkout"     — eine frische Stripe-Checkout-Session (Standard).
   *   • "payment_link" — ein im Dashboard vorbereiteter Payment Link. Die
   *     userId reist als `client_reference_id` mit; ohne sie könnte der Webhook
   *     die Zahlung keinem Konto zuordnen und die Credits landeten nirgends.
   */
  purchase: authed
    .input(
      z.object({
        priceId: z.string().min(1),
        mode: z.enum(["checkout", "payment_link"]).optional(),
        successUrl: z.string().url().optional(),
        cancelUrl: z.string().url().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const packs = await loadPacks();
      const pack = packs.find((p) => p.priceId === input.priceId);

      // Nur konfigurierte Pakete. Ohne diese Prüfung könnte ein Client eine
      // beliebige Preis-ID unterschieben — etwa eine zu 0 €.
      if (!pack) {
        throw new ORPCError("BAD_REQUEST", { message: "Unbekanntes Credit-Paket." });
      }

      const appUrl = process.env.WEBSITE_URL ?? "";

      if ((input.mode ?? "checkout") === "payment_link") {
        const link = process.env.STRIPE_PAYMENT_LINK_CREDITS;
        if (!link) {
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message: "Kein Payment Link konfiguriert (STRIPE_PAYMENT_LINK_CREDITS).",
          });
        }
        const url = new URL(link);
        url.searchParams.set("client_reference_id", context.user.id);
        return { url: url.toString(), mode: "payment_link" as const, credits: pack.credits };
      }

      try {
        const customerId = await getOrCreateCustomer(context.user);

        const session = await getStripe().checkout.sessions.create({
          // Einmalzahlung, KEIN Abo: Credits laufen nicht monatlich weiter.
          mode: "payment",
          customer: customerId,
          line_items: [{ price: input.priceId, quantity: 1 }],
          client_reference_id: context.user.id,
          // Der Webhook liest genau diese Felder. Die Anzahl wird HIER
          // festgeschrieben, nicht später neu ermittelt: ändert sich das Paket
          // in Stripe zwischen Kauf und Webhook, bekommt der Nutzer trotzdem
          // exakt das, was er gesehen und bezahlt hat.
          metadata: {
            userId: context.user.id,
            credits: String(pack.credits),
            packName: pack.name,
          },
          // ── Umsatzsteuer ────────────────────────────────────────────
          // Bei digitalen Leistungen an Verbraucher im EU-Ausland gilt der
          // Steuersatz des KÄUFERLANDES (OSS). Stripe Tax ermittelt ihn aus
          // der Adresse — deshalb muss sie erhoben und am Kunden gespeichert
          // werden, sonst fällt die Berechnung auf das Händlerland zurück und
          // die Meldung stimmt nicht.
          //
          // Kleinunternehmer nach § 19 UStG: Stripe Tax im Dashboard
          // deaktiviert lassen, dann bleibt automatic_tax wirkungslos.
          automatic_tax: { enabled: true },
          billing_address_collection: "required",
          customer_update: { address: "auto", name: "auto" },
          tax_id_collection: { enabled: true },
          success_url: input.successUrl ?? `${appUrl}/credits?purchase=success`,
          cancel_url: input.cancelUrl ?? `${appUrl}/credits?purchase=cancel`,
        });

        if (!session.url) {
          throw new ORPCError("INTERNAL_SERVER_ERROR", {
            message: "Stripe hat keine Checkout-URL geliefert.",
          });
        }

        return { url: session.url, mode: "checkout" as const, credits: pack.credits };
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        console.error("[credits] purchase failed", error);
        throw new ORPCError("BAD_GATEWAY", {
          message: "Der Kauf konnte nicht gestartet werden.",
        });
      }
    }),
};
