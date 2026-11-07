import { and, eq, gte, isNotNull, sql } from "drizzle-orm";

import { db } from "../../database";
import { user } from "../../database/auth-schema";
import { chatConversation, flashcard, misconception, pushToken, userAccess, userNotification } from "../../database/schema";
import { endOfBerlinDay } from "../flashcards";
import { berlinDayKey, type FailedGap, type RetentionContext, type RetentionUser } from "./agent";

/**
 * Les LECTURES de l'agent : une poignée de requêtes groupées pour tout le
 * monde, puis l'assemblage en mémoire — jamais une requête par étudiant.
 *
 * Unités : les colonnes `timestamp` sont en secondes (chat_conversation,
 * misconception), les `timestamp_ms` en millisecondes (flashcard,
 * user_notifications). Les agrégats SQL (max) rendent le nombre brut.
 */

export const MAX_USERS_PER_CYCLE = 2000;
const DAY_MS = 24 * 60 * 60_000;

const fromSeconds = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : new Date(Number(v) * 1000));
const fromMs = (v: unknown): Date | null => (v === null || v === undefined || v === "" ? null : new Date(Number(v)));
const toDate = (v: unknown): Date | null => (v instanceof Date ? v : v === null || v === undefined ? null : new Date(Number(v)));
const latest = (...ds: (Date | null)[]) => ds.reduce<Date | null>((a, b) => (b && (!a || b > a) ? b : a), null);

export interface ScannedUser {
  user: RetentionUser;
  context: RetentionContext;
}

export async function scanUsers(now: Date): Promise<ScannedUser[]> {
  const users = await db
    .select({ id: user.id, createdAt: user.createdAt, locale: userAccess.locale, fallbackLocale: user.locale, active: userAccess.isActive })
    .from(user)
    .leftJoin(userAccess, eq(userAccess.userId, user.id))
    .limit(MAX_USERS_PER_CYCLE);
  const actives = users.filter((u) => u.active !== false);
  if (actives.length === 0) return [];

  const endOfDay = endOfBerlinDay(now).getTime();
  const nowSec = Math.floor(now.getTime() / 1000);
  const since60d = new Date(now.getTime() - 60 * DAY_MS);
  const today = berlinDayKey(now);

  const [push, chats, cards, gapActivity, openGaps, carded, proposed, recent] = await Promise.all([
    db.select({ userId: pushToken.userId }).from(pushToken).groupBy(pushToken.userId),
    db
      .select({ userId: chatConversation.userId, last: sql<number>`max(${chatConversation.updatedAt})` })
      .from(chatConversation)
      .groupBy(chatConversation.userId),
    db
      .select({
        userId: flashcard.userId,
        lastReview: sql<number>`max(${flashcard.lastReviewedAt})`,
        due: sql<number>`sum(case when ${flashcard.nextReviewDate} <= ${endOfDay} then 1 else 0 end)`,
      })
      .from(flashcard)
      .groupBy(flashcard.userId),
    db
      .select({ userId: misconception.userId, last: sql<number>`max(${misconception.lastSeen})` })
      .from(misconception)
      .groupBy(misconception.userId),
    db
      .select({
        id: misconception.id,
        userId: misconception.userId,
        topic: misconception.topic,
        label: misconception.label,
        lastSeen: sql<number>`${misconception.lastSeen}`,
        dueAt: sql<number | null>`${misconception.dueAt}`,
      })
      .from(misconception)
      .where(eq(misconception.status, "open")),
    // Lacunes qui ont déjà des cartes : rien à proposer.
    db
      .selectDistinct({ gapId: flashcard.sourceId })
      .from(flashcard)
      .where(and(eq(flashcard.sourceType, "gap"), isNotNull(flashcard.sourceId))),
    // Lacunes déjà proposées (acceptées, refusées ou en attente) : jamais deux fois.
    db.selectDistinct({ gapId: userNotification.gapId }).from(userNotification).where(isNotNull(userNotification.gapId)),
    db
      .select({
        userId: userNotification.userId,
        kind: userNotification.kind,
        dayKey: userNotification.dayKey,
        status: userNotification.status,
        createdAt: userNotification.createdAt,
      })
      .from(userNotification)
      .where(gte(userNotification.createdAt, since60d)),
  ]);

  const hasPush = new Set(push.map((p) => p.userId));
  const chatLast = new Map(chats.map((c) => [c.userId, fromSeconds(c.last)]));
  const cardRow = new Map(cards.map((c) => [c.userId, { last: fromMs(c.lastReview), due: Number(c.due ?? 0) }]));
  const gapLast = new Map(gapActivity.map((g) => [g.userId, fromSeconds(g.last)]));
  const skipGaps = new Set([...carded, ...proposed].map((r) => r.gapId).filter((x): x is string => !!x));

  const gapsByUser = new Map<string, { due: number; failed: FailedGap[] }>();
  for (const g of openGaps) {
    const entry = gapsByUser.get(g.userId) ?? { due: 0, failed: [] };
    // Même condition que la relance du soir : sans échéance ou échéance passée.
    if (g.dueAt === null || g.dueAt === undefined || Number(g.dueAt) <= nowSec) entry.due += 1;
    const lastSeen = fromSeconds(g.lastSeen);
    if (lastSeen && !skipGaps.has(g.id)) entry.failed.push({ id: g.id, topic: g.topic, label: g.label, lastSeen });
    gapsByUser.set(g.userId, entry);
  }

  const notifsByUser = new Map<string, typeof recent>();
  for (const n of recent) {
    const list = notifsByUser.get(n.userId) ?? [];
    list.push(n);
    notifsByUser.set(n.userId, list);
  }

  return actives.map((u) => {
    const lastActivityAt = latest(chatLast.get(u.id) ?? null, cardRow.get(u.id)?.last ?? null, gapLast.get(u.id) ?? null);
    const notifs = notifsByUser.get(u.id) ?? [];
    const nudges = notifs.filter((n) => n.kind === "send_push_notification");
    const nudgeDates = nudges.map((n) => toDate(n.createdAt)).filter((d): d is Date => !!d);
    const since30 = now.getTime() - 30 * DAY_MS;
    const gaps = gapsByUser.get(u.id) ?? { due: 0, failed: [] };
    return {
      user: {
        id: u.id,
        locale: u.locale ?? u.fallbackLocale ?? "de",
        createdAt: toDate(u.createdAt) ?? now,
        hasPush: hasPush.has(u.id),
      },
      context: {
        now,
        lastActivityAt,
        notificationsToday: notifs.filter((n) => n.dayKey === today).length,
        dueFlashcards: cardRow.get(u.id)?.due ?? 0,
        dueGaps: gaps.due,
        failedGaps: gaps.failed,
        lastInactivityNudgeAt: latest(...nudgeDates),
        inactivityNudgesSinceActivity: nudgeDates.filter((d) => !lastActivityAt || d > lastActivityAt).length,
        dismissedNudges30d: nudges.filter((n) => n.status === "dismissed" && (toDate(n.createdAt)?.getTime() ?? 0) >= since30).length,
      },
    };
  });
}
