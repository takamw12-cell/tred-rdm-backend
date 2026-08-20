import type Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "../database";
import { userPlan } from "../database/schema";
import type { PlanId } from "./plan";
import { extractId, getStripe, resolveCurrentPeriodEnd, stripeTimestampToDate } from "./stripe";

/**
 * Bindeglied zwischen Stripe und `user_plan`.
 *
 * Bewusst KEINE eigene Abo-Tabelle: `user_plan` trägt bereits `customerId`,
 * `subscriptionId`, `plan` und `validUntil`. Eine zweite Quelle der Wahrheit
 * wäre der sichere Weg zu Konten, die bezahlt haben und trotzdem gesperrt sind.
 *
 * `lib/plan.ts` bleibt die einzige Stelle, die über Zugang entscheidet: es liest
 * `plan` und `validUntil`. Hier wird nur geschrieben.
 */

/**
 * Es gibt genau EINE zahlende Stufe. Der Unterschied zwischen den beiden
 * Preisen ist nur der Abrechnungszeitraum (monatlich vs. halbjährlich), nicht
 * der Leistungsumfang — beide führen deshalb zu `premium`.
 */
export const PRICE_MONTHLY = () => process.env.STRIPE_PRICE_PRO_MONTHLY ?? null;
export const PRICE_SEMESTER = () => process.env.STRIPE_PRICE_PRO_SEMESTER ?? null;

/** Kostenlose Testphase in Tagen. 0 schaltet sie ab. */
export function trialDays(): number {
  const raw = Number(process.env.STRIPE_TRIAL_DAYS ?? 14);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

export function planForPrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  return knownPriceIds().includes(priceId) ? "premium" : null;
}

/** Alle konfigurierten Preis-IDs — der Checkout akzeptiert nur diese. */
export function knownPriceIds(): string[] {
  return [PRICE_MONTHLY(), PRICE_SEMESTER()].filter(
    (value): value is string => !!value,
  );
}

/** Gespeicherter Tarif-Datensatz, oder null. */
export async function getPlanRow(userId: string) {
  const rows = await db
    .select()
    .from(userPlan)
    .where(eq(userPlan.userId, userId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Stripe-Kunde des Nutzers, bei Bedarf angelegt.
 * Idempotent: die einmal gespeicherte customerId wird immer wiederverwendet,
 * sonst entstehen bei jedem Checkout-Versuch neue Kunden im Dashboard.
 */
export async function getOrCreateCustomer(user: {
  id: string;
  email?: string | null;
  name?: string | null;
}): Promise<string> {
  const row = await getPlanRow(user.id);
  if (row?.customerId) return row.customerId;

  const customer = await getStripe().customers.create({
    email: user.email ?? undefined,
    name: user.name ?? undefined,
    metadata: { userId: user.id },
  });

  await db
    .insert(userPlan)
    .values({ userId: user.id, plan: "free", customerId: customer.id })
    .onConflictDoUpdate({
      target: userPlan.userId,
      set: { customerId: customer.id, updatedAt: new Date() },
    });

  return customer.id;
}

/** userId aus Metadaten, sonst über die gespeicherte customerId, sonst über Stripe. */
async function resolveUserId(
  subscription: Stripe.Subscription,
  customerId: string,
): Promise<string | null> {
  const fromMetadata = subscription.metadata?.userId;
  if (fromMetadata) return fromMetadata;

  const rows = await db
    .select({ userId: userPlan.userId })
    .from(userPlan)
    .where(eq(userPlan.customerId, customerId))
    .limit(1);
  if (rows[0]?.userId) return rows[0].userId;

  const customer = await getStripe().customers.retrieve(customerId);
  if (!customer.deleted && customer.metadata?.userId) return customer.metadata.userId;

  return null;
}

/**
 * Schreibt den Zustand einer Stripe-Subscription nach `user_plan`.
 *
 * Zugang hängt an `plan` + `validUntil`. Bei Kündigung setzt Stripe den Status
 * auf `canceled`, `validUntil` bleibt aber das Ende der bezahlten Periode —
 * `getPlan()` stuft danach von selbst auf "free" zurück, ohne dass ein Cronjob
 * nötig wäre.
 */
export async function applySubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId = extractId(subscription.customer);
  if (!customerId) {
    console.error("[billing] subscription without customer", subscription.id);
    return;
  }

  const userId = await resolveUserId(subscription, customerId);
  if (!userId) {
    console.error("[billing] cannot resolve user for customer", customerId);
    return;
  }

  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const mappedPlan = planForPrice(priceId);
  const periodEnd = stripeTimestampToDate(resolveCurrentPeriodEnd(subscription));

  // Nur diese Zustände geben Zugang. `past_due` absichtlich nicht: die Zahlung
  // ist offen, der Zugang läuft trotzdem bis `validUntil` weiter.
  const grantsAccess = subscription.status === "active" || subscription.status === "trialing";

  const existing = await getPlanRow(userId);

  // Gründerkonten werden nie automatisch herabgestuft.
  if (existing?.plan === "founder") {
    await db
      .update(userPlan)
      .set({
        customerId,
        subscriptionId: subscription.id,
        updatedAt: new Date(),
      })
      .where(eq(userPlan.userId, userId));
    console.log(`[billing] founder ${userId}: only linked stripe ids`);
    return;
  }

  const plan: PlanId = grantsAccess && mappedPlan ? mappedPlan : "free";

  if (grantsAccess && !mappedPlan) {
    console.error(
      `[billing] price ${priceId} is not mapped to a plan — check STRIPE_PRICE_* env vars`,
    );
  }

  await db
    .insert(userPlan)
    .values({
      userId,
      plan,
      validUntil: periodEnd,
      customerId,
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
    })
    .onConflictDoUpdate({
      target: userPlan.userId,
      set: {
        plan,
        validUntil: periodEnd,
        customerId,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        updatedAt: new Date(),
      },
    });

  console.log(
    `[billing] user=${userId} plan=${plan} status=${subscription.status} until=${periodEnd?.toISOString() ?? "null"}`,
  );
}

/**
 * Abo endgültig beendet (`customer.subscription.deleted`).
 * `validUntil` wird NICHT angefasst: der Nutzer behält den Zugang bis zum Ende
 * der Periode, die er bezahlt hat. `getPlan()` erledigt den Rest.
 */
export async function endSubscription(subscription: Stripe.Subscription): Promise<void> {
  const customerId = extractId(subscription.customer);
  if (!customerId) return;

  const userId = await resolveUserId(subscription, customerId);
  if (!userId) return;

  const existing = await getPlanRow(userId);
  if (existing?.plan === "founder") return;

  const periodEnd = stripeTimestampToDate(resolveCurrentPeriodEnd(subscription));
  const stillPaid = periodEnd ? periodEnd.getTime() > Date.now() : false;

  await db
    .insert(userPlan)
    .values({
      userId,
      plan: stillPaid ? (existing?.plan ?? "free") : "free",
      validUntil: periodEnd,
      customerId,
      subscriptionId: null,
      subscriptionStatus: subscription.status,
    })
    .onConflictDoUpdate({
      target: userPlan.userId,
      set: {
        plan: stillPaid ? (existing?.plan ?? "free") : "free",
        validUntil: periodEnd,
        subscriptionId: null,
        subscriptionStatus: subscription.status,
        updatedAt: new Date(),
      },
    });

  console.log(`[billing] user=${userId} subscription ended, access until ${periodEnd?.toISOString() ?? "now"}`);
}
