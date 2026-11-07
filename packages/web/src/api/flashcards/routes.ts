import type { Hono } from "hono";
import { generateObject } from "ai";
import { and, count, eq } from "drizzle-orm";
import { gateway } from "../agent/gateway";
import { auth } from "../auth";
import { db } from "../database";
import { document, flashcard, misconception } from "../database/schema";
import { langOf } from "../lib/languages";
import { addOutputTokens, tokenCapError, withinTokenCap } from "../lib/plan";
import { visibleDocuments } from "../lib/visible-documents";
import { myCourseIds } from "../routes/courses";
import {
  MAX_CARDS_PER_USER,
  cardCount,
  chatExcerpt,
  documentExcerpt,
  finalizeCards,
  flashcardModelSchema,
  flashcardRequestSchema,
  flashcardSystemPrompt,
  newCardSchedule,
} from "../lib/flashcards";

/**
 * POST /api/flashcards/generate — l'IA lit une source et écrit des cartes.
 *
 *   { source: "document", documentId }  un document visible par l'étudiant
 *                                       (le sien, ou partagé dans son cours)
 *   { source: "chat", messages }        les derniers messages du Hörsaal
 *   { source: "gap", gapId }            une lacune ouverte (merke_luecke) → 3 cartes
 *
 * Mêmes garde-fous que le quiz : session, clé IA (sinon 503 not_configured),
 * 20 générations par heure, plafond de tokens de l'abonnement (402). Les
 * cartes sont écrites avec next_review_date = maintenant : elles sont dues
 * aujourd'hui.
 *
 * Route Hono et non oRPC : un appel au modèle de 20–40 s, comme le quiz.
 */
const calls = new Map<string, number[]>();
const PER_HOUR = 20;

export function registerFlashcardRoutes(app: Hono) {
  app.post("/api/flashcards/generate", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!process.env.ANTHROPIC_API_KEY) return c.json({ error: "not_configured" }, 503);
    const uid = session.user.id;

    const parsed = flashcardRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    const req = parsed.data;

    const now = Date.now();
    const recent = (calls.get(uid) ?? []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= PER_HOUR) return c.json({ error: "rate_limited" }, 429);

    const cap = await withinTokenCap(uid);
    if (!cap.ok) return c.json(tokenCapError(cap.used, cap.cap), 402);

    // ── La source ────────────────────────────────────────────────────────
    let sourceText = "";
    let sourceLabel = "";
    let sourceId: string | null = null;
    try {
      if (req.source === "document") {
        const courseIds = await myCourseIds(uid);
        const [doc] = await db
          .select({ id: document.id, title: document.title, text: document.textContent })
          .from(document)
          .where(and(eq(document.id, req.documentId), visibleDocuments(uid, courseIds)))
          .limit(1);
        if (!doc) return c.json({ error: "not_found" }, 404);
        if (doc.text.trim().length < 200) return c.json({ error: "no_text" }, 422);
        sourceText = `SKRIPTAUSZUG ("${doc.title}"):\n\n${documentExcerpt(doc.text)}`;
        sourceLabel = doc.title;
        sourceId = doc.id;
      } else if (req.source === "gap") {
        const [gap] = await db
          .select()
          .from(misconception)
          .where(and(eq(misconception.id, req.gapId), eq(misconception.userId, uid)))
          .limit(1);
        if (!gap) return c.json({ error: "not_found" }, 404);
        sourceText = `WISSENSLÜCKE:\nThema: ${gap.topic}\nFehlvorstellung: ${gap.label}\nDetail: ${gap.detail || "—"}`;
        sourceLabel = gap.topic;
        sourceId = gap.id;
      } else {
        sourceText = `GESPRÄCHSAUSSCHNITT:\n\n${chatExcerpt(req.messages)}`;
        sourceLabel = "Hörsaal";
      }
    } catch (err) {
      console.error("[flashcards] source", (err as Error).message);
      return c.json({ error: "failed" }, 500);
    }

    // ── Les cartes déjà là (doublons, plafond) ───────────────────────────
    let existing: string[] = [];
    try {
      const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(flashcard).where(eq(flashcard.userId, uid));
      if (n >= MAX_CARDS_PER_USER) return c.json({ error: "too_many_cards" }, 409);
      existing = (
        await db.select({ f: flashcard.frontContent }).from(flashcard).where(eq(flashcard.userId, uid)).limit(MAX_CARDS_PER_USER)
      ).map((r) => r.f);
    } catch (err) {
      // Table absente : la migration migre-flashcards.mjs n'a pas tourné.
      console.error("[flashcards] table flashcard illisible — lancer migre-flashcards.mjs", (err as Error).message);
      return c.json({ error: "not_migrated" }, 503);
    }

    calls.set(uid, [...recent, now]);
    const n = cardCount(req);
    const { label: langLabel } = langOf(req.locale);

    try {
      const { object, usage } = await generateObject({
        model: gateway("anthropic/claude-sonnet-4.6"),
        schema: flashcardModelSchema,
        system: flashcardSystemPrompt(langLabel, n, req.source),
        prompt: sourceText,
        abortSignal: AbortSignal.timeout(60_000),
      });
      void addOutputTokens(uid, usage?.outputTokens ?? 0);

      const drafts = finalizeCards(object, existing, n);
      if (drafts.length === 0) return c.json({ created: 0, cards: [] });

      const at = new Date();
      const schedule = newCardSchedule(at);
      const rows = drafts.map((d) => ({
        id: `fc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`,
        userId: uid,
        frontContent: d.front,
        backContent: d.back,
        topic: d.topic,
        sourceType: req.source,
        sourceId,
        sourceLabel: sourceLabel.slice(0, 200),
        nextReviewDate: schedule.nextReviewDate,
        intervalDays: schedule.intervalDays,
        easeFactor: schedule.easeFactor,
        createdAt: at,
      }));
      await db.insert(flashcard).values(rows);
      return c.json({
        created: rows.length,
        cards: rows.map((r) => ({ id: r.id, front: r.frontContent, back: r.backContent, topic: r.topic })),
      });
    } catch (err) {
      console.error("[flashcards] generation failed", (err as Error).message);
      return c.json({ error: "failed" }, 502);
    }
  });
}
