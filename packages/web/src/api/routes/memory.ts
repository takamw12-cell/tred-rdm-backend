import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { misconception } from "../database/schema";
import { dueGaps, reviewGap } from "../lib/memory";

/**
 * Ce que le tuteur a retenu de l'étudiant.
 *
 * La mémoire doit être VISIBLE. Un profil qui influence les réponses sans que
 * personne puisse le consulter est à la fois inquiétant et invérifiable : si
 * TRED se trompe sur ce qu'il croit savoir de toi, tu dois pouvoir le voir et
 * le corriger. D'où `remove` — l'étudiant a le dernier mot sur son profil.
 */
export const memory = {
  /** Les lacunes ouvertes, les plus tenaces d'abord. */
  list: authed
    .input(z.object({ includeResolved: z.boolean().optional() }).optional())
    .handler(async ({ input, context }) => {
      const filters = [eq(misconception.userId, context.user.id)];
      if (!input?.includeResolved) filters.push(eq(misconception.status, "open"));

      const rows = await db
        .select()
        .from(misconception)
        .where(and(...filters))
        .orderBy(desc(misconception.timesSeen), desc(misconception.lastSeen))
        .limit(50);

      return rows.map((r) => ({
        id: r.id,
        topic: r.topic,
        label: r.label,
        detail: r.detail,
        status: r.status,
        timesSeen: r.timesSeen,
        firstSeen: r.firstSeen,
        lastSeen: r.lastSeen,
        dueAt: r.dueAt,
        intervalDays: r.intervalDays,
        reviews: r.reviews,
      }));
    }),

  /**
   * Ce qu'il est temps de revoir aujourd'hui.
   *
   * Séparé de `list` à dessein : `list` montre tout ce que TRED a retenu — la
   * transparence — tandis que `due` ne rend que le travail du jour. Mélanger
   * les deux donnerait une liste de vingt lignes dont l'étudiant ne saurait
   * pas laquelle traiter.
   */
  due: authed
    .input(z.object({ limit: z.number().int().min(1).max(20).optional() }).optional())
    .handler(async ({ input, context }) => {
      return dueGaps(context.user.id, input?.limit ?? 5);
    }),

  /**
   * Enregistre une révision.
   *
   * `ok: true` double l'intervalle, `ok: false` le ramène à un jour. Au-delà
   * de soixante jours, la notion est acquise et cesse de revenir.
   *
   * Remplace l'usage de `resolve` depuis la carte de révision : clore une
   * lacune parce qu'on l'a comprise une fois était précisément le défaut —
   * l'app oubliait ce qu'elle venait d'apprendre sur l'étudiant.
   */
  review: authed
    .input(z.object({ id: z.string().min(1), ok: z.boolean() }))
    .handler(async ({ input, context }) => {
      return reviewGap(context.user.id, input.id, input.ok);
    }),

  /** « J'ai compris » : l'étudiant peut clore une lacune lui-même. */
  resolve: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      await db
        .update(misconception)
        .set({ status: "resolved", lastSeen: new Date() })
        .where(
          and(
            eq(misconception.id, input.id),
            eq(misconception.userId, context.user.id),
          ),
        );
      return { ok: true };
    }),

  /** « Ce n'est pas vrai » : suppression définitive. */
  remove: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      await db
        .delete(misconception)
        .where(
          and(
            eq(misconception.id, input.id),
            eq(misconception.userId, context.user.id),
          ),
        );
      return { ok: true };
    }),
};
