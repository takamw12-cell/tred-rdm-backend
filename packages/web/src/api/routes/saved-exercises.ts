import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { savedExercise } from "../database/schema";

// Saved Übungen & Klausuren generated on the exercises page. Auto-saved by the
// generation endpoint (src/api/index.ts); here we expose the history so the UI
// can list, reopen (statement + solution) and delete entries.
export const savedExercises = {
  // Lightweight list for the history view — no heavy statement/solution text.
  list: authed
    .input(z.object({ semesterId: z.string().nullable().optional() }).optional())
    .handler(async ({ input, context }) => {
      const filters = [eq(savedExercise.userId, context.user.id)];
      if (input?.semesterId) filters.push(eq(savedExercise.semesterId, input.semesterId));
      const rows = await db
        .select({
          id: savedExercise.id,
          mode: savedExercise.mode,
          subject: savedExercise.subject,
          chapter: savedExercise.chapter,
          difficulty: savedExercise.difficulty,
          type: savedExercise.type,
          title: savedExercise.title,
          points: savedExercise.points,
          basedOnId: savedExercise.basedOnId,
          locale: savedExercise.locale,
          semesterId: savedExercise.semesterId,
          createdAt: savedExercise.createdAt,
        })
        .from(savedExercise)
        .where(and(...filters))
        .orderBy(desc(savedExercise.createdAt));
      return rows;
    }),

  // Full record including statement + solution, to reopen / export.
  get: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const row = await db
        .select()
        .from(savedExercise)
        .where(
          and(eq(savedExercise.id, input.id), eq(savedExercise.userId, context.user.id)),
        )
        .limit(1);
      return row[0] ?? null;
    }),

  remove: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      await db
        .delete(savedExercise)
        .where(
          and(eq(savedExercise.id, input.id), eq(savedExercise.userId, context.user.id)),
        );
      return { ok: true };
    }),
};
