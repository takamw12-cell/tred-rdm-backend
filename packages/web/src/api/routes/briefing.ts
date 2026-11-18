import { z } from "zod";
import { sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { USER_LIMITS, userRateBump } from "../middleware/rate-limit";
import { db } from "../database";
import { MAX_EXAMS, berlinDay, cleanSubject, validExamDay } from "../lib/briefing";
import { briefingDeps, generateBriefing, readExamRows, type BriefingDb } from "../lib/generate-briefing";
import { missingTable } from "../lib/concept-mastery";

/**
 * « Dein Briefing » (2026-11-18) — voir lib/generate-briefing.ts.
 *
 *   today       le briefing du jour : lu dans le cache, généré s'il manque
 *   refresh     « Actualiser » : refait, dans la limite du jour
 *   examAdd     « Klausur hinzufügen » : une matière, une date
 *   examRemove  retire une date d'examen
 *   subjects    les Fächer du compte, proposés dans le champ « Fach »
 *
 * Tout est lu et écrit pour le compte de la session.
 */

const database = db as unknown as BriefingDb;
const deps = briefingDeps(database);
const localeInput = z.object({ locale: z.string().max(12).optional() });

export const briefing = {
  today: authed.input(localeInput).handler(({ context, input }) => generateBriefing(deps, context.user.id, input.locale ?? "de")),

  refresh: authed.input(localeInput).handler(async ({ context, input }) => {
    const uid = context.user.id;
    // Garde-fou contre un script : le plafond du jour est déjà dans generateBriefing.
    if ((await userRateBump(uid, USER_LIMITS.briefing())).limited) throw new ORPCError("TOO_MANY_REQUESTS", { message: "briefing_rate" });
    return generateBriefing(deps, uid, input.locale ?? "de", { force: true });
  }),

  examAdd: authed.input(z.object({ subject: z.string().max(200), date: z.string().max(10) })).handler(async ({ context, input }) => {
    const uid = context.user.id;
    if ((await userRateBump(uid, USER_LIMITS.briefing())).limited) throw new ORPCError("TOO_MANY_REQUESTS", { message: "briefing_rate" });
    const today = berlinDay(new Date());
    const subject = cleanSubject(input.subject);
    if (!subject) throw new ORPCError("BAD_REQUEST", { message: "exam_subject" });
    if (!validExamDay(input.date, today)) throw new ORPCError("BAD_REQUEST", { message: "exam_date" });

    const { migrated, exams } = await readExamRows(database, uid, today);
    if (!migrated) throw new ORPCError("PRECONDITION_FAILED", { message: "not_migrated" });
    if (exams.length >= MAX_EXAMS) throw new ORPCError("BAD_REQUEST", { message: "exam_limit" });
    // Deux fois la même matière le même jour : une seule ligne.
    if (exams.some((e) => e.day === input.date && e.subject.toLowerCase() === subject.toLowerCase())) return { ok: true as const };

    await database.run(sql`
      INSERT INTO exam_date (id, user_id, subject, exam_day, created_at)
      VALUES (${crypto.randomUUID()}, ${uid}, ${subject}, ${input.date}, ${Date.now()})`);
    // Les dates passées ne servent plus à rien : on les retire au passage.
    await database.run(sql`DELETE FROM exam_date WHERE user_id = ${uid} AND exam_day < ${today}`);
    return { ok: true as const };
  }),

  examRemove: authed.input(z.object({ id: z.string().min(1).max(64) })).handler(async ({ context, input }) => {
    try {
      await database.run(sql`DELETE FROM exam_date WHERE id = ${input.id} AND user_id = ${context.user.id}`);
    } catch (error) {
      if (!missingTable(error)) throw error;
    }
    return { ok: true as const };
  }),

  subjects: authed.handler(async ({ context }) => {
    const rows = await database.all<{ name: string }>(sql`
      SELECT name FROM subject WHERE user_id = ${context.user.id} GROUP BY name ORDER BY max(created_at) DESC LIMIT 30`);
    return { subjects: rows.map((r) => r.name) };
  }),
};
