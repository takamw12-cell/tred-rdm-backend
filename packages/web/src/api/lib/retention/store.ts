import { and, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "../../database";
import { user } from "../../database/auth-schema";
import { jobRun, retentionSetting, userNotification } from "../../database/schema";
import { sendNotification } from "../push";
import { berlinDayKey, type Decision, type RetentionUser } from "./agent";

/**
 * Les ÉCRITURES de l'agent, la pause, et ce que lisent la boîte de réception
 * et /admin/retention.
 *
 * Tables absentes (migre-retention.mjs pas encore lancé) : l'agent se croit
 * en pause, la boîte de réception est vide, l'admin le dit. Rien ne casse.
 */

export const HEARTBEAT_JOB = "retention_heartbeat";

export function disabledByEnv(): boolean {
  return process.env.DISABLE_RETENTION_AGENT === "true";
}

/** En pause tant que l'admin ne l'a pas activé — et si la table manque. */
export async function isPaused(): Promise<boolean> {
  try {
    const [row] = await db.select({ value: retentionSetting.value }).from(retentionSetting).where(eq(retentionSetting.key, "paused")).limit(1);
    return row ? row.value !== "0" : true;
  } catch {
    return true;
  }
}

export async function setPaused(paused: boolean): Promise<void> {
  const value = paused ? "1" : "0";
  await db
    .insert(retentionSetting)
    .values({ key: "paused", value, updatedAt: new Date() })
    .onConflictDoUpdate({ target: retentionSetting.key, set: { value, updatedAt: new Date() } });
}

/** L'agent tourne-t-il ? La relance du soir s'en sert pour ne pas doublonner. */
export async function retentionAgentActive(): Promise<boolean> {
  if (disabledByEnv()) return false;
  return !(await isPaused());
}

/**
 * Écrit la notification (boîte de réception), puis l'envoie au mobile si
 * l'étudiant en a un. La ligne existe AVANT l'envoi : la limite d'une par
 * jour tient même si Expo répond en retard ou deux fois.
 */
export async function recordAndSend(u: RetentionUser, d: Exclude<Decision, { action: "none" }>, now: Date): Promise<{ id: string; pushSent: number }> {
  const id = crypto.randomUUID();
  await db.insert(userNotification).values({
    id,
    userId: u.id,
    kind: d.action,
    title: d.message.title,
    body: d.message.body,
    data: JSON.stringify({ href: d.href, screen: d.screen, gapId: d.gapId, counts: d.counts }),
    gapId: d.gapId ?? null,
    reason: d.reason,
    dayKey: berlinDayKey(now),
    channel: d.channel,
    pushSent: 0,
    status: "unread",
    createdAt: now,
  });
  if (d.channel !== "push") return { id, pushSent: 0 };
  const r = await sendNotification({
    userId: u.id,
    title: d.message.title,
    body: d.message.body,
    data: { type: "retention", notificationId: id, kind: d.action, screen: d.screen },
  });
  if (r.sent > 0) await db.update(userNotification).set({ pushSent: r.sent }).where(eq(userNotification.id, id));
  return { id, pushSent: r.sent };
}

/* -------------------------------------------------------------------------- */
/* Boîte de réception de l'étudiant                                           */
/* -------------------------------------------------------------------------- */

export interface InboxItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  gapId: string | null;
  status: string;
  createdAt: Date;
}

export async function listInbox(userId: string, limit = 20): Promise<{ items: InboxItem[]; unread: number; available: boolean }> {
  try {
    const rows = await db
      .select()
      .from(userNotification)
      .where(eq(userNotification.userId, userId))
      .orderBy(desc(userNotification.createdAt))
      .limit(limit);
    const items = rows.map((r) => {
      let href = "/dashboard";
      try {
        href = String((JSON.parse(r.data) as { href?: string }).href ?? href);
      } catch {
        /* données anciennes ou abîmées : le tableau de bord */
      }
      // Seuls des chemins internes : une donnée en base ne doit jamais mener ailleurs.
      if (!href.startsWith("/") || href.startsWith("//")) href = "/dashboard";
      return { id: r.id, kind: r.kind, title: r.title, body: r.body, href, gapId: r.gapId, status: r.status, createdAt: r.createdAt };
    });
    return { items, unread: items.filter((i) => i.status === "unread").length, available: true };
  } catch {
    return { items: [], unread: 0, available: false };
  }
}

/** Ouverte = tapée sur le mobile ou cliquée dans la boîte de réception. */
export async function markOpened(userId: string, id: string, now = new Date()): Promise<boolean> {
  const res = await db
    .update(userNotification)
    .set({ openedAt: now, status: sql`case when ${userNotification.status} = 'unread' then 'opened' else ${userNotification.status} end` })
    .where(and(eq(userNotification.id, id), eq(userNotification.userId, userId), sql`${userNotification.openedAt} is null`));
  return ((res as unknown as { rowsAffected?: number }).rowsAffected ?? 0) > 0;
}

