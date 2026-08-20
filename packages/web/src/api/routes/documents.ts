import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { document } from "../database/schema";
import { s3, S3_BUCKET } from "../lib/s3";

const KIND = z.enum(["vorlesung", "uebung", "klausur", "other"]);

// Cap stored text so a single huge PDF can't blow up the row / context window.
const MAX_CHARS = 400_000;

export const documents = {
  list: authed
    .input(z.object({ semesterId: z.string().nullable().optional() }).optional())
    .handler(async ({ input, context }) => {
      const filters = [eq(document.userId, context.user.id)];
      if (input?.semesterId) filters.push(eq(document.semesterId, input.semesterId));
      const rows = await db
        .select({
          id: document.id,
          semesterId: document.semesterId,
          title: document.title,
          kind: document.kind,
          pageCount: document.pageCount,
          charCount: document.charCount,
          createdAt: document.createdAt,
        })
        .from(document)
        .where(and(...filters))
        .orderBy(desc(document.createdAt));
      return rows;
    }),

  get: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const row = await db
        .select()
        .from(document)
        .where(
          and(eq(document.id, input.id), eq(document.userId, context.user.id)),
        )
        .limit(1);
      return row[0] ?? null;
    }),

  create: authed
    .input(
      z.object({
        title: z.string().min(1).max(300),
        kind: KIND,
        textContent: z.string().min(1),
        pageCount: z.number().int().nonnegative(),
        semesterId: z.string().nullable().optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const text = input.textContent.slice(0, MAX_CHARS);
      const id = crypto.randomUUID();
      await db.insert(document).values({
        id,
        userId: context.user.id,
        semesterId: input.semesterId ?? null,
        title: input.title,
        kind: input.kind,
        textContent: text,
        pageCount: input.pageCount,
        charCount: text.length,
      });
      return { id };
    }),

  // Presigned GET URL for the original PDF, so the student can view the exact
  // source document in-app. Returns null when no PDF is stored (legacy rows).
  fileUrl: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const row = await db
        .select({ fileKey: document.fileKey })
        .from(document)
        .where(
          and(eq(document.id, input.id), eq(document.userId, context.user.id)),
        )
        .limit(1);
      const fileKey = row[0]?.fileKey;
      if (!fileKey) return { url: null };
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: fileKey }),
        { expiresIn: 3600 },
      );
      return { url };
    }),

  // Move a document to a semester (or unassign with null).
  assign: authed
    .input(z.object({ id: z.string(), semesterId: z.string().nullable() }))
    .handler(async ({ input, context }) => {
      await db
        .update(document)
        .set({ semesterId: input.semesterId })
        .where(
          and(eq(document.id, input.id), eq(document.userId, context.user.id)),
        );
      return { ok: true };
    }),

  remove: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      await db
        .delete(document)
        .where(
          and(eq(document.id, input.id), eq(document.userId, context.user.id)),
        );
      return { ok: true };
    }),

  // Bulk delete — used by the dashboard "Mes documents" multi-select bar.
  removeMany: authed
    .input(z.object({ ids: z.array(z.string()).min(1) }))
    .handler(async ({ input, context }) => {
      await db
        .delete(document)
        .where(
          and(
            inArray(document.id, input.ids),
            eq(document.userId, context.user.id),
          ),
        );
      return { ok: true, count: input.ids.length };
    }),
};
