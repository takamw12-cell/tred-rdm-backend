import { eq, inArray } from "drizzle-orm";

import { db } from "../database";
import {
  chatConversation,
  chatMessage,
  creditTransaction,
  document,
  purchasedCredits,
  pushToken,
  savedExercise,
  semester,
  semesterShare,
  usageCounter,
  userAccess,
  userPlan,
} from "../database/schema";
import { account, session, user } from "../database/auth-schema";

/**
 * DSGVO Art. 15/20 (Auskunft und Datenübertragbarkeit) und Art. 17
 * (Recht auf Löschung).
 *
 * Beide Funktionen sind bewusst an EINER Stelle gebündelt. Der teuerste Fehler
 * bei einer Löschung ist die vergessene Tabelle: sie fällt niemandem auf, bis
 * eine Behörde fragt. Wer eine neue Tabelle mit `user_id` anlegt, muss sie hier
 * eintragen — die Liste unten ist die Prüfliste.
 *
 * Turso/SQLite erzwingt hier keine Fremdschlüssel-Kaskade, die Reihenfolge und
 * Vollständigkeit liegen also vollständig in diesem Code.
 */

/** Alle Tabellen mit Personenbezug. Bei neuer Tabelle: hier ergänzen. */
export const PERSONAL_DATA_TABLES = [
  "user (Better Auth)",
  "session (Better Auth)",
  "account (Better Auth)",
  "user_access",
  "user_plan",
  "purchased_credits",
  "credit_transactions",
  "push_token",
  "semester",
  "semester_share",
  "document",
  "chat_conversation",
  "chat_message",
  "saved_exercise",
  "usage_counter",
] as const;

/* -------------------------------------------------------------------------- */
/* Auskunft / Export                                                          */
/* -------------------------------------------------------------------------- */