/** L'étudiant décide : accepter (la suggestion est suivie) ou refuser. */
export async function respond(userId: string, id: string, response: "accept" | "dismiss", now = new Date()): Promise<boolean> {
  const res = await db
    .update(userNotification)
    .set({
      status: response === "accept" ? "accepted" : "dismissed",
      respondedAt: now,
      ...(response === "accept" ? { openedAt: sql`coalesce(${userNotification.openedAt}, ${now.getTime()})` } : {}),
    })
    .where(and(eq(userNotification.id, id), eq(userNotification.userId, userId)));
  return ((res as unknown as { rowsAffected?: number }).rowsAffected ?? 0) > 0;
}

/* -------------------------------------------------------------------------- */
/* /admin/retention                                                           */
/* -------------------------------------------------------------------------- */

export interface KindStats {
  total: number;
  pushSent: number;
  opened: number;
  accepted: number;
  dismissed: number;
}

export async function adminOverview(now = new Date()) {
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60_000);
  const paused = await isPaused();
  const [job] = await db.select().from(jobRun).where(eq(jobRun.key, HEARTBEAT_JOB)).limit(1);

  let available = true;
  let byKind: Record<string, KindStats> = {};
  let recent: {
    id: string;
    userId: string;
    userName: string | null;
    userEmail: string | null;
    kind: string;
    reason: string;
    channel: string;
    pushSent: number;
    status: string;
    createdAt: Date;
    openedAt: Date | null;
  }[] = [];
  let byUser: { userId: string; userName: string | null; userEmail: string | null; total: number; opened: number; last: number }[] = [];

  try {
    const grouped = await db
      .select({
        kind: userNotification.kind,
        status: userNotification.status,
        n: sql<number>`count(*)`,
        pushed: sql<number>`sum(case when ${userNotification.pushSent} > 0 then 1 else 0 end)`,
        opened: sql<number>`sum(case when ${userNotification.openedAt} is not null then 1 else 0 end)`,
      })
      .from(userNotification)
      .where(gte(userNotification.createdAt, since))
      .groupBy(userNotification.kind, userNotification.status);
    byKind = {};
    for (const g of grouped) {
      const k = (byKind[g.kind] ??= { total: 0, pushSent: 0, opened: 0, accepted: 0, dismissed: 0 });
      k.total += Number(g.n);
      k.pushSent += Number(g.pushed ?? 0);
      k.opened += Number(g.opened ?? 0);
      if (g.status === "accepted") k.accepted += Number(g.n);
      if (g.status === "dismissed") k.dismissed += Number(g.n);
    }

    recent = await db
      .select({
        id: userNotification.id,
        userId: userNotification.userId,
        userName: user.name,
        userEmail: user.email,
        kind: userNotification.kind,
        reason: userNotification.reason,
        channel: userNotification.channel,
        pushSent: userNotification.pushSent,
        status: userNotification.status,
        createdAt: userNotification.createdAt,
        openedAt: userNotification.openedAt,
      })
      .from(userNotification)
      .leftJoin(user, eq(user.id, userNotification.userId))
      .orderBy(desc(userNotification.createdAt))
      .limit(200);

    byUser = (
      await db
        .select({
          userId: userNotification.userId,
          userName: user.name,
          userEmail: user.email,
          total: sql<number>`count(*)`,
          opened: sql<number>`sum(case when ${userNotification.openedAt} is not null then 1 else 0 end)`,
          last: sql<number>`max(${userNotification.createdAt})`,
        })
        .from(userNotification)
        .leftJoin(user, eq(user.id, userNotification.userId))
        .where(gte(userNotification.createdAt, since))
        .groupBy(userNotification.userId, user.name, user.email)
        .orderBy(desc(sql`max(${userNotification.createdAt})`))
        .limit(100)
    ).map((r) => ({ ...r, total: Number(r.total), opened: Number(r.opened ?? 0), last: Number(r.last) }));
  } catch {
    available = false;
  }

  const totals = Object.values(byKind).reduce(
    (a, k) => ({ total: a.total + k.total, opened: a.opened + k.opened, pushSent: a.pushSent + k.pushSent, accepted: a.accepted + k.accepted, dismissed: a.dismissed + k.dismissed }),
    { total: 0, opened: 0, pushSent: 0, accepted: 0, dismissed: 0 },
  );

  return {
    available,
    paused,
    disabledByEnv: disabledByEnv(),
    lastRunAt: job && job.ranAt > 0 ? new Date(job.ranAt) : null,
    lastRunNote: job?.note ?? "",
    totals: { ...totals, openRate: totals.total > 0 ? totals.opened / totals.total : null },
    byKind,
    byUser,
    recent,
  };
}
