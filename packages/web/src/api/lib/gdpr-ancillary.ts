import { eq, inArray, sql } from "drizzle-orm";
import type { db as appDb } from "../database";
import { avatarUsage, courseMember, feedback, sharedKnowledge, sharedKnowledgeVote, userNotification } from "../database/schema";
import { anonymize } from "./shared-knowledge";

/**
 * RGPD — les six tables secondaires oubliées par la routine d'origine.
 * Décisions du fondateur (11 novembre 2026) :
 *
 *   ANONYMISATION (le contenu reste, le lien vers le compte disparaît)
 *     shared_knowledge   contributor_id → NULL : l'explication partagée reste
 *                        utile aux autres étudiants du cours.
 *     feedback           user_id → « anonymous », user_agent vidé, et le
 *                        texte repassé au filtre d'anonymisation (e-mail,
 *                        téléphone, matricule, lien, prénom annoncé) : le
 *                        retour sert à améliorer TRED, plus rien ne mène au
 *                        compte. Le filtre s'applique aussi dès l'envoi
 *                        (routes/feedback.ts) ; ici il rattrape les anciens.
 *
 *   SUPPRESSION (droit à l'oubli)
 *     course_member, avatar_usage, shared_knowledge_vote, user_notifications
 *     Avant d'effacer les votes, le compteur `upvotes` des explications
 *     concernées est décrémenté : le total reste égal au nombre de votes.
 *
 * La base est passée en paramètre : tests/gdpr-ancillary.test.ts exécute ces
 * requêtes sur une vraie base SQLite en mémoire, sans toucher à Turso.
 */

type Db = typeof appDb;

/** `feedback.user_id` est NOT NULL : on y met ce marqueur, qui n'est l'id d'aucun compte. */
export const ANONYMOUS_USER_ID = "anonymous";

/** Les étapes d'effacement, dans l'ordre : [nom affiché dans le rapport, requête]. */
export function ancillaryErasureSteps(database: Db, userId: string): [label: string, run: () => Promise<unknown>][] {
  return [
    [
      "feedback (anonymisé)",
      async () => {
        // Ligne par ligne : le texte de chacune passe au filtre.
        const rows = await database.select({ id: feedback.id, message: feedback.message }).from(feedback).where(eq(feedback.userId, userId));
        for (const row of rows) {
          await database
            .update(feedback)
            .set({ userId: ANONYMOUS_USER_ID, userAgent: "", message: anonymize(row.message) })
            .where(eq(feedback.id, row.id));
        }
        return { rowsAffected: rows.length };
      },
    ],
    [
      "shared_knowledge (anonymisé)",
      () => database.update(sharedKnowledge).set({ contributorId: null }).where(eq(sharedKnowledge.contributorId, userId)),
    ],
    ["course_member", () => database.delete(courseMember).where(eq(courseMember.userId, userId))],
    ["avatar_usage", () => database.delete(avatarUsage).where(eq(avatarUsage.userId, userId))],
    [
      // AVANT la suppression des votes : sinon on ne sait plus lesquels décompter.
      "shared_knowledge (upvotes)",
      () =>
        database
          .update(sharedKnowledge)
          .set({ upvotes: sql`max(${sharedKnowledge.upvotes} - 1, 0)` })
          .where(
            inArray(
              sharedKnowledge.id,
              database.select({ id: sharedKnowledgeVote.knowledgeId }).from(sharedKnowledgeVote).where(eq(sharedKnowledgeVote.userId, userId)),
            ),
          ),
    ],
    ["shared_knowledge_vote", () => database.delete(sharedKnowledgeVote).where(eq(sharedKnowledgeVote.userId, userId))],
    ["user_notifications", () => database.delete(userNotification).where(eq(userNotification.userId, userId))],
  ];
}

/**
 * Ces mêmes tables, pour l'export (art. 15 et 20). Les identifiants internes
 * qui ne disent rien à l'étudiant (son propre user_id, répété sur chaque
 * ligne) sont retirés. Une table absente d'une base ne fait pas échouer l'export.
 */
export async function exportAncillaryData(database: Db, userId: string) {
  const optional = <T>(query: Promise<T[]>): Promise<T[]> => query.catch(() => []);
  const [feedbacks, contributions, memberships, avatar, votes, notifications] = await Promise.all([
    optional(database.select().from(feedback).where(eq(feedback.userId, userId))),
    optional(database.select().from(sharedKnowledge).where(eq(sharedKnowledge.contributorId, userId))),
    optional(database.select().from(courseMember).where(eq(courseMember.userId, userId))),
    optional(database.select().from(avatarUsage).where(eq(avatarUsage.userId, userId))),
    optional(database.select().from(sharedKnowledgeVote).where(eq(sharedKnowledgeVote.userId, userId))),
    optional(database.select().from(userNotification).where(eq(userNotification.userId, userId))),
  ]);
  return {
    feedback: feedbacks.map(({ userId: _u, ...rest }) => rest),
    geteiltesWissen: contributions.map(({ contributorId: _c, ...rest }) => rest),
    kursMitgliedschaften: memberships.map(({ userId: _u, ...rest }) => rest),
    avatarNutzung: avatar.map(({ userId: _u, ...rest }) => rest),
    wissenStimmen: votes.map(({ userId: _u, ...rest }) => rest),
    benachrichtigungen: notifications.map(({ userId: _u, ...rest }) => rest),
  };
}
