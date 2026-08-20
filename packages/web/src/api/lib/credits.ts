import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "../database";
import { creditTransaction, purchasedCredits } from "../database/schema";

/**
 * Gekaufte Credits — das zweite Guthaben neben dem Monatskontingent.
 *
 * Warum zwei getrennte Töpfe statt eines Zählers:
 *
 *   • Das MONATSKONTINGENT (`usage_counter`, siehe lib/plan.ts) verfällt. Es
 *     setzt sich über den Periodenschlüssel "2026-08" von selbst zurück — kein
 *     Cronjob, der ausfallen und alle Konten auf null stehen lassen könnte.
 *   • GEKAUFTE Credits gehören dem Nutzer. Sie verfallen nie.
 *
 * In einer einzigen Spalte ließe sich am Monatsersten nicht mehr unterscheiden,
 * was zurückgesetzt werden darf und was bezahlt wurde. Genau dort entstehen die
 * Fehler, die Geld kosten und Vertrauen zerstören.
 */

/**
 * Reihenfolge des Verbrauchs.
 *
 * "quota" zuerst ist bewusst gesetzt, obwohl die Spezifikation das Gegenteil
 * vorsah: das Monatskontingent VERFÄLLT am Monatsende, gekaufte Credits nicht.
 * Wer zuerst die bezahlten Credits abbucht, lässt das Freikontingent ungenutzt
 * verfallen — der Nutzer verliert Geld, ohne es zu bemerken. Das ist der Stoff,
 * aus dem Support-Tickets und schlechte Bewertungen gemacht sind.
 *
 * Auf "credits" umstellen, falls doch gewünscht: eine Zeile.
 */
export const SPEND_ORDER: "quota" | "credits" = "quota";

export type CreditTransactionType = "purchase" | "consume" | "grant" | "refund";

/** Aktuelles Guthaben an gekauften Credits. */
export async function getPurchasedCredits(userId: string): Promise<number> {
  try {
    const rows = await db
      .select({ credits: purchasedCredits.creditsRemaining })
      .from(purchasedCredits)
      .where(eq(purchasedCredits.userId, userId))
      .limit(1);
    return rows[0]?.credits ?? 0;
  } catch (error) {
    console.error("[credits] balance read failed", error);
    return 0;
  }
}

/**
 * Bucht `amount` gekaufte Credits ab. Gibt false zurück, wenn das Guthaben
 * nicht reicht — ohne etwas zu verändern.
 *
 * Der Abzug läuft als BEDINGTES Update: `credits_remaining >= amount` steht in
 * der WHERE-Klausel. Zwei gleichzeitige Anfragen können damit nicht beide das
 * letzte Credit verbrauchen; die zweite trifft auf null betroffene Zeilen.
 */
export async function spendPurchasedCredits(
  userId: string,
  amount: number,
  description: string,
): Promise<{ ok: boolean; remaining: number }> {
  const n = Math.max(1, Math.round(amount));

  try {
    const result = await db
      .update(purchasedCredits)
      .set({
        creditsRemaining: sql`${purchasedCredits.creditsRemaining} - ${n}`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(purchasedCredits.userId, userId),
          sql`${purchasedCredits.creditsRemaining} >= ${n}`,
        ),
      );

    const changed = (result as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
    if (changed === 0) {
      return { ok: false, remaining: await getPurchasedCredits(userId) };
    }

    const remaining = await getPurchasedCredits(userId);
    await logTransaction({
      userId,
      amount: -n,
      type: "consume",
      description,
      source: "credits",
    });
    return { ok: true, remaining };
  } catch (error) {
    console.error("[credits] spend failed", error);
    return { ok: false, remaining: 0 };
  }
}

/**
 * Schreibt Credits gut. IDEMPOTENT über `transactionId`.
 *
 * Stripe stellt einen Webhook mehrfach zu, wenn die erste Antwort ausbleibt
 * oder zu langsam kommt. Ohne diesen Schutz bekäme derselbe Kauf zwei- oder
 * dreimal Credits. Die Stripe-Session-ID als Primärschlüssel des Journals macht
 * daraus eine harmlose Wiederholung: der zweite Einfügeversuch prallt ab, und
 * das Guthaben wird gar nicht erst angefasst.
 */
export async function grantCredits(params: {
  userId: string;
  amount: number;
  transactionId: string;
  description: string;
  type?: CreditTransactionType;
}): Promise<{ granted: boolean; balance: number }> {
  const n = Math.max(1, Math.round(params.amount));

  try {
    const inserted = await db
      .insert(creditTransaction)
      .values({
        id: params.transactionId,
        userId: params.userId,
        amount: n,
        type: params.type ?? "purchase",
        description: params.description,
        source: "credits",
      })
      .onConflictDoNothing()
      .returning({ id: creditTransaction.id });

    if (inserted.length === 0) {
      console.log(`[credits] transaction ${params.transactionId} already applied — skipped`);
      return { granted: false, balance: await getPurchasedCredits(params.userId) };
    }

    await db
      .insert(purchasedCredits)
      .values({
        userId: params.userId,
        creditsRemaining: n,
        lastPurchasedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: purchasedCredits.userId,
        set: {
          creditsRemaining: sql`${purchasedCredits.creditsRemaining} + ${n}`,
          lastPurchasedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    const balance = await getPurchasedCredits(params.userId);
    console.log(`[credits] user=${params.userId} +${n} → ${balance}`);
    return { granted: true, balance };
  } catch (error) {
    console.error("[credits] grant failed", error);
    return { granted: false, balance: await getPurchasedCredits(params.userId) };
  }
}

/** Journaleintrag ohne Guthabenwirkung (z. B. Verbrauch aus dem Monatskontingent). */
export async function logTransaction(entry: {
  userId: string;
  amount: number;
  type: CreditTransactionType;
  description: string;
  source?: "quota" | "credits";
  id?: string;
}): Promise<void> {
  try {
    await db
      .insert(creditTransaction)
      .values({
        id: entry.id ?? crypto.randomUUID(),
        userId: entry.userId,
        amount: entry.amount,
        type: entry.type,
        description: entry.description,
        source: entry.source ?? null,
      })
      .onConflictDoNothing();
  } catch (error) {
    // Das Journal ist wichtig, aber es darf nie eine laufende Anfrage kippen.
    console.error("[credits] journal write failed", error);
  }
}

/** Letzte Bewegungen, neueste zuerst. */
export async function listTransactions(userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(creditTransaction)
    .where(eq(creditTransaction.userId, userId))
    .orderBy(desc(creditTransaction.createdAt))
    .limit(Math.max(1, Math.min(200, limit)));

  return rows.map((r) => ({
    id: r.id,
    amount: r.amount,
    type: r.type,
    description: r.description,
    source: r.source,
    createdAt: r.createdAt,
  }));
}
