import { z } from "zod";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { chatConversation, chatMessage } from "../database/schema";

const messageInput = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

export const chats = {
  // List the user's saved conversations, most recently updated first.
  list: authed.handler(async ({ context }) => {
    const rows = await db
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
      .orderBy(desc(chatConversation.updatedAt));
    return rows;
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
    .input(z.object({ id: z.string() }))
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
      const msgs = await db
        .select()
        .from(chatMessage)
        .where(eq(chatMessage.conversationId, input.id))
        .orderBy(asc(chatMessage.createdAt));
      return { conversation: conv[0], messages: msgs };
    }),

  // Upsert a conversation and replace its message list with the given snapshot.
  // The client owns the conversation id (a UUID) so saves are idempotent.
  save: authed
    .input(
      z.object({
        id: z.string(),
        title: z.string().max(200).optional(),
        semesterId: z.string().nullish(),
        documentId: z.string().nullish(),
        documentTitle: z.string().nullish(),
        lang: z.string().max(5).optional(),
        messages: z.array(messageInput).max(500),
      }),
    )
    .handler(async ({ input, context }) => {
      const now = new Date();
      const existing = await db
        .select({ id: chatConversation.id })
        .from(chatConversation)
        .where(
          and(
            eq(chatConversation.id, input.id),
            eq(chatConversation.userId, context.user.id),
          ),
        )
        .limit(1);

      const title = (input.title?.trim() || "Neue Unterhaltung").slice(0, 200);

      if (existing[0]) {
        await db
          .update(chatConversation)
          .set({
            title,
            semesterId: input.semesterId ?? null,
            documentId: input.documentId ?? null,
            documentTitle: input.documentTitle ?? null,
            lang: input.lang ?? "de",
            updatedAt: now,
          })
          .where(eq(chatConversation.id, input.id));
      } else {
        await db.insert(chatConversation).values({
          id: input.id,
          userId: context.user.id,
          title,
          semesterId: input.semesterId ?? null,
          documentId: input.documentId ?? null,
          documentTitle: input.documentTitle ?? null,
          lang: input.lang ?? "de",
          createdAt: now,
          updatedAt: now,
        });
      }

      // Replace messages wholesale — snapshot semantics keep it simple.
      await db.delete(chatMessage).where(eq(chatMessage.conversationId, input.id));
      if (input.messages.length > 0) {
        const base = now.getTime();
        await db.insert(chatMessage).values(
          input.messages.map((m, i) => ({
            id: crypto.randomUUID(),
            conversationId: input.id,
            role: m.role,
            content: m.content,
            // Preserve order via monotonically increasing timestamps.
            createdAt: new Date(base + i),
          })),
        );
      }
      return { id: input.id };
    }),

  // Soft-delete: move a conversation to the trash. Messages are kept so it can
  // be fully restored later.
  remove: authed
    .input(z.object({ id: z.string() }))
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
    .input(z.object({ id: z.string() }))
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
    .input(z.object({ id: z.string() }))
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
