import { z } from "zod";
import { and, count, desc, eq, gte } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { adminOnly, authed } from "../middleware/auth";
import { db } from "../database";
import { feedback } from "../database/schema";
import { user } from "../database/auth-schema";
import { readProfessor } from "../lib/professor-store";
import {
  FEEDBACK_STATUSES,
  FEEDBACK_TYPES,
  MAX_PER_HOUR,
  cleanPageUrl,
  cleanUserAgent,
  feedbackInput,
  newFeedbackId,
} from "../lib/feedback";

/**
 * Retours des bêta-testeurs, depuis l'app (bouton flottant, barre latérale).
 *
 *   feedback.submit  — tout compte connecté ; enregistre le retour avec la
 *                      page, le professeur choisi, la langue et le navigateur.
 *   feedback.list    — admin ; les retours, les plus récents d'abord.
 *   feedback.resolve — admin ; « Résolu » (ou rouvert).
 *
 * En base plutôt que par e-mail : une ligne survit à une panne de Resend, se
 * compte, se filtre et se marque comme traitée.
 */
export const feedbackRoutes = {
  submit: authed.input(feedbackInput).handler(async ({ input, context }) => {
    const since = new Date(Date.now() - 60 * 60_000);
    const [recent] = await db
      .select({ n: count() })
      .from(feedback)
      .where(and(eq(feedback.userId, context.user.id), gte(feedback.createdAt, since)));
    if ((recent?.n ?? 0) >= MAX_PER_HOUR) {
      throw new ORPCError("TOO_MANY_REQUESTS", { message: "feedback_rate_limited" });
    }

    const id = newFeedbackId();
    await db.insert(feedback).values({
      id,
      userId: context.user.id,
      type: input.type,
      rating: input.rating ?? null,
      message: input.message,
      pageUrl: cleanPageUrl(input.pageUrl),
      // Lu côté serveur : c'est le professeur réellement enregistré, pas ce
      // que l'écran croyait.
      professorId: await readProfessor(context.user.id),
      locale: (input.locale ?? "de").slice(0, 8),
      userAgent: cleanUserAgent(context.headers.get("user-agent")),
    });
    return { ok: true as const, id };
  }),

  list: adminOnly
    .input(
      z
        .object({
          status: z.enum([...FEEDBACK_STATUSES, "all"]).default("open"),
          type: z.enum(FEEDBACK_TYPES).optional(),
          limit: z.number().int().min(1).max(500).default(200),
        })
        .default({ status: "open", limit: 200 }),
    )
    .handler(async ({ input }) => {
      const filters = [
        input.status === "all" ? undefined : eq(feedback.status, input.status),
        input.type ? eq(feedback.type, input.type) : undefined,
      ].filter((f) => f !== undefined);
      const rows = await db
        .select({
          id: feedback.id,
          type: feedback.type,
          rating: feedback.rating,
          message: feedback.message,
          pageUrl: feedback.pageUrl,
          professorId: feedback.professorId,
          locale: feedback.locale,
          userAgent: feedback.userAgent,
          status: feedback.status,
          createdAt: feedback.createdAt,
          resolvedAt: feedback.resolvedAt,
          userId: feedback.userId,
          userName: user.name,
          userEmail: user.email,
        })
        .from(feedback)
        .leftJoin(user, eq(user.id, feedback.userId))
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(feedback.createdAt))
        .limit(input.limit);
      return { items: rows };
    }),

  resolve: adminOnly
    .input(z.object({ id: z.string().min(1).max(64), status: z.enum(FEEDBACK_STATUSES).default("resolved") }))
    .handler(async ({ input }) => {
      await db
        .update(feedback)
        .set({ status: input.status, resolvedAt: input.status === "resolved" ? new Date() : null })
        .where(eq(feedback.id, input.id));
      return { ok: true as const };
    }),
};