export async function exportUserData(userId: string) {
  const [profile] = await db.select().from(user).where(eq(user.id, userId)).limit(1);

  const [access] = await db
    .select()
    .from(userAccess)
    .where(eq(userAccess.userId, userId))
    .limit(1);

  const [plan] = await db.select().from(userPlan).where(eq(userPlan.userId, userId)).limit(1);
  const [credits] = await db
    .select()
    .from(purchasedCredits)
    .where(eq(purchasedCredits.userId, userId))
    .limit(1);

  const conversations = await db
    .select()
    .from(chatConversation)
    .where(eq(chatConversation.userId, userId));

  const conversationIds = conversations.map((c) => c.id);
  const messages = conversationIds.length
    ? await db
        .select()
        .from(chatMessage)
        .where(inArray(chatMessage.conversationId, conversationIds))
    : [];

  const [semesters, documents, exercises, tokens, transactions] = await Promise.all([
    db.select().from(semester).where(eq(semester.userId, userId)),
    db.select().from(document).where(eq(document.userId, userId)),
    db.select().from(savedExercise).where(eq(savedExercise.userId, userId)),
    db.select().from(pushToken).where(eq(pushToken.userId, userId)),
    db.select().from(creditTransaction).where(eq(creditTransaction.userId, userId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    format: "TRED-Datenexport v1 (DSGVO Art. 15 & 20)",
    hinweis:
      "Diese Datei enthält alle zu deinem Konto gespeicherten Daten. " +
      "Zahlungsdaten (Kartennummer, Rechnungen) liegen bei Stripe und sind " +
      "über das Kundenportal abrufbar — TRED speichert sie nicht.",
    profil: profile
      ? {
          id: profile.id,
          name: profile.name,
          email: profile.email,
          emailVerified: profile.emailVerified,
          erstelltAm: profile.createdAt,
        }
      : null,
    zugang: access ?? null,
    tarif: plan
      ? {
          plan: plan.plan,
          gueltigBis: plan.validUntil,
          status: plan.subscriptionStatus,
          // customerId/subscriptionId sind Stripe-Referenzen, keine Zahlungsdaten.
          stripeKundennummer: plan.customerId,
        }
      : null,
    guthaben: credits ?? { creditsRemaining: 0 },
    creditBewegungen: transactions,
    semester: semesters,
    dokumente: documents.map((d) => ({
      ...d,
      // Der extrahierte Volltext kann sehr groß sein und ist eine Kopie der
      // Datei, die der Nutzer selbst hochgeladen hat.
      textContent: `[${d.charCount} Zeichen — Originaldatei im Konto abrufbar]`,
    })),
    unterhaltungen: conversations,
    nachrichten: messages,
    uebungen: exercises,
    geraete: tokens.map((t) => ({
      platform: t.platform,
      deviceName: t.deviceName,
      registriertAm: t.createdAt,
      // Der Push-Token selbst ist ein Geheimnis und gehört nicht in einen
      // Export, der per Mail weitergereicht werden könnte.
      token: "[entfernt]",
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Löschung                                                                   */
/* -------------------------------------------------------------------------- */

export interface DeletionReport {
  deleted: Record<string, number>;
  warnings: string[];
}

/**
 * Löscht ALLE Daten eines Kontos, unwiderruflich.
 *
 * Reihenfolge: erst die abhängigen Datensätze, zuletzt der Nutzer selbst.
 * Bricht ein Schritt ab, laufen die übrigen weiter und der Fehler landet im
 * Bericht — eine halb gelöschte Person ist schlechter als eine vollständig
 * gelöschte mit einer Warnung.
 */
export async function deleteUserData(userId: string): Promise<DeletionReport> {
  const deleted: Record<string, number> = {};
  const warnings: string[] = [];

  const rows = (r: unknown) => (r as { rowsAffected?: number })?.rowsAffected ?? 0;

  const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
      deleted[label] = rows(await fn());
    } catch (error) {
      warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Nachrichten hängen an Unterhaltungen, nicht direkt am Nutzer.
  try {
    const convs = await db
      .select({ id: chatConversation.id })
      .from(chatConversation)
      .where(eq(chatConversation.userId, userId));
    const ids = convs.map((c) => c.id);
    if (ids.length) {
      await step("chat_message", () =>
        db.delete(chatMessage).where(inArray(chatMessage.conversationId, ids)),
      );
    } else {
      deleted["chat_message"] = 0;
    }
  } catch (error) {
    warnings.push(`chat_message: ${error instanceof Error ? error.message : String(error)}`);
  }

  await step("chat_conversation", () =>
    db.delete(chatConversation).where(eq(chatConversation.userId, userId)),
  );
  await step("saved_exercise", () =>
    db.delete(savedExercise).where(eq(savedExercise.userId, userId)),
  );
  await step("document", () => db.delete(document).where(eq(document.userId, userId)));
  await step("semester_share", () =>
    db.delete(semesterShare).where(eq(semesterShare.ownerId, userId)),
  );
  await step("semester", () => db.delete(semester).where(eq(semester.userId, userId)));
  await step("push_token", () => db.delete(pushToken).where(eq(pushToken.userId, userId)));
  await step("credit_transactions", () =>
    db.delete(creditTransaction).where(eq(creditTransaction.userId, userId)),
  );
  await step("purchased_credits", () =>
    db.delete(purchasedCredits).where(eq(purchasedCredits.userId, userId)),
  );
  await step("user_plan", () => db.delete(userPlan).where(eq(userPlan.userId, userId)));
  await step("user_access", () => db.delete(userAccess).where(eq(userAccess.userId, userId)));

  await step("usage_counter", () =>
    db.delete(usageCounter).where(eq(usageCounter.userId, userId)),
  );

  // Better Auth zuletzt: Sitzungen und Anmeldeverfahren vor dem Nutzer.
  await step("session", () => db.delete(session).where(eq(session.userId, userId)));
  await step("account", () => db.delete(account).where(eq(account.userId, userId)));
  await step("user", () => db.delete(user).where(eq(user.id, userId)));

  console.log(`[dsgvo] Konto ${userId} gelöscht`, deleted, warnings);
  return { deleted, warnings };
}
