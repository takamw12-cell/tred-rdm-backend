import { z } from "zod";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { chatConversation, chatMessage } from "../database/schema";
import { conversationMessages, conversationSubjects, saveConversation, sessionForScope } from "../lib/chat-sessions";

const messageInput = z.object({
  role: z.enum(["user", "assistant"]),
  // Une réponse avec schémas SVG pèse quelques dizaines de Ko : 200 000 laisse
  // une large marge et refuse proprement (400) un envoi absurde.
  content: z.string().max(200_000),
});
/** Plafond d'une conversation entière, tous messages confondus. */
const MAX_CONVERSATION_CHARS = 4_000_000;

export const chats = {
  // List the user's saved conversations, most recently updated first.
  list: authed.handler(async ({ context }) => {
    // Le module (Fach) sous lequel chaque conversation a été tenue : le tiroir
    // d'historique ne montre que celles de la portée ouverte. Colonne hors
    // schéma, lue à part (lib/chat-sessions.ts) — vide tant que la migration
    // n'a pas tourné. Les deux lectures partent ensemble.
    const [rows, subjects] = await Promise.all([
      db
      .select({
        id: chatConversation.id,
        title: chatConversation.title,
        semesterId: chatConversation.semesterId,
        documentId: chatConversation.documentId,
        documentTitle: chatConversation.documentTitle,
        lang: chatConversation.lang,
        updatedAt: chatConversation.updatedAt,
      })
      .from(chatConversation)
      .where(
        and(
          eq(chatConversation.userId, context.user.id),
          isNull(chatConversation.deletedAt),
        ),
      )
      .orderBy(desc(chatConversation.updatedAt)),
      conversationSubjects(db, context.user.id),
    ]);
    return rows.map((r) => ({ ...r, subjectId: subjects.get(r.id) ?? null }));
  }),

  // List trashed conversations (soft-deleted), most recently deleted first.
  listTrash: authed.handler(async ({ context }) => {
    const rows = await db
      .select({
        id: chatConversation.id,
        title: chatConversation.title,
        semesterId: chatConversation.semesterId,
        documentId: chatConversation.documentId,
        documentTitle: chatConversation.documentTitle,
        lang: chatConversation.lang,
        updatedAt: chatConversation.updatedAt,
        deletedAt: chatConversation.deletedAt,
      })
      .from(chatConversation)
      .where(
        and(
          eq(chatConversation.userId, context.user.id),
          isNotNull(chatConversation.deletedAt),
        ),
      )
      .orderBy(desc(chatConversation.deletedAt));
    return rows;
  }),

  // Load one conversation with its messages (ownership enforced).
  get: authed
    .input(z.object({ id: z.string().max(128) }))
    .handler(async ({ input, context }) => {
      const conv = await db
        .select()
        .from(chatConversation)
        .where(
          and(
            eq(chatConversation.id, input.id),
            eq(chatConversation.userId, context.user.id),
          ),
        )
        .limit(1);
      if (!conv[0]) return null;
      const [msgs, subjects] = await Promise.all([conversationMessages(db, input.id), conversationSubjects(db, context.user.id)]);
      // `subjectId` : rouvrir une conversation remet le sélecteur de module où elle a été tenue.
      return { conversation: { ...conv[0], subjectId: subjects.get(input.id) ?? null }, messages: msgs };
    }),

  // La session d'une portée — un document, un module (Fach) ou « Ganzes
  // Semester » : sa dernière conversation et ses messages
  // (lib/chat-sessions.ts). Le compte est celui de la session HTTP ; le
  // document d'un autre compte ne rend rien. Rien n'est créé : une portée sans
  // conversation rend `conversation: null`.
  forScope: authed
    .input(
      z.object({
        documentId: z.string().max(128).nullable(),
        semesterId: z.string().max(128).nullish(),
        subjectId: z.string().max(128).nullish(),
      }),
    )
    .handler(({ input, context }) =>
      sessionForScope(db, context.user.id, {
        documentId: input.documentId,
        semesterId: input.semesterId ?? null,
        subjectId: input.subjectId ?? null,
      }),
    ),

  // Upsert a conversation and replace its message list with the given snapshot.
  // The client owns the conversation id (a UUID) so saves are idempotent.
  save: authed
    .input(
      z.object({
        id: z.string().max(128),
        title: z.string().max(200).optional(),
        semesterId: z.string().max(128).nullish(),
        /** Le module (Fach) sous lequel la conversation est tenue ; écrit à la création seulement. */
        subjectId: z.string().max(128).nullish(),
        documentId: z.string().max(128).nullish(),
        documentTitle: z.string().max(500).nullish(),
        lang: z.string().max(5).optional(),
        messages: z
          .array(messageInput)
          .max(500)
          .refine((ms) => ms.reduce((n, m) => n + m.content.length, 0) <= MAX_CONVERSATION_CHARS, {
            message: "Unterhaltung zu lang.",
          }),
      }),
    )
    .handler(async ({ input, context }) => {
      // Création ou remplacement des messages — et une conversation déjà
      // enregistrée garde SON document (lib/chat-sessions.ts).
      const saved = await saveConversation(db, context.user.id, input).catch((error: unknown) => {
        if (error instanceof Error && error.message === "NOT_OWNER") throw new ORPCError("FORBIDDEN");
        throw error;
      });
      // Un client qui annonce une autre portée que celle de la conversation
      // (app mobile ancienne, onglet en retard) : on le voit dans les journaux.
      if (saved.scopeKept) console.warn(`[chats] ${input.id} : portée d'origine gardée`);
      return { id: saved.id };
    }),

  // Soft-delete: move a conversation to the trash. Messages are kept so it can
  // be fully restored later.
  remove: authed
    .input(z.object({ id: z.string().max(128) }))
    .handler(async ({ input, context }) => {
      const owned = await db
        .select({ id: chatConversation.id })
        .from(chatConversation)
        .where(
          and(
            eq(chatConversation.id, input.id),
            eq(chatConversation.userId, context.user.id),
          ),
        )
        .limit(1);
      if (!owned[0]) return { ok: false };
      await db
        .update(chatConversation)
        .set({ deletedAt: new Date() })
        .where(eq(chatConversation.id, input.id));
      return { ok: true };
    }),

  // Restore a conversation from the trash back into the active list.
  restore: authed
    .input(z.object({ id: z.string().max(128) }))
    .handler(async ({ input, context }) => {
      const owned = await db
        .select({ id: chatConversation.id })
        .from(chatConversation)
        .where(
          and(
            eq(chatConversation.id, input.id),
            eq(chatConversation.userId, context.user.id),
          ),
        )
        .limit(1);
      if (!owned[0]) return { ok: false };
      await db
        .update(chatConversation)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(eq(chatConversation.id, input.id));
      return { ok: true };
    }),

  // Permanently delete a single conversation (only allowed from the trash).
  purge: authed
    .input(z.object({ id: z.string().max(128) }))
    .handler(async ({ input, context }) => {
      const owned = await db
        .select({ id: chatConversation.id })
        .from(chatConversation)
        .where(
          and(
            eq(chatConversation.id, input.id),
            eq(chatConversation.userId, context.user.id),
            isNotNull(chatConversation.deletedAt),
          ),
        )
        .limit(1);
      if (!owned[0]) return { ok: false };
      await db.delete(chatMessage).where(eq(chatMessage.conversationId, input.id));
      await db.delete(chatConversation).where(eq(chatConversation.id, input.id));
      return { ok: true };
    }),

  // Soft-delete several conversations at once (bulk "move to trash").
  removeMany: authed
    .input(z.object({ ids: z.array(z.string()).max(500) }))
    .handler(async ({ input, context }) => {
      if (input.ids.length === 0) return { ok: true, count: 0 };
      await db
        .update(chatConversation)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(chatConversation.userId, context.user.id),
            inArray(chatConversation.id, input.ids),
          ),
        );
      return { ok: true, count: input.ids.length };
    }),

  // Restore several conversations from the trash at once.
  restoreMany: authed
    .input(z.object({ ids: z.array(z.string()).max(500) }))
    .handler(async ({ input, context }) => {
      if (input.ids.length === 0) return { ok: true, count: 0 };
      await db
        .update(chatConversation)
        .set({ deletedAt: null, updatedAt: new Date() })
        .where(
          and(
            eq(chatConversation.userId, context.user.id),
            inArray(chatConversation.id, input.ids),
          ),
        );
      return { ok: true, count: input.ids.length };
    }),

  // Permanently delete several trashed conversations at once.
  purgeMany: authed
    .input(z.object({ ids: z.array(z.string()).max(500) }))
    .handler(async ({ input, context }) => {
      if (input.ids.length === 0) return { ok: true, count: 0 };
      const owned = await db
        .select({ id: chatConversation.id })
        .from(chatConversation)
        .where(
          and(
            eq(chatConversation.userId, context.user.id),
            inArray(chatConversation.id, input.ids),
            isNotNull(chatConversation.deletedAt),
          ),
        );
      const ids = owned.map((r) => r.id);
      if (ids.length === 0) return { ok: true, count: 0 };
      await db.delete(chatMessage).where(inArray(chatMessage.conversationId, ids));
      await db.delete(chatConversation).where(inArray(chatConversation.id, ids));
      return { ok: true, count: ids.length };
    }),

  // Permanently delete every trashed conversation for the user.
  emptyTrash: authed.handler(async ({ context }) => {
    const trashed = await db
      .select({ id: chatConversation.id })
      .from(chatConversation)
      .where(
        and(
          eq(chatConversation.userId, context.user.id),
          isNotNull(chatConversation.deletedAt),
        ),
      );
    for (const row of trashed) {
      await db.delete(chatMessage).where(eq(chatMessage.conversationId, row.id));
      await db.delete(chatConversation).where(eq(chatConversation.id, row.id));
    }
    return { ok: true, count: trashed.length };
  }),
};
