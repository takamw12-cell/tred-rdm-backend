import { z } from "zod";
import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { authed } from "../middleware/auth";
import { db } from "../database";
import { course, courseMember, document } from "../database/schema";

/**
 * Les cours partagés.
 *
 * ── Le problème mesuré ────────────────────────────────────────────────────
 *
 * Treize comptes, onze n'ayant jamais déposé un seul document. Un nouvel
 * inscrit arrivait devant un tableau de bord vide : rien à lire, donc rien à
 * demander, donc aucune raison de revenir. Aucun écran d'accueil ne répare ça,
 * parce que ce n'est pas un problème d'explication — il n'y a réellement rien.
 *
 * À la FH Aachen, tous les étudiants d'une même Vorlesung ont le même Skript.
 * Le premier qui le dépose rend l'application utile pour les trente suivants.
 *
 * ── Ce que ces routes garantissent ────────────────────────────────────────
 *
 * Un document partagé reste la propriété de celui qui l'a déposé. `share` ne
 * copie rien : il bascule `visibility`. `unshare` le remet à "private" et le
 * document disparaît de la bibliothèque à l'instant même, pour tout le monde.
 * C'est la seule construction dans laquelle un retrait est certain — et un
 * polycopié de cours est une œuvre protégée, donc le retrait doit l'être.
 *
 * Personne ne peut partager le document d'un autre, ni retirer celui d'un
 * autre : chaque écriture recoupe `document.userId`.
 */

const MAX_NOM = 80;
const MAX_UNIVERSITE = 120;

/**
 * L'identité réelle d'un cours.
 *
 * Sans normalisation, « Elektrotechnik 2 », « elektrotechnik 2 » et
 * « Elektrotechnik  2 » feraient trois cours d'un membre chacun : le partage
 * n'aurait jamais lieu et le problème resterait entier, en donnant l'illusion
 * du contraire.
 *
 * On enlève les accents (NFD puis suppression des diacritiques), on abaisse la
 * casse, on réduit toute suite de caractères non alphanumériques à un tiret.
 * « Elektrotechnik II » et « Elektrotechnik 2 » restent DEUX cours : les
 * confondre demanderait de comprendre les chiffres romains dans un nom libre,
 * et fusionner à tort deux cours différents est bien pire que d'en avoir deux.
 */
