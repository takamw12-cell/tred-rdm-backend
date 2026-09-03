import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { document, semester, semesterShare, subject } from "../database/schema";

export const semesters = {
  // List the user's semesters, each with its document + page counts.
  list: authed.handler(async ({ context }) => {
    const rows = await db
      .select()
      .from(semester)
      .where(eq(semester.userId, context.user.id))
      .orderBy(desc(semester.createdAt));

    const counts = await db
      .select({
        semesterId: document.semesterId,
        docs: sql<number>`count(*)`,
        pages: sql<number>`coalesce(sum(${document.pageCount}), 0)`,
      })
      .from(document)
      .where(eq(document.userId, context.user.id))
      .groupBy(document.semesterId);

    const byId = new Map(counts.map((c) => [c.semesterId, c]));

    return rows.map((s) => {
      const c = byId.get(s.id);
      return {
        ...s,
        docCount: Number(c?.docs ?? 0),
        pageCount: Number(c?.pages ?? 0),
      };
    });
  }),

  create: authed
    .input(
      z.object({
        name: z.string().min(1).max(120),
        university: z.string().max(160).optional(),
        program: z.string().max(160).optional(),
        semesterNumber: z.number().int().min(1).max(30).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      const id = crypto.randomUUID();
      await db.insert(semester).values({
        id,
        userId: context.user.id,
        name: input.name,
        university: input.university ?? null,
        program: input.program ?? null,
        semesterNumber: input.semesterNumber ?? null,
      });
      return { id };
    }),

  remove: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      // Detach documents (keep them, just unassign) then delete the semester.
      await db
        .update(document)
        .set({ semesterId: null })
        .where(
          and(
            eq(document.semesterId, input.id),
            eq(document.userId, context.user.id),
          ),
        );
      await db
        .delete(semester)
        .where(
          and(eq(semester.id, input.id), eq(semester.userId, context.user.id)),
        );
      return { ok: true };
    }),

  // ── Sharing ─────────────────────────────────────────────────────────
  // Unambiguous 6-char code (no 0/O/1/I) so it survives being read aloud.
  shareCreate: authed
    .input(z.object({ id: z.string() }))
    .handler(async ({ input, context }) => {
      const owned = await db
        .select({ id: semester.id })
        .from(semester)
        .where(
          and(eq(semester.id, input.id), eq(semester.userId, context.user.id)),
        )
        .limit(1);
      if (owned.length === 0) throw new Error("NOT_FOUND");

      const existing = await db
        .select({ code: semesterShare.code })
        .from(semesterShare)
        .where(eq(semesterShare.semesterId, input.id))
        .limit(1);
      if (existing.length > 0) return { code: existing[0].code };

      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      for (const b of bytes) code += alphabet[b % alphabet.length];

      await db.insert(semesterShare).values({
        code,
        semesterId: input.id,
        ownerId: context.user.id,
      });
      return { code };
    }),

  // Preview before redeeming: semester name + how many documents it carries.
  shareInfo: authed
    .input(z.object({ code: z.string().min(4).max(12) }))
    .handler(async ({ input }) => {
      const code = input.code.trim().toUpperCase();
      const share = await db
        .select()
        .from(semesterShare)
        .where(eq(semesterShare.code, code))
        .limit(1);
      if (share.length === 0) return { found: false as const };
      const sem = await db
        .select()
        .from(semester)
        .where(eq(semester.id, share[0].semesterId))
        .limit(1);
      if (sem.length === 0) return { found: false as const };
      const docs = await db
        .select({ n: sql<number>`count(*)` })
        .from(document)
        .where(
          and(
            eq(document.semesterId, sem[0].id),
            eq(document.userId, share[0].ownerId),
          ),
        );
      return {
        found: true as const,
        name: sem[0].name,
        program: sem[0].program,
        docCount: Number(docs[0]?.n ?? 0),
      };
    }),

  // Copy the shared semester + its documents into the current account.
  shareRedeem: authed
    .input(z.object({ code: z.string().min(4).max(12) }))
    .handler(async ({ input, context }) => {
      const code = input.code.trim().toUpperCase();
      const share = await db
        .select()
        .from(semesterShare)
        .where(eq(semesterShare.code, code))
        .limit(1);
      if (share.length === 0) throw new Error("INVALID_CODE");
      const src = await db
        .select()
        .from(semester)
        .where(eq(semester.id, share[0].semesterId))
        .limit(1);
      if (src.length === 0) throw new Error("INVALID_CODE");

      const newSemId = crypto.randomUUID();
      await db.insert(semester).values({
        id: newSemId,
        userId: context.user.id,
        name: src[0].name,
        university: src[0].university,
        program: src[0].program,
        semesterNumber: src[0].semesterNumber,
      });

      // Les Fächer sont recopiés AVANT les documents, et on garde la
      // correspondance ancien → nouveau. Sans elle, les documents arriveraient
      // avec l'identifiant d'un Fach appartenant à quelqu'un d'autre : ils
      // seraient invisibles chez le destinataire et visibles chez personne.
      const fachSrc = await db
        .select()
        .from(subject)
        .where(
          and(
            eq(subject.semesterId, src[0].id),
            eq(subject.userId, share[0].ownerId),
          ),
        );

      const remap = new Map<string, string>();
      for (const f of fachSrc) {
        const nouvelId = `sub_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
        await db.insert(subject).values({
          id: nouvelId,
          userId: context.user.id,
          semesterId: newSemId,
          name: f.name,
          color: f.color,
          position: f.position,
        });
        remap.set(f.id, nouvelId);
      }

      const docs = await db
        .select()
        .from(document)
        .where(
          and(
            eq(document.semesterId, src[0].id),
            eq(document.userId, share[0].ownerId),
          ),
        );
      for (const d of docs) {
        await db.insert(document).values({
          id: crypto.randomUUID(),
          userId: context.user.id,
          semesterId: newSemId,
          subjectId: d.subjectId ? (remap.get(d.subjectId) ?? null) : null,
          title: d.title,
          kind: d.kind,
          textContent: d.textContent,
          fileKey: d.fileKey, // same S3 object — the bucket is app-global
          pageCount: d.pageCount,
          charCount: d.charCount,
        });
      }
      return { id: newSemId, docCount: docs.length };
    }),
};
