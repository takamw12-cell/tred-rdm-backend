import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { authed } from "../middleware/auth";
import { db } from "../database";
import { document, semester, subject } from "../database/schema";

/**
 * Les Fächer — le niveau qui manquait entre le semestre et les documents.
 *
 * ── Toutes les routes vérifient le propriétaire ───────────────────────────
 *
 * `authed` dit qui appelle, pas ce qu'il possède. Chaque écriture recoupe donc
 * `userId` : sans cela, une requête forgée avec l'identifiant du Fach d'un
 * autre étudiant renommerait le sien. C'est la faute la plus banale et la plus
 * coûteuse d'une application multi-comptes.
 */

/**
 * Six teintes, pas une palette libre.
 *
 * Un sélecteur de couleur laisse choisir un gris sur fond gris, et il faudrait
 * alors gérer le contraste dans les deux thèmes. Six noms fixes, dont le rendu
 * est décidé côté interface, garantissent que chaque pastille reste lisible.
 */
export const SUBJECT_COLORS = [
  "slate",
  "blue",
  "green",
  "amber",
  "violet",
  "rose",
] as const;
export type SubjectColor = (typeof SUBJECT_COLORS)[number];

const MAX_NAME = 60;

/** Le semestre appartient-il bien à l'appelant ? */
async function ownsSemester(userId: string, semesterId: string): Promise<boolean> {
  const rows = await db
    .select({ id: semester.id })
    .from(semester)
    .where(and(eq(semester.id, semesterId), eq(semester.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export const subjects = {
  /**
   * Les Fächer d'un semestre, avec le nombre de documents de chacun.
   *
   * Le compte est fait ici et non par l'interface : sinon l'écran chargerait
   * tous les documents du semestre pour n'en afficher que le nombre.
   */
  list: authed
    .input(z.object({ semesterId: z.string() }))
    .handler(async ({ input, context }) => {
      const rows = await db
        .select()
        .from(subject)
        .where(
          and(
            eq(subject.semesterId, input.semesterId),
            eq(subject.userId, context.user.id),
          ),
        )
        .orderBy(asc(subject.position), asc(subject.createdAt));

      const counts = await db
        .select({
          subjectId: document.subjectId,
          n: sql<number>`count(*)`,
        })
        .from(document)
        .where(
          and(
            eq(document.semesterId, input.semesterId),
            eq(document.userId, context.user.id),
          ),
        )
        .groupBy(document.subjectId);

      const parSujet = new Map(counts.map((c) => [c.subjectId, Number(c.n)]));

      return {
        subjects: rows.map((r) => ({ ...r, documentCount: parSujet.get(r.id) ?? 0 })),
        /** Les documents du semestre encore sans Fach. C'est ce nombre qui
         *  justifie d'afficher une section « Nicht zugeordnet ». */
        unassigned: parSujet.get(null) ?? 0,
      };
    }),

  create: authed
    .input(
      z.object({
        semesterId: z.string(),
        name: z.string().trim().min(1).max(MAX_NAME),
        color: z.enum(SUBJECT_COLORS).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      if (!(await ownsSemester(context.user.id, input.semesterId))) {
        throw new ORPCError("NOT_FOUND", { message: "Semester nicht gefunden." });
      }

      // Le nouveau Fach se place à la fin. Compter suffit : l'ordre exact
      // n'a d'importance que relative, et deux créations simultanées par le
      // même étudiant n'existent pas.
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)` })
        .from(subject)
        .where(eq(subject.semesterId, input.semesterId));

      const id = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      await db.insert(subject).values({
        id,
        userId: context.user.id,
        semesterId: input.semesterId,
        name: input.name,
        color: input.color ?? "slate",
        position: Number(n),
      });

      return { id };
    }),

  rename: authed
    .input(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1).max(MAX_NAME).optional(),
        color: z.enum(SUBJECT_COLORS).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const champs: Record<string, unknown> = {};
      if (input.name !== undefined) champs.name = input.name;
      if (input.color !== undefined) champs.color = input.color;
      if (Object.keys(champs).length === 0) return { ok: true as const };

      await db
        .update(subject)
        .set(champs)
        .where(and(eq(subject.id, input.id), eq(subject.userId, context.user.id)));

      return { ok: true as const };
    }),

  /**
   * Supprime un Fach. **Les documents survivent.**
   *
   * Ils repassent en « non classé » dans le même semestre. Supprimer une
   * étagère ne doit pas brûler les livres : l'étudiant qui range mal ne
   * s'attend pas à perdre son script de cours, et rien dans le mot
   * « supprimer » appliqué à un Fach ne le laisse présager.
   */
  remove: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const res = await db
        .update(document)
        .set({ subjectId: null })
        .where(
          and(eq(document.subjectId, input.id), eq(document.userId, context.user.id)),
        );

      await db
        .delete(subject)
        .where(and(eq(subject.id, input.id), eq(subject.userId, context.user.id)));

      return {
        ok: true as const,
        /** Combien de documents sont retournés dans « non classé ». L'écran le
         *  dit à l'étudiant plutôt que de le laisser croire à une perte. */
        released: (res as unknown as { rowsAffected?: number }).rowsAffected ?? 0,
      };
    }),

  /**
   * Range des documents dans un Fach — ou les en sort avec `subjectId: null`.
   *
   * Plusieurs documents à la fois : ranger vingt fichiers un par un après un
   * semestre entier est le genre de tâche qu'on ne fait jamais.
   */
  assign: authed
    .input(
      z.object({
        documentIds: z.array(z.string()).min(1).max(200),
        subjectId: z.string().nullable(),
      }),
    )
    .handler(async ({ input, context }) => {
      // Le Fach visé doit appartenir à l'appelant. Sans ce contrôle, on
      // pourrait déplacer ses propres documents dans le Fach d'un autre.
      if (input.subjectId) {
        const rows = await db
          .select({ id: subject.id })
          .from(subject)
          .where(
            and(eq(subject.id, input.subjectId), eq(subject.userId, context.user.id)),
          )
          .limit(1);
        if (rows.length === 0) {
          throw new ORPCError("NOT_FOUND", { message: "Fach nicht gefunden." });
        }
      }

      let moved = 0;
      for (const documentId of input.documentIds) {
        const res = await db
          .update(document)
          .set({ subjectId: input.subjectId })
          .where(
            and(eq(document.id, documentId), eq(document.userId, context.user.id)),
          );
        moved += (res as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
      }

      return { moved };
    }),
};
