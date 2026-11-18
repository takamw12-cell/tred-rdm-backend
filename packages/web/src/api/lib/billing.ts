import type Stripe from "stripe";
import { eq } from "drizzle-orm";

import { db } from "../database";
import { userPlan } from "../database/schema";
import { CREDIT_GRANTS, type PlanId } from "./plan";
import { grantCredits } from "./credits";
import { extractId, getStripe, resolveCurrentPeriodEnd, stripeTimestampToDate } from "./stripe";
import { creditTransaction, userAccess } from "../database/schema";
import { user } from "../database/auth-schema";
import { withDbRetry } from "./db-retry";
import { mailLang, paymentFailedMail, sendMail } from "./mail";
import { PASSES, PASS_STATUS, passValidUntil, type PassKind } from "./passes";

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

/**
 * Essai côté STRIPE (carte exigée), en jours. Désactivé par défaut depuis le
 * 12 nov. 2026 : l'essai de 14 jours est désormais géré par l'app, sans carte
 * (lib/trial.ts). Garder les deux offrirait 28 jours. STRIPE_TRIAL_DAYS ne
 * sert plus qu'à rouvrir volontairement l'essai Stripe.
 */
export function trialDays(): number {
  const raw = Number(process.env.STRIPE_TRIAL_DAYS ?? 0);
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

  // Un abonnement qui ne donne plus accès ne doit pas effacer un Pass payé et
  // encore valable : on ne fait alors que noter l'état de l'abonnement.
  if (!grantsAccess && passStillValid(existing)) {
    await db.update(userPlan).set({ customerId, updatedAt: new Date() }).where(eq(userPlan.userId, userId));
    console.log(`[billing] user=${userId} abonnement ${subscription.status}, Pass conservé`);
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

/* -------------------------------------------------------------------------- */
/* Pass : paiement unique, accès pour une durée                               */
/* -------------------------------------------------------------------------- */

function passStillValid(row: { plan?: string | null; validUntil?: Date | null; subscriptionStatus?: string | null } | null): boolean {
  return !!row && row.subscriptionStatus === PASS_STATUS && row.plan === "premium" && !!row.validUntil && row.validUntil.getTime() > Date.now();
}

/**
 * Ouvre l'accès acheté par un Pass. IDEMPOTENT par l'identifiant de la session
 * Stripe : le journal (credit_transaction) sert de verrou, comme pour les
 * crédits. Stripe livre parfois deux fois le même webhook — le second passage
 * ne prolonge rien.
 *
 * Si l'écriture de l'accès échoue malgré trois essais, le verrou est retiré :
 * l'événement peut alors être renvoyé depuis le tableau de bord Stripe et
 * aboutir. Un paiement encaissé sans accès ouvert serait la pire panne.
 */
export async function grantPass(params: { userId: string; kind: PassKind; sessionId: string; customerId?: string | null }): Promise<{ granted: boolean; validUntil: Date | null }> {
  const { userId, kind, sessionId } = params;
  const existing = await getPlanRow(userId);
  const credits = kind === "semester" ? CREDIT_GRANTS.semesterPass : CREDIT_GRANTS.klausurPass;
  if (existing?.plan === "founder") {
    // Le fondateur garde son accès illimité ; les crédits du Pass sont quand même
    // écrits, pour qu'un achat de test prouve que le webhook livre (journal = verrou).
    const res = await grantCredits({ userId, amount: credits, transactionId: `${sessionId}:credits`, description: `${PASSES[kind].label}: ${credits} Credits`, type: "purchase" });
    console.log(`[billing] founder ${userId}: ${PASSES[kind].label} payé, accès inchangé, +${res.granted ? credits : 0} credits`);
    return { granted: res.granted, validUntil: null };
  }

  const locked = await db
    .insert(creditTransaction)
    .values({ id: sessionId, userId, amount: 0, type: "purchase", description: PASSES[kind].label, source: "pass" })
    .onConflictDoNothing()
    .returning({ id: creditTransaction.id });
  if (locked.length === 0) {
    console.log(`[billing] Pass ${sessionId} déjà appliqué — ignoré`);
    return { granted: false, validUntil: existing?.validUntil ?? null };
  }

  const validUntil = passValidUntil(kind, { plan: existing?.plan, validUntil: existing?.validUntil });
  const customerId = params.customerId ?? existing?.customerId ?? null;
  try {
    await withDbRetry(() =>
      db
        .insert(userPlan)
        .values({ userId, plan: "premium", validUntil, customerId, subscriptionId: null, subscriptionStatus: PASS_STATUS })
        .onConflictDoUpdate({
          target: userPlan.userId,
          // Un abonnement actif garde son identifiant : le Pass ne fait que repousser l'échéance.
          set: { plan: "premium", validUntil, ...(customerId ? { customerId } : {}), ...(existing?.subscriptionId ? {} : { subscriptionStatus: PASS_STATUS }), updatedAt: new Date() },
        }),
    );
  } catch (error) {
    await db.delete(creditTransaction).where(eq(creditTransaction.id, sessionId)).catch(() => {});
    throw error;
  }
  // Le stock de crédits du Pass (modèle du 18 nov. 2026). Sa propre ligne de journal : écrite une seule fois.
  await grantCredits({ userId, amount: credits, transactionId: `${sessionId}:credits`, description: `${PASSES[kind].label}: ${credits} Credits`, type: "purchase" });
  console.log(`[billing] user=${userId} ${PASSES[kind].label} +${credits} credits until=${validUntil.toISOString()}`);
  return { granted: true, validUntil };
}

/* -------------------------------------------------------------------------- */
/* Prélèvement échoué                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `invoice.payment_failed` : on note « past_due » et on prévient l'étudiant,
 * une fois (au premier échec — Stripe réessaie ensuite plusieurs jours).
 * L'ACCÈS n'est pas touché ici : c'est `customer.subscription.updated` qui le
 * retire, quand Stripe déclare l'abonnement impayé.
 */
export async function markPaymentFailed(invoice: { customer?: string | { id: string } | null; attempt_count?: number | null }): Promise<{ userId: string | null; mailed: boolean }> {
  const customerId = extractId(invoice.customer as string | { id: string } | null);
  if (!customerId) return { userId: null, mailed: false };

  const rows = await db.select().from(userPlan).where(eq(userPlan.customerId, customerId)).limit(1);
  const row = rows[0];
  if (!row) {
    console.error("[billing] payment_failed: no account for customer", customerId);
    return { userId: null, mailed: false };
  }
  // Un compte passé au Pass entre-temps n'a pas d'abonnement à relancer.
  if (row.subscriptionId) {
    await db.update(userPlan).set({ subscriptionStatus: "past_due", updatedAt: new Date() }).where(eq(userPlan.userId, row.userId));
  }
  console.warn(`[billing] user=${row.userId} payment failed (attempt ${invoice.attempt_count ?? "?"})`);

  if ((invoice.attempt_count ?? 1) > 1) return { userId: row.userId, mailed: false };
  const [account] = await db.select({ email: user.email, name: user.name }).from(user).where(eq(user.id, row.userId)).limit(1);
  if (!account?.email) return { userId: row.userId, mailed: false };
  const [access] = await db.select({ locale: userAccess.locale }).from(userAccess).where(eq(userAccess.userId, row.userId)).limit(1).catch(() => []);
  const mail = paymentFailedMail(`${process.env.WEBSITE_URL ?? ""}/pricing`, account.name, mailLang(access?.locale));
  const sent = await sendMail({ to: account.email, ...mail });
  return { userId: row.userId, mailed: sent.ok };
}

/* -------------------------------------------------------------------------- */
/* Abonnement mensuel : des crédits à chaque prélèvement réussi                */
/* -------------------------------------------------------------------------- */

/**
 * `invoice.paid` : l'abonnement mensuel ajoute son stock de crédits à chaque
 * facture payée (la première comme les suivantes). Idempotent par le numéro
 * de facture. Une facture sans abonnement (Pass, recharge) n'est pas concernée :
 * ces achats sont livrés par `checkout.session.completed`.
 */
export async function grantRenewalCredits(invoice: { id?: string | null; customer?: string | { id: string } | null; billing_reason?: string | null; amount_paid?: number | null }): Promise<{ userId: string | null; granted: boolean }> {
  const customerId = extractId(invoice.customer as string | { id: string } | null);
  if (!invoice.id || !customerId) return { userId: null, granted: false };
  if (!(invoice.billing_reason ?? "").startsWith("subscription")) return { userId: null, granted: false };
  // Une facture à 0 € (essai, avoir) ne donne rien.
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return { userId: null, granted: false };

  const rows = await db.select({ userId: userPlan.userId, plan: userPlan.plan }).from(userPlan).where(eq(userPlan.customerId, customerId)).limit(1);
  const row = rows[0];
  if (!row) {
    console.error("[billing] invoice.paid: no account for customer", customerId);
    return { userId: null, granted: false };
  }
  const res = await grantCredits({ userId: row.userId, amount: CREDIT_GRANTS.monthlyRenewal, transactionId: `invoice:${invoice.id}`, description: `Monatsabo: ${CREDIT_GRANTS.monthlyRenewal} Credits`, type: "purchase" });
  if (res.granted) console.log(`[billing] user=${row.userId} abonnement payé +${CREDIT_GRANTS.monthlyRenewal} credits`);
  return { userId: row.userId, granted: res.granted };
}
