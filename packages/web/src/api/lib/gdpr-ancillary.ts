import { eq } from "drizzle-orm";
import type { db as appDb } from "../database";
import { avatarUsage, courseMember, feedback, sharedKnowledge, sharedKnowledgeVote, userNotification } from "../database/schema";

/**
 * RGPD — les six tables secondaires oubliées par la routine d'origine.
 * Décisions du fondateur (11 novembre 2026) :
 *
 *   ANONYMISATION (le contenu reste, le lien vers le compte disparaît)
 *     shared_knowledge   contributor_id → NULL : l'explication partagée reste
 *                        utile aux autres étudiants du cours.
 *     feedback           user_id → « anonymous », user_agent vidé : le retour
 *                        sert à améliorer TRED, plus rien ne mène au compte.
 *
 *   SUPPRESSION (droit à l'oubli)
 *     course_member, avatar_usage, shared_knowledge_vote, user_notifications
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
      () => database.update(feedback).set({ userId: ANONYMOUS_USER_ID, userAgent: "" }).where(eq(feedback.userId, userId)),
    ],
    [
      "shared_knowledge (anonymisé)",
      () => database.update(sharedKnowledge).set({ contributorId: null }).where(eq(sharedKnowledge.contributorId, userId)),
    ],
    ["course_member", () => database.delete(courseMember).where(eq(courseMember.userId, userId))],
    ["avatar_usage", () => database.delete(avatarUsage).where(eq(avatarUsage.userId, userId))],
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
