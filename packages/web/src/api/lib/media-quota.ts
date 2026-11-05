import { and, eq, sql } from "drizzle-orm";
import { db } from "../database";
import { usageCounter } from "../database/schema";

/**
 * Quota JOURNALIER de génération d'images et de vidéos (Replicate).
 *
 * Les vidéos coûtent cher (plusieurs dizaines de centimes l'unité) : la limite
 * est par jour et non par mois, pour qu'un seul après-midi ne vide pas le
 * budget. Stocké dans `usage_counter` avec `period` = « AAAA-MM-JJ » :
 * aucune nouvelle table, aucune migration.
 *
 * Réglable : MEDIA_VIDEO_PER_DAY (défaut 2), MEDIA_IMAGE_PER_DAY (défaut 20).
 */
export type MediaKind = "image" | "video";

const METRIC: Record<MediaKind, string> = { image: "media_image", video: "media_video" };

function limitFor(kind: MediaKind): number {
  const raw = kind === "video" ? process.env.MEDIA_VIDEO_PER_DAY : process.env.MEDIA_IMAGE_PER_DAY;
  const n = raw ? Number(raw) : NaN;
  if (Number.isInteger(n) && n >= 0) return n;
  return kind === "video" ? 2 : 20;
}

/** Jour en UTC, « 2026-11-05 ». */
export function mediaDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Réserve une génération. Atomique : l'incrément n'a lieu que si le compteur
 * est sous la limite, même avec deux requêtes simultanées.
 */
export async function reserveMedia(
  userId: string,
  kind: MediaKind,
): Promise<{ ok: true; used: number; limit: number } | { ok: false; limit: number }> {
  const limit = limitFor(kind);
  if (limit === 0) return { ok: false, limit };
  const period = mediaDay();
  const metric = METRIC[kind];

  const rows = await db
    .insert(usageCounter)
    .values({ userId, period, metric, count: 1 })
    .onConflictDoUpdate({
      target: [usageCounter.userId, usageCounter.period, usageCounter.metric],
      set: { count: sql`${usageCounter.count} + 1` },
      setWhere: sql`${usageCounter.count} < ${limit}`,
    })
    .returning({ count: usageCounter.count });

  const used = rows[0]?.count;
  return used === undefined ? { ok: false, limit } : { ok: true, used, limit };
}

/** Rend la réservation si la génération a échoué : on ne paie pas un échec. */
export async function releaseMedia(userId: string, kind: MediaKind): Promise<void> {
  await db
    .update(usageCounter)
    .set({ count: sql`max(${usageCounter.count} - 1, 0)` })
    .where(
      and(
        eq(usageCounter.userId, userId),
        eq(usageCounter.period, mediaDay()),
        eq(usageCounter.metric, METRIC[kind]),
      ),
    );
}
