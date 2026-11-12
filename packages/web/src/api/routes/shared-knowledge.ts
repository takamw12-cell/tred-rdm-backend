import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { featureDisabled } from "../lib/feature-disabled";
import { sharedKnowledge, sharedKnowledgeVote } from "../database/schema";

/**
 * Base de connaissances partagée d'un cours (V2 — Pilier 4, SQUELETTE).
 *
 *   list        les entrées PUBLIÉES d'un cours dont on est membre, les mieux
 *               notées d'abord. Jamais l'auteur.
 *   upvote      un vote par étudiant (clé composite), compteur incrémenté
 *               seulement si le vote est nouveau.
 *   contribute  pas encore ouvert (501) : il faut d'abord le consentement
 *               explicite par contribution, la modération et la mention dans
 *               la Datenschutzerklärung (docs/V2_ARCHITECTURE.md).
 */
/**
 * FERMÉ depuis le 12 nov. 2026 : la base partagée reposait sur l'appartenance
 * à un cours, et les cours partagés sont coupés (UrhG). Toute lecture ou vote
 * répond 403 « Feature disabled ». `course_member` n'est plus lue.
 */
async function assertMember(_userId: string, _courseId: string): Promise<never> {
  return featureDisabled();
}

export const sharedKnowledgeRoutes = {
  list: authed
    .input(z.object({ courseId: z.string().max(128).min(1), limit: z.number().int().min(1).max(100).optional() }))
    .handler(async ({ input, context }) => {
      await assertMember(context.user.id, input.courseId);
      const rows = await db
        .select({
          id: sharedKnowledge.id,
          courseId: sharedKnowledge.courseId,
          topic: sharedKnowledge.topic,
          question: sharedKnowledge.question,
          answer: sharedKnowledge.answer,
          upvotes: sharedKnowledge.upvotes,
          createdAt: sharedKnowledge.createdAt,
        })
        .from(sharedKnowledge)
        .where(and(eq(sharedKnowledge.courseId, input.courseId), eq(sharedKnowledge.status, "published")))
        .orderBy(desc(sharedKnowledge.upvotes), desc(sharedKnowledge.createdAt))
        .limit(input.limit ?? 50);
      const ids = rows.map((r) => r.id);
      const mine = ids.length
        ? new Set(
            (
              await db
                .select({ id: sharedKnowledgeVote.knowledgeId })
                .from(sharedKnowledgeVote)
                .where(and(eq(sharedKnowledgeVote.userId, context.user.id), inArray(sharedKnowledgeVote.knowledgeId, ids)))
            ).map((v) => v.id),
          )
        : new Set<string>();
      return rows.map((r) => ({ ...r, votedByMe: mine.has(r.id) }));
    }),

  upvote: authed.input(z.object({ id: z.string().max(128).min(1) })).handler(async ({ input, context }) => {
    const [entry] = await db
      .select({ courseId: sharedKnowledge.courseId, status: sharedKnowledge.status })
      .from(sharedKnowledge)
      .where(eq(sharedKnowledge.id, input.id))
      .limit(1);
    if (!entry || entry.status !== "published") throw new ORPCError("NOT_FOUND");
    await assertMember(context.user.id, entry.courseId);
    const inserted = await db
      .insert(sharedKnowledgeVote)
      .values({ knowledgeId: input.id, userId: context.user.id })
      .onConflictDoNothing()
      .returning({ id: sharedKnowledgeVote.knowledgeId });
    if (inserted.length > 0) {
      await db
        .update(sharedKnowledge)
        .set({ upvotes: sql`${sharedKnowledge.upvotes} + 1` })
        .where(eq(sharedKnowledge.id, input.id));
    }
    return { ok: true, counted: inserted.length > 0 };
  }),

  contribute: authed
    .input(
      z.object({
        courseId: z.string().max(128).min(1),
        topic: z.string().max(80),
        question: z.string().min(5).max(1000),
        answer: z.string().min(20).max(12_000),
        consent: z.literal(true),
      }),
    )
    .handler(async () => {
      throw new ORPCError("NOT_IMPLEMENTED", { message: "shared_knowledge_contribute_not_open" });
    }),
};
