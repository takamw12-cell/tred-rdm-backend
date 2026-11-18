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
import { betaFree, CREDIT_COST, CREDIT_GRANTS, getOutputTokens, getPlan, getUsage, LIMITS, OUTPUT_TOKEN_CAP, PRICING, UNLIMITED_PLANS } from "../lib/plan";
import { readTrial, type TrialDb } from "../lib/trial";
import { PASSES, PASS_KINDS, PASS_STATUS, passPriceId, type PassKind } from "../lib/passes";
import { safeReturnUrl } from "../lib/return-url";
import { db } from "../database";

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
  // Stripe pas encore configuré : aucune offre à lire, et rien à écrire dans
  // les logs à chaque ouverture de /pricing (la page affiche alors la grille).
  if (!process.env.STRIPE_SECRET_KEY) return [];

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

      // La grille décidée (lib/plan.ts) fait référence. Un prix Stripe qui
      // s'en écarte est affiché tel qu'il sera encaissé, mais signalé.
      const attendu = PRICING[entry.interval];
      if (amount !== attendu.amount || months !== attendu.months) {
        console.error(
          `[subscriptions] le prix Stripe ${entry.interval} (${amount} ct / ${months} mois) ne correspond pas à la grille (${attendu.amount} ct / ${attendu.months} mois)`,
        );
      }

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

export interface PassOffer {
  kind: PassKind;
  amount: number;
  currency: string;
  days: number;
  months: number;
  available: boolean;
}

let passCache: { at: number; passes: PassOffer[] } | null = null;

/** Les deux Pass, avec le montant lu chez Stripe quand le prix est configuré. Ne lève jamais. */
async function loadPasses(): Promise<PassOffer[]> {
  if (passCache && Date.now() - passCache.at < CACHE_TTL_MS) return passCache.passes;
  const passes: PassOffer[] = [];
  for (const kind of PASS_KINDS) {
    const grid = PASSES[kind];
    const priceId = passPriceId(kind);
    const offer: PassOffer = { kind, amount: grid.amount, currency: PRICING.currency, days: grid.days, months: grid.months, available: false };
    if (priceId && process.env.STRIPE_SECRET_KEY) {
      try {
        const price = await getStripe().prices.retrieve(priceId);
        // Un Pass est un paiement unique : un prix récurrent posé ici par erreur n'est pas vendu.
        if (price.recurring) {
          console.error(`[subscriptions] ${grid.env} désigne un prix RÉCURRENT : le ${grid.label} doit être un paiement unique`);
        } else {
          offer.amount = price.unit_amount ?? grid.amount;
          offer.currency = (price.currency ?? "eur").toUpperCase();
          offer.available = true;
          if (offer.amount !== grid.amount) console.error(`[subscriptions] le prix Stripe du ${grid.label} (${offer.amount} ct) ne correspond pas à la grille (${grid.amount} ct)`);
        }
      } catch (error) {
        console.error(`[subscriptions] ${grid.env} illisible`, error instanceof Error ? error.message.slice(0, 200) : error);
      }
    }
    passes.push(offer);
  }
  passCache = { at: Date.now(), passes };
  return passes;
}

