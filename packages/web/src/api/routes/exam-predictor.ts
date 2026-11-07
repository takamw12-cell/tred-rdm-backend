import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { document } from "../database/schema";
import { visibleDocuments } from "../lib/visible-documents";
import { myCourseIds } from "./courses";
import { MIN_EXAMS_FOR_PREDICTION, confidenceFor, guessExamYear } from "../lib/exam-predictor";

/**
 * Klausur-Prognose (V2 — Pilier 2, SQUELETTE).
 *
 *   status   réel : combien d'Altklausuren l'étudiant voit (les siennes +
 *            celles partagées dans ses cours), les années repérées, et s'il
 *            y en a assez pour une prognose. Alimente l'onglet « Prognose ».
 *   predict  pas encore implémenté (501) — voir lib/exam-predictor.ts et
 *            docs/V2_ARCHITECTURE.md pour les étapes restantes.
 */
export const examPredictor = {
  status: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    const courseIds = await myCourseIds(uid);
    const exams = await db
      .select({ id: document.id, title: document.title })
      .from(document)
      .where(and(eq(document.kind, "klausur"), visibleDocuments(uid, courseIds)))
      .limit(200);
    const years = [...new Set(exams.map((e) => guessExamYear(e.title)).filter((y): y is number => !!y))].sort();
    return {
      examCount: exams.length,
      years,
      minExams: MIN_EXAMS_FOR_PREDICTION,
      enoughData: exams.length >= MIN_EXAMS_FOR_PREDICTION,
      confidence: confidenceFor(exams.length),
      implemented: false as const,
    };
  }),

  predict: authed
    .input(z.object({ subjectId: z.string().optional(), courseId: z.string().optional() }).optional())
    .handler(async () => {
      throw new ORPCError("NOT_IMPLEMENTED", { message: "exam_predictor_not_implemented" });
    }),
};