export function normalizeCourseKey(university: string, name: string): string {
  const nettoie = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${nettoie(university)}/${nettoie(name)}`;
}

/** Les cours de l'appelant. Utilisé partout, d'où la fonction. */
export async function myCourseIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ courseId: courseMember.courseId })
    .from(courseMember)
    .where(eq(courseMember.userId, userId));
  return rows.map((r) => r.courseId);
}

/** L'appelant est-il membre de ce cours ? */
async function estMembre(userId: string, courseId: string): Promise<boolean> {
  const rows = await db
    .select({ userId: courseMember.userId })
    .from(courseMember)
    .where(and(eq(courseMember.courseId, courseId), eq(courseMember.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export const courses = {
  /**
   * Les cours que je suis, avec ce qu'il y a dedans.
   *
   * Le nombre de documents est ce qui décide si un étudiant rejoint : « 14
   * documents » et « 0 document » ne se rejoignent pas de la même façon.
   */
  mine: authed.handler(async ({ context }) => {
    const ids = await myCourseIds(context.user.id);
    if (ids.length === 0) return [];

    const [lignes, comptes, membres] = await Promise.all([
      db.select().from(course).where(inArray(course.id, ids)),
      db
        .select({ courseId: document.courseId, n: sql<number>`count(*)` })
        .from(document)
        .where(and(inArray(document.courseId, ids), eq(document.visibility, "course")))
        .groupBy(document.courseId),
      db
        .select({ courseId: courseMember.courseId, n: sql<number>`count(*)` })
        .from(courseMember)
        .where(inArray(courseMember.courseId, ids))
        .groupBy(courseMember.courseId),
    ]);

    const docs = new Map(comptes.map((c) => [c.courseId, Number(c.n)]));
    const gens = new Map(membres.map((m) => [m.courseId, Number(m.n)]));

    return lignes.map((c) => ({
      id: c.id,
      name: c.name,
      university: c.university,
      program: c.program,
      documentCount: docs.get(c.id) ?? 0,
      memberCount: gens.get(c.id) ?? 0,
    }));
  }),

  /**
   * Chercher un cours à rejoindre.
   *
   * Trié par nombre de documents décroissant : un cours vide et un cours
   * fourni portent souvent des noms voisins, et c'est celui qui contient
   * quelque chose qu'il faut rejoindre. Sans ce tri, le partage se disperse
   * entre plusieurs cours quasi identiques.
   */
  search: authed
    .input(
      z.object({
        q: z.string().trim().min(1).max(MAX_NOM),
        university: z.string().trim().max(MAX_UNIVERSITE).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const motif = `%${input.q.toLowerCase()}%`;
      const conditions = [sql`lower(${course.name}) like ${motif}`];
      if (input.university?.trim()) {
        conditions.push(like(course.university, `%${input.university.trim()}%`));
      }

      const lignes = await db
        .select()
        .from(course)
        .where(and(...conditions))
        .limit(20);

      if (lignes.length === 0) return [];
      const ids = lignes.map((c) => c.id);

      const [comptes, miens] = await Promise.all([
        db
          .select({ courseId: document.courseId, n: sql<number>`count(*)` })
          .from(document)
          .where(and(inArray(document.courseId, ids), eq(document.visibility, "course")))
          .groupBy(document.courseId),
        db
          .select({ courseId: courseMember.courseId })
          .from(courseMember)
          .where(
            and(
              inArray(courseMember.courseId, ids),
              eq(courseMember.userId, context.user.id),
            ),
          ),
      ]);

      const docs = new Map(comptes.map((c) => [c.courseId, Number(c.n)]));
      const dejaMembre = new Set(miens.map((m) => m.courseId));

      return lignes
        .map((c) => ({
          id: c.id,
          name: c.name,
          university: c.university,
          program: c.program,
          documentCount: docs.get(c.id) ?? 0,
          joined: dejaMembre.has(c.id),
        }))
        .sort((a, b) => b.documentCount - a.documentCount);
    }),

  /**
   * Créer un cours, ou rejoindre celui qui existe déjà sous ce nom.
   *
   * Volontairement idempotent. Deux étudiants qui tapent le même nom à trois
   * secondes d'intervalle doivent atterrir dans le MÊME cours : c'est tout
   * l'objet de la clé normalisée. En cas de collision sur l'unicité, on relit
   * la ligne du gagnant plutôt que de renvoyer une erreur — l'utilisateur, lui,
   * a simplement demandé à suivre un cours.
   */
  create: authed
    .input(
      z.object({
        name: z.string().trim().min(2).max(MAX_NOM),
        university: z.string().trim().min(2).max(MAX_UNIVERSITE),
        program: z.string().trim().max(MAX_NOM).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const key = normalizeCourseKey(input.university, input.name);

      const existant = await db
        .select()
        .from(course)
        .where(eq(course.normalizedKey, key))
        .limit(1);

      let ligne = existant[0];
      if (!ligne) {
        const id = crypto.randomUUID();
        await db
          .insert(course)
          .values({
            id,
            normalizedKey: key,
            name: input.name,
            university: input.university,
            program: input.program ?? null,
            createdBy: context.user.id,
          })
          .onConflictDoNothing();

        const relu = await db
          .select()
          .from(course)
          .where(eq(course.normalizedKey, key))
          .limit(1);
        ligne = relu[0];
        if (!ligne) throw new ORPCError("INTERNAL_SERVER_ERROR");
      }

      await db
        .insert(courseMember)
        .values({ courseId: ligne.id, userId: context.user.id })
        .onConflictDoNothing();

      return { id: ligne.id, name: ligne.name, university: ligne.university };
    }),

  /** Rejoindre un cours existant. Sans effet si on en est déjà membre. */
  join: authed
    .input(z.object({ courseId: z.string().max(128).min(1) }))
    .handler(async ({ input, context }) => {
      const existe = await db
        .select({ id: course.id })
        .from(course)
        .where(eq(course.id, input.courseId))
        .limit(1);
      if (!existe[0]) throw new ORPCError("NOT_FOUND");

      await db
        .insert(courseMember)
        .values({ courseId: input.courseId, userId: context.user.id })
        .onConflictDoNothing();
      return { ok: true as const };
    }),

  /**
   * Quitter un cours.
   *
   * Les documents que l'on y avait partagés RESTENT partagés. C'est le
   * comportement attendu d'une bibliothèque commune : partir d'un cours à la
   * fin du semestre ne doit pas vider le cours pour ceux qui y sont encore.
   * Pour retirer ses documents, il y a `unshare`, qui le dit.
   */
  leave: authed
    .input(z.object({ courseId: z.string().max(128).min(1) }))
    .handler(async ({ input, context }) => {
      await db
        .delete(courseMember)
        .where(
          and(
            eq(courseMember.courseId, input.courseId),
            eq(courseMember.userId, context.user.id),
          ),
        );
      return { ok: true as const };
    }),

  /** Les documents partagés d'un cours dont je suis membre. */
  documents: authed
    .input(z.object({ courseId: z.string().max(128).min(1) }))
    .handler(async ({ input, context }) => {
      if (!(await estMembre(context.user.id, input.courseId))) {
        throw new ORPCError("FORBIDDEN");
      }

      const lignes = await db
        .select({
          id: document.id,
          title: document.title,
          kind: document.kind,
          pageCount: document.pageCount,
          createdAt: document.createdAt,
          userId: document.userId,
        })
        .from(document)
        .where(
          and(eq(document.courseId, input.courseId), eq(document.visibility, "course")),
        )
        .orderBy(desc(document.createdAt))
        .limit(200);

      return lignes.map((d) => ({
        id: d.id,
        title: d.title,
        kind: d.kind,
        pageCount: d.pageCount,
        createdAt: d.createdAt,
        /** L'ai-je déposé moi-même ? Seul le déposant peut le retirer. */
        mine: d.userId === context.user.id,
      }));
    }),

  /**
   * Mes documents pas encore partagés — ce que je peux apporter au cours.
   *
   * Volontairement placé ICI et non dans la bibliothèque personnelle : on
   * partage depuis le cours où l'on veut déposer, pas depuis une liste où il
   * faudrait ensuite choisir la destination dans un menu. Un geste, une
   * intention.
   */
  shareable: authed.handler(async ({ context }) => {
    const lignes = await db
      .select({
        id: document.id,
        title: document.title,
        kind: document.kind,
        pageCount: document.pageCount,
      })
      .from(document)
      .where(
        and(eq(document.userId, context.user.id), eq(document.visibility, "private")),
      )
      .orderBy(desc(document.createdAt))
      .limit(100);
    return lignes;
  }),

  /** Publier un de MES documents dans un cours dont je suis membre.
   *
   * Les deux vérifications comptent autant l'une que l'autre : la première
   * empêche de partager le document d'un autre, la seconde de déposer dans un
   * cours que l'on ne suit pas.
   */
  share: authed
    .input(z.object({ documentId: z.string().max(128).min(1), courseId: z.string().max(128).min(1) }))
    .handler(async ({ input, context }) => {
      const mien = await db
        .select({ id: document.id })
        .from(document)
        .where(
          and(eq(document.id, input.documentId), eq(document.userId, context.user.id)),
        )
        .limit(1);
      if (!mien[0]) throw new ORPCError("NOT_FOUND");

      if (!(await estMembre(context.user.id, input.courseId))) {
        throw new ORPCError("FORBIDDEN");
      }

      await db
        .update(document)
        .set({ courseId: input.courseId, visibility: "course" })
        .where(
          and(eq(document.id, input.documentId), eq(document.userId, context.user.id)),
        );
      return { ok: true as const };
    }),

  /**
   * Retirer un document du partage. Immédiat, et pour tout le monde.
   *
   * `courseId` est conservé : remettre le document en ligne ne demandera pas
   * de le reclasser. C'est aussi ce qui rend le retrait sûr — rien n'est perdu,
   * donc rien n'empêche de le faire au premier doute.
   */
  unshare: authed
    .input(z.object({ documentId: z.string().max(128).min(1) }))
    .handler(async ({ input, context }) => {
      const res = await db
        .update(document)
        .set({ visibility: "private" })
        .where(
          and(eq(document.id, input.documentId), eq(document.userId, context.user.id)),
        );
      const touche = (res as unknown as { rowsAffected?: number }).rowsAffected ?? 0;
      if (touche === 0) throw new ORPCError("NOT_FOUND");
      return { ok: true as const };
    }),
};
