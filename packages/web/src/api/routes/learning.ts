import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { awardCreditsForStudy } from "../lib/study-rewards";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { USER_LIMITS, userRateBump } from "../middleware/rate-limit";
import { db } from "../database";
import { document } from "../database/schema";
import { weakestConcepts, type MasteryDb } from "../lib/concept-mastery";
import { readLearningStyle } from "../lib/learning-style-store";
import { MAX_PLAN_CONCEPTS, buildStudyPlan, conceptPages, learnerProfile, searchTerm, type PlanConcept, type PlanDoc } from "../lib/learning-profile";

/**
 * « Mein Lernprofil » (2026-11-16) — voir lib/learning-profile.ts.
 *
 *   profile  forces et faiblesses par matière, concepts les plus sûrs et les
 *            plus fragiles, erreurs typiques, style d'apprentissage
 *   plan     le plan de révision sur 7 jours, avec les pages des documents
 *            de l'étudiant où chaque concept est écrit
 *
 * Tout est lu pour le compte de la session. Le plan est CALCULÉ : aucun
 * modèle de langage n'est appelé, donc aucun coût et aucune page inventée.
 * Il n'est pas enregistré côté serveur — le navigateur le garde pour la
 * semaine (web/lib/study-plan.ts).
 */

/** Documents relus par concept : assez pour trouver le cours, sans charger une bibliothèque entière. */
const DOCS_PER_CONCEPT = 4;

/** `instr()` est sensible à la casse : on lui donne les orthographes courantes (comme routes/search.ts). */
function spellings(term: string): string[] {
  return [...new Set([term, term.toLowerCase(), term.toUpperCase(), term.charAt(0).toUpperCase() + term.slice(1).toLowerCase()])];
}

/** Les documents de CE compte qui contiennent le mot : le cours d'abord, puis les plus récents. */
async function documentIdsFor(uid: string, term: string): Promise<string[]> {
  const contains = sql.join(
    spellings(term).map((v) => sql`instr(${document.textContent}, ${v}) > 0`),
    sql` OR `,
  );
  const rows = await db
    .select({ id: document.id })
    .from(document)
    .where(and(eq(document.userId, uid), sql`(${contains})`))
    .orderBy(sql`CASE ${document.kind} WHEN 'vorlesung' THEN 0 WHEN 'uebung' THEN 1 WHEN 'klausur' THEN 3 ELSE 2 END`, desc(document.createdAt))
    .limit(DOCS_PER_CONCEPT);
  return rows.map((r) => r.id);
}

export const learning = {
  /**
   * « Erledigt » coché dans le plan d'étude : +0,5 crédit si le concept a bien
   * été travaillé avec le tuteur (lib/study-rewards.ts). Un refus n'est pas une
   * erreur : l'interface affiche la raison (déjà récompensé, plafond du jour…).
   */
  completeTask: authed.input(z.object({ concept: z.string().min(1).max(160) })).handler(({ context, input }) => awardCreditsForStudy(db, context.user.id, "chapter_completed", input.concept)),

  profile: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    try {
      const [profile, learningStyle] = await Promise.all([learnerProfile(db as unknown as MasteryDb, uid), readLearningStyle(uid)]);
      return { ...profile, learningStyle };
    } catch (err) {
      // Le tableau de bord ne tombe pas pour un profil illisible : la section se masque.
      console.error("[lernprofil]", (err as Error).message);
      return { available: false as const, subjects: [], strengths: [], weaknesses: [], errorTypes: [], totals: { concepts: 0, attempts: 0 }, learningStyle: null };
    }
  }),

  plan: authed.handler(async ({ context }) => {
    const uid = context.user.id;
    if ((await userRateBump(uid, USER_LIMITS.studyPlan())).limited) throw new ORPCError("TOO_MANY_REQUESTS", { message: "study_plan_rate" });

    const weak = await weakestConcepts(db as unknown as MasteryDb, uid, MAX_PLAN_CONCEPTS);
    if (weak.length === 0) return { plan: null };

    // 1. Pour chaque concept, les documents du compte qui contiennent son mot le plus long.
    const idsByConcept = await Promise.all(
      weak.map(async (w) => {
        const term = searchTerm(w.concept);
        return term ? documentIdsFor(uid, term).catch(() => [] as string[]) : [];
      }),
    );

    // 2. Leur texte, une seule fois par document.
    const wanted = [...new Set(idsByConcept.flat())];
    const texts: PlanDoc[] = wanted.length
      ? await db
          .select({ id: document.id, title: document.title, kind: document.kind, textContent: document.textContent })
          .from(document)
          .where(and(eq(document.userId, uid), inArray(document.id, wanted)))
      : [];
    const byId = new Map(texts.map((d) => [d.id, d]));

    // 3. Les pages où le concept est réellement écrit — ou aucune.
    const concepts: PlanConcept[] = weak.map((w, i) => ({
      concept: w.concept,
      topic: w.topic,
      score: w.score,
      errors: w.errors,
      refs: conceptPages(
        idsByConcept[i]!.map((id) => byId.get(id)).filter((d): d is PlanDoc => Boolean(d)),
        w.concept,
      ),
    }));

    const plan = buildStudyPlan(concepts);
    return { plan: plan ? { ...plan, createdAt: Date.now() } : null };
  }),
};