export const subscriptions = {
  /**
   * Alles, was die Tarifseite braucht: aktueller Tarif, Limits, Verbrauch und
   * die bei Stripe hinterlegten Formeln. Eine Runde statt drei.
   */
  me: authed.handler(async ({ context }) => {
    const [plan, usage, row, trial, tokensUsed, offers, passes] = await Promise.all([
      getPlan(context.user.id),
      getUsage(context.user.id),
      getPlanRow(context.user.id),
      readTrial(db as unknown as TrialDb, context.user.id).catch(() => null),
      getOutputTokens(context.user.id).catch(() => 0),
      loadOffers().catch((error) => {
        console.error("[subscriptions] loadOffers failed", error);
        return [] as PlanOffer[];
      }),
      loadPasses(),
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
      /** Essai côté Stripe (désactivé par défaut, voir lib/billing.ts). */
      trialDays: trialDays(),
      trialUsed: !!row?.subscriptionId || plan !== "free",
      /**
       * L'essai de 14 jours géré par l'app (lib/trial.ts).
       * `active` : bandeau « il te reste X jours ». `available` : le bouton
       * « commencer l'essai » — jamais pour un abonné, il n'en a pas besoin.
       */
      trial: {
        days: PRICING.trialDays,
        active: plan === "trial",
        daysLeft: plan === "trial" ? (trial?.daysLeft ?? 0) : 0,
        endsAt: trial?.endsAt ?? null,
        // Modèle « stock de crédits » : l'essai illimité n'est plus proposé (10 crédits à l'inscription à la place).
        available: false,
      },
      /** Mode bêta gratuit : aucun paiement, aucun essai, bandeau sur /pricing. */
      beta: betaFree(),
      /** Compteurs présentés comme illimités (essai). */
      unlimited: UNLIMITED_PLANS.has(plan),
      /** La grille de référence, pour afficher les prix même sans Stripe. */
      pricing: PRICING,
      /** Ce que chaque offre donne en crédits (modèle « stock », 18 nov. 2026). */
      creditGrants: CREDIT_GRANTS,
      /**
       * Les Pass (paiement unique). `available` : le prix Stripe est configuré.
       * Le montant affiché est celui de Stripe quand il est lisible, sinon la grille.
       */
      passes,
      /**
       * Un VRAI abonnement Stripe en cours : seul cas où « Abo verwalten » (portail
       * client) a un sens. Un Pass, le fondateur ou un compte sans client Stripe : non.
       */
      subscriptionActive: !!row?.customerId && !!row?.subscriptionId && row.subscriptionStatus !== PASS_STATUS && ["active", "trialing", "past_due"].includes(row.subscriptionStatus ?? ""),
      /** L'accès actuel vient d'un Pass : pas d'abonnement à gérer, il s'arrête tout seul. */
      passActive: row?.subscriptionStatus === PASS_STATUS && plan === "premium",
      limitsByPlan: { free: LIMITS.free, student: LIMITS.premium },
      creditCost: CREDIT_COST,
    };
  }),

  /**
   * Lance l'essai de 14 jours : sans carte, une seule fois par compte.
   * Un abonné n'en a pas besoin ; un compte qui l'a déjà eu reçoit
   * `started: false` et l'état réel.
   */
  startTrial: authed.handler(async (): Promise<{ started: boolean; active: boolean; daysLeft: number; endsAt: number | null }> => {
    // Bêta gratuite : l'essai est gardé intact pour le lancement officiel.
    if (betaFree()) throw new ORPCError("FORBIDDEN", { message: "beta_free" });
    // Modèle « stock de crédits » (18 nov. 2026) : plus d'essai illimité, même par appel direct.
    throw new ORPCError("FORBIDDEN", { message: "trial_retired" });
  }),

  /** Startet den Bezahlvorgang und liefert die URL, die der Client öffnet. */
  createCheckout: authed
    .input(
      z.object({
        priceId: z.string().max(128).min(1),
        successUrl: z.string().max(2000).optional(),
        cancelUrl: z.string().max(2000).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      // Bêta gratuite : aucun abonnement ne peut démarrer, même par appel direct.
      if (betaFree()) throw new ORPCError("FORBIDDEN", { message: "beta_free" });
      // Ohne Schlüssel würde getStripe() werfen und der catch unten daraus
      // ein 502 machen. 503 sagt ehrlich: noch nicht konfiguriert.
      if (!process.env.STRIPE_SECRET_KEY) {
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message: "Zahlungen sind noch nicht konfiguriert.",
        });
      }

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
          allow_promotion_codes: true,
          // Adresse de retour : seulement chez nous, sinon celle par défaut (lib/return-url.ts).
          success_url: safeReturnUrl(input.successUrl, `${appUrl}/pricing?checkout=success`),
          cancel_url: safeReturnUrl(input.cancelUrl, `${appUrl}/pricing?checkout=cancel`),
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

  /**
   * Klausur-Pass / Semester-Pass : un paiement UNIQUE (lib/passes.ts). Le
   * client ne choisit que le type de Pass ; le prix est celui que le serveur
   * connaît, et l'accès n'est ouvert que par le webhook, une fois encaissé.
   */
  createPassCheckout: authed
    .input(
      z.object({
        pass: z.enum(["klausur", "semester"]),
        successUrl: z.string().max(2000).optional(),
        cancelUrl: z.string().max(2000).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (betaFree()) throw new ORPCError("FORBIDDEN", { message: "beta_free" });
      const priceId = passPriceId(input.pass);
      if (!process.env.STRIPE_SECRET_KEY || !priceId) {
        throw new ORPCError("SERVICE_UNAVAILABLE", { message: "Zahlungen sind noch nicht konfiguriert." });
      }
      const existing = await getPlanRow(context.user.id);
      // Un abonnement en cours se prolonge tout seul : lui vendre un Pass par-dessus ferait payer deux fois.
      if (existing?.subscriptionId && existing.subscriptionStatus !== PASS_STATUS && ["active", "trialing", "past_due"].includes(existing.subscriptionStatus ?? "")) {
        throw new ORPCError("BAD_REQUEST", { message: "already_subscribed" });
      }

      const appUrl = process.env.WEBSITE_URL ?? "";
      try {
        const customerId = await getOrCreateCustomer(context.user);
        const session = await getStripe().checkout.sessions.create({
          // Paiement unique, AUCUN abonnement : rien ne se renouvelle.
          mode: "payment",
          customer: customerId,
          line_items: [{ price: priceId, quantity: 1 }],
          client_reference_id: context.user.id,
          // Le webhook lit ces deux champs pour savoir quoi ouvrir, et à qui.
          metadata: { userId: context.user.id, pass: input.pass },
          automatic_tax: { enabled: true },
          billing_address_collection: "required",
          customer_update: { address: "auto", name: "auto" },
          tax_id_collection: { enabled: true },
          allow_promotion_codes: true,
          success_url: safeReturnUrl(input.successUrl, `${appUrl}/pricing?checkout=success`),
          cancel_url: safeReturnUrl(input.cancelUrl, `${appUrl}/pricing?checkout=cancel`),
        });
        if (!session.url) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "Stripe hat keine Checkout-URL geliefert." });
        return { url: session.url, sessionId: session.id };
      } catch (error) {
        if (error instanceof ORPCError) throw error;
        console.error("[subscriptions] createPassCheckout failed", error);
        throw new ORPCError("BAD_GATEWAY", { message: "Der Bezahlvorgang konnte nicht gestartet werden." });
      }
    }),

  /** Stripe-Kundenportal: Karte ändern, Rechnungen, Kündigung. */
  portal: authed
    .input(z.object({ returnUrl: z.string().max(2000).optional() }).optional())
    .handler(async ({ input, context }) => {
      const row = await getPlanRow(context.user.id);
      if (!row?.customerId) {
        throw new ORPCError("NOT_FOUND", { message: "Kein Stripe-Kunde für dieses Konto." });
      }

      try {
        const portal = await getStripe().billingPortal.sessions.create({
          customer: row.customerId,
          return_url: safeReturnUrl(input?.returnUrl, `${process.env.WEBSITE_URL ?? ""}/pricing`),
        });
        return { url: portal.url };
      } catch (error) {
        console.error("[subscriptions] portal failed", error);
        throw new ORPCError("BAD_GATEWAY", { message: "Kundenportal nicht erreichbar." });
      }
    }),
};
