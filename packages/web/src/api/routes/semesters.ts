import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { featureDisabled } from "../lib/feature-disabled";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { document, semester } from "../database/schema";

export const semesters = {
  // List the user's semesters, each with its document + page counts.
  list: authed.handler(async ({ context }) => {
    const rows = await db
      .select()
      .from(semester)
      .where(eq(semester.userId, context.user.id))
      .orderBy(desc(semester.createdAt));

    const counts = await db
      .select({
        semesterId: document.semesterId,
        docs: sql<number>`count(*)`,
        pages: sql<number>`coalesce(sum(${document.pageCount}), 0)`,
      })
      .from(document)
      .where(eq(document.userId, context.user.id))
      .groupBy(document.semesterId);

    const byId = new Map(counts.map((c) => [c.semesterId, c]));

    return rows.map((s) => {
      const c = byId.get(s.id);
      return {
        ...s,
        docCount: Number(c?.docs ?? 0),
        pageCount: Number(c?.pages ?? 0),
      };
    });
  }),

  create: authed
    .input(
      z.object({
        name: z.string().min(1).max(120),
        university: z.string().max(160).optional(),
        program: z.string().max(160).optional(),
        semesterNumber: z.number().int().min(1).max(30).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const id = crypto.randomUUID();
      await db.insert(semester).values({
        id,
        userId: context.user.id,
        name: input.name,
        university: input.university ?? null,
        program: input.program ?? null,
        semesterNumber: input.semesterNumber ?? null,
      });
      return { id };
    }),

  remove: authed
    .input(z.object({ id: z.string().max(128) }))
    .handler(async ({ input, context }) => {
      // Detach documents (keep them, just unassign) then delete the semester.
      await db
        .update(document)
        .set({ semesterId: null })
        .where(
          and(
            eq(document.semesterId, input.id),
            eq(document.userId, context.user.id),
          ),
        );
      await db
        .delete(semester)
        .where(
          and(eq(semester.id, input.id), eq(semester.userId, context.user.id)),
        );
      return { ok: true };
    }),

  // ── Sharing — FERMÉ (12 nov. 2026, UrhG) ────────────────────────────
  // Le partage d'un semestre par code recopiait les documents d'un étudiant
  // chez un autre. Les trois routes répondent 403 « Feature disabled ». La
  // table `semester_share` reste en base ; l'ancien code est dans git.
  shareCreate: authed.handler(() => featureDisabled()),
  shareInfo: authed.handler(() => featureDisabled()),
  shareRedeem: authed.handler(() => featureDisabled()),
};
