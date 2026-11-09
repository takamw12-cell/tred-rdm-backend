import { z } from "zod";
import { and, asc, count, desc, eq, lte, min, notInArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { flashcard, misconception } from "../database/schema";
import { MAX_CARDS_PER_USER, endOfBerlinDay, newCardSchedule, reviewCard } from "../lib/flashcards";

/**
 * Karteikarten (V2 — Pilier 1). La génération par l'IA est une route Hono
 * (POST /api/flashcards/generate, voir api/flashcards/routes.ts) ; ici, tout
 * ce qui est rapide :
 *
 *   summary  le bloc « Heute zu wiederholen » du tableau de bord + la lacune
 *            ouverte la plus tenace qui n'a pas encore de cartes
 *   due      les cartes dues aujourd'hui (fin de journée à Berlin)
 *   review   « Gewusst » / « Nicht gewusst »
 *   list     toutes mes cartes ; create / remove
 *
 * Tant que la table n'existe pas (migration pas lancée), summary répond
 * { available: false } : le tableau de bord masque le bloc au lieu d'échouer.
 */

const cardOut = (r: typeof flashcard.$inferSelect) => ({
  id: r.id,
  front: r.frontContent,
  back: r.backContent,
  topic: r.topic,
  sourceType: r.sourceType,
  sourceLabel: r.sourceLabel,
  nextReviewDate: r.nextReviewDate,
  intervalDays: r.intervalDays,
  reviews: r.reviews,
  lapses: r.lapses,
});

export const flashcards = {
  summary: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    try {
      const dueBefore = endOfBerlinDay(new Date());
      const [[due], [total]] = await Promise.all([
        db
          .select({ n: count() })
          .from(flashcard)
          .where(and(eq(flashcard.userId, uid), lte(flashcard.nextReviewDate, dueBefore))),
        db.select({ n: count(), next: min(flashcard.nextReviewDate) }).from(flashcard).where(eq(flashcard.userId, uid)),
      ]);

      // La lacune à proposer : ouverte, la plus vue, sans cartes déjà créées.
      const covered = (
        await db
          .select({ id: flashcard.sourceId })
          .from(flashcard)
          .where(and(eq(flashcard.userId, uid), eq(flashcard.sourceType, "gap")))
          .groupBy(flashcard.sourceId)
      )
        .map((r) => r.id)
        .filter((id): id is string => Boolean(id));
      const [gap] = await db
        .select({ id: misconception.id, topic: misconception.topic, label: misconception.label })
        .from(misconception)
        .where(
          and(
            eq(misconception.userId, uid),
            eq(misconception.status, "open"),
            covered.length ? notInArray(misconception.id, covered) : undefined,
          ),
        )
        .orderBy(desc(misconception.timesSeen), desc(misconception.lastSeen))
        .limit(1);

      return {
        available: true as const,
        dueToday: due?.n ?? 0,
        total: total?.n ?? 0,
        nextReviewDate: total?.next ?? null,
        gap: gap ?? null,
      };
    } catch (err) {
      console.error("[flashcards] summary — table absente ? (migre-flashcards.mjs)", (err as Error).message);
      return { available: false as const, dueToday: 0, total: 0, nextReviewDate: null, gap: null };
    }
  }),

  due: authed
    .input(z.object({ limit: z.number().int().min(1).max(200).optional() }).optional())
    .handler(async ({ input, context }) => {
      const rows = await db
        .select()
        .from(flashcard)
        .where(and(eq(flashcard.userId, context.user.id), lte(flashcard.nextReviewDate, endOfBerlinDay(new Date()))))
        // Les plus en retard d'abord, puis les plus difficiles.
        .orderBy(asc(flashcard.nextReviewDate), desc(flashcard.lapses))
        .limit(input?.limit ?? 100);
      return rows.map(cardOut);
    }),

  review: authed
    .input(z.object({ id: z.string().max(128).min(1), knew: z.boolean() }))
    .handler(async ({ input, context }) => {
      const [card] = await db
        .select()
        .from(flashcard)
        .where(and(eq(flashcard.id, input.id), eq(flashcard.userId, context.user.id)))
        .limit(1);
      if (!card) throw new ORPCError("NOT_FOUND");
      const now = new Date();
      const next = reviewCard(card, input.knew, now);
      await db
        .update(flashcard)
        .set({ ...next, lastReviewedAt: now })
        .where(and(eq(flashcard.id, card.id), eq(flashcard.userId, context.user.id)));
      return { id: card.id, intervalDays: next.intervalDays, nextReviewDate: next.nextReviewDate };
    }),

  list: authed
    .input(z.object({ limit: z.number().int().min(1).max(1000).optional() }).optional())
    .handler(async ({ input, context }) => {
      const rows = await db
        .select()
        .from(flashcard)
        .where(eq(flashcard.userId, context.user.id))
        .orderBy(desc(flashcard.createdAt))
        .limit(input?.limit ?? 500);
      return rows.map(cardOut);
    }),

  create: authed
    .input(
      z.object({
        front: z.string().trim().min(2).max(300),
        back: z.string().trim().min(1).max(700),
        topic: z.string().trim().max(60).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(flashcard).where(eq(flashcard.userId, context.user.id));
      if (n >= MAX_CARDS_PER_USER) throw new ORPCError("CONFLICT", { message: "too_many_cards" });
      const now = new Date();
      const id = `fc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      await db.insert(flashcard).values({
        id,
        userId: context.user.id,
        frontContent: input.front,
        backContent: input.back,
        topic: input.topic ?? "",
        sourceType: "manual",
        ...newCardSchedule(now),
        createdAt: now,
      });
      return { id };
    }),

  remove: authed.input(z.object({ id: z.string().max(128).min(1) })).handler(async ({ input, context }) => {
    await db.delete(flashcard).where(and(eq(flashcard.id, input.id), eq(flashcard.userId, context.user.id)));
    return { ok: true };
  }),
};
