import * as ExpoServerSdk from "expo-server-sdk";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../database";
import { pushToken } from "../database/schema";

const { Expo } = ExpoServerSdk;
type ExpoPushMessage = ExpoServerSdk.ExpoPushMessage;
type ExpoPushTicket = ExpoServerSdk.ExpoPushTicket;

/**
 * Push-Benachrichtigungen über den Expo-Dienst.
 *
 * Grundsatz: ein Fehler beim Versand darf NIE die auslösende Anfrage scheitern
 * lassen. Eine erfolgreich erzeugte Klausur bleibt erzeugt, auch wenn Expo
 * gerade nicht erreichbar ist. Alle Funktionen hier fangen ihre Fehler selbst
 * ab und protokollieren sie nur.
 */

let _expo: InstanceType<typeof Expo> | null = null;

function getExpo() {
  if (_expo) return _expo;
  _expo = new Expo({
    // Nur nötig, wenn in expo.dev "Enhanced Security for Push Notifications"
    // aktiviert ist. Sonst darf die Variable fehlen.
    accessToken: process.env.EXPO_ACCESS_TOKEN,
  });
  return _expo;
}

export type SendNotificationInput = {
  userId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
};

export type SendNotificationResult = {
  sent: number;
  failed: number;
  removedTokens: string[];
};

/** Sendet an ALLE Geräte eines Nutzers. Wirft nie. */
export async function sendNotification(
  input: SendNotificationInput,
): Promise<SendNotificationResult> {
  const result: SendNotificationResult = { sent: 0, failed: 0, removedTokens: [] };

  try {
    const rows = await db
      .select({ token: pushToken.token })
      .from(pushToken)
      .where(eq(pushToken.userId, input.userId));

    // Kaputte Tokens (deinstallierte App, abgeschnittener Wert) gleich entfernen.
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const row of rows) {
      (Expo.isExpoPushToken(row.token) ? valid : invalid).push(row.token);
    }

    if (invalid.length > 0) {
      await removeTokens(invalid);
      result.removedTokens.push(...invalid);
    }

    if (valid.length === 0) return result;

    const messages: ExpoPushMessage[] = valid.map((to) => ({
      to,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
      sound: input.sound === null ? undefined : (input.sound ?? "default"),
      badge: input.badge,
      channelId: input.channelId ?? "default",
      priority: "high",
    }));

    const expo = getExpo();
    const tickets: ExpoPushTicket[] = [];

    for (const chunk of expo.chunkPushNotifications(messages)) {
      try {
        tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
      } catch (error) {
        result.failed += chunk.length;
        console.error("[push] chunk failed", error);
      }
    }

    // Expo meldet abgemeldete Geräte über DeviceNotRegistered — aufräumen,
    // sonst wächst die Tabelle mit toten Tokens und jeder Versand wird teurer.
    const dead: string[] = [];
    tickets.forEach((ticket, index) => {
      if (ticket.status === "ok") {
        result.sent += 1;
        return;
      }
      result.failed += 1;
      console.error("[push] ticket error", ticket.message, ticket.details);
      if (ticket.details?.error === "DeviceNotRegistered") {
        const token = valid[index];
        if (token) dead.push(token);
      }
    });

    if (dead.length > 0) {
      await removeTokens(dead);
      result.removedTokens.push(...dead);
    }

    return result;
  } catch (error) {
    console.error("[push] sendNotification failed", error);
    return result;
  }
}

/**
 * Feuern und vergessen. In einem `stream()`-Handler oder nach einer Antwort
 * verwenden: ein `await` würde die Antwort verzögern, ohne dem Nutzer zu nützen.
 */
export function sendNotificationSafe(input: SendNotificationInput): void {
  void sendNotification(input).catch((error) => {
    console.error("[push] sendNotificationSafe", error);
  });
}

export async function removeTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  try {
    await db.delete(pushToken).where(inArray(pushToken.token, tokens));
  } catch (error) {
    console.error("[push] token cleanup failed", error);
  }
}

/** Gerät registrieren. Upsert auf den Token — siehe Kommentar am Schema. */
export async function registerPushToken(params: {
  userId: string;
  token: string;
  platform: "ios" | "android";
  deviceName?: string | null;
  appVersion?: string | null;
}): Promise<void> {
  await db
    .insert(pushToken)
    .values({
      token: params.token,
      userId: params.userId,
      platform: params.platform,
      deviceName: params.deviceName ?? null,
      appVersion: params.appVersion ?? null,
    })
    .onConflictDoUpdate({
      target: pushToken.token,
      set: {
        userId: params.userId,
        platform: params.platform,
        deviceName: params.deviceName ?? null,
        appVersion: params.appVersion ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function unregisterPushToken(userId: string, token: string): Promise<void> {
  await db
    .delete(pushToken)
    .where(and(eq(pushToken.userId, userId), eq(pushToken.token, token)));
}

/* ── Fachliche Auslöser ──────────────────────────────────────────────────── */

/** "Deine Klausur ist fertig" — ausgelöst am Ende von /api/agent/exercise. */
export function notifyExerciseReady(params: {
  userId: string;
  savedId: string | null;
  mode: "exercise" | "klausur";
  subject?: string;
  locale?: string;
}): void {
  const isKlausur = params.mode === "klausur";
  const subject = params.subject?.trim();

  sendNotificationSafe({
    userId: params.userId,
    title: isKlausur ? "Deine Klausur ist fertig 📝" : "Deine Übungsaufgabe ist fertig ✏️",
    body: subject
      ? `${subject} — jetzt öffnen und rechnen.`
      : "Jetzt öffnen und rechnen.",
    data: {
      type: isKlausur ? "klausur_ready" : "exercise_ready",
      savedId: params.savedId,
      screen: "exercises",
    },
  });
}

/** Monatslimit erreicht — führt in der App direkt auf die Tarifseite. */
export function notifyQuotaReached(params: {
  userId: string;
  metric: string;
  plan: string;
}): void {
  sendNotificationSafe({
    userId: params.userId,
    title: "Monatslimit erreicht",
    body:
      params.plan === "free"
        ? "Dein Freikontingent ist aufgebraucht. Mit einem Upgrade geht es sofort weiter."
        : "Du hast dein Monatskontingent aufgebraucht. Nächsten Monat geht es weiter.",
    data: { type: "quota_reached", metric: params.metric, screen: "pricing" },
  });
}
