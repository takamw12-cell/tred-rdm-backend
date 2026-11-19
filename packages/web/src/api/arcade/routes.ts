import type { Hono } from "hono";
import { and, eq, like } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import { creditTransaction } from "../database/schema";
import { user } from "../database/auth-schema";
import { grantCredits } from "../lib/credits";
import { berlinDay } from "../lib/briefing";
import type { ChallengeMode, ChallengeQuestion } from "../lib/doc-challenge";
import { answer, boardName, isPerfect, newSession, PERFECT_REWARD, PERFECT_REWARDS_PER_DAY, publicQuestion, QUESTION_MS, SESSION_TTL_MS, type ArcadeSession } from "./game";
import { recordScore, topScores } from "./leaderboard";

/**
 * Arcade (game.ts) :
 *   POST /api/arcade/start        génère la partie (Fall-Check), rend son identifiant
 *   POST /api/arcade/question     montre la question en cours et démarre son chrono
 *   POST /api/arcade/answer       corrige ; à la fin : sans-faute → +2 crédits, Bestenliste
 *   GET  /api/arcade/leaderboard  les 10 meilleurs de la semaine (prénom seul)
 */
type Build = (uid: string, raw: unknown) => Promise<{ status: 200; data: { documentId: string; title: string; questions: ChallengeQuestion[]; mode: ChallengeMode } } | { status: 400 | 402 | 404 | 422 | 429 | 502 | 503; data: Record<string, unknown> }>;

const sessions = new Map<string, ArcadeSession>();
const MAX_SESSIONS = 5_000;

function store(s: ArcadeSession) {
  if (sessions.size >= MAX_SESSIONS) {
    const now = Date.now();
    for (const [id, v] of sessions) if (now - v.createdAt > SESSION_TTL_MS) sessions.delete(id);
    if (sessions.size >= MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
  }
  sessions.set(s.id, s);
}

function owned(id: unknown, userId: string): ArcadeSession | null {
  if (typeof id !== "string") return null;
  const s = sessions.get(id);
  if (!s || s.userId !== userId || Date.now() - s.createdAt > SESSION_TTL_MS) return null;
  return s;
}

/** Sans-faute du jour déjà récompensés (journal des crédits, identifiant « arcade:<compte>:<jour>:… »). */
async function perfectRewardsToday(userId: string, day: string): Promise<number> {
  const rows = await db.select({ id: creditTransaction.id }).from(creditTransaction).where(and(eq(creditTransaction.userId, userId), like(creditTransaction.id, `arcade:${userId}:${day}:%`)));
  return rows.length;
}

export function registerArcadeRoutes(app: Hono, deps: { buildChallenge: Build }) {
  app.post("/api/arcade/start", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const res = await deps.buildChallenge(session.user.id, { documentId: body.documentId, mode: body.mode, locale: body.locale });
    if (res.status !== 200) return c.json(res.data, res.status);
    const s = newSession({ userId: session.user.id, documentId: res.data.documentId, title: res.data.title, questions: res.data.questions, showOnBoard: body.showOnBoard === true });
    store(s);
    return c.json({ sessionId: s.id, documentId: s.documentId, title: s.title, total: s.questions.length, secondsPerQuestion: QUESTION_MS / 1000 });
  });

  app.post("/api/arcade/question", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const s = owned(body.sessionId, session.user.id);
    if (!s) return c.json({ error: "unknown_session" }, 404);
    if (s.finished) return c.json({ error: "finished" }, 409);
    // Redemander la même question ne relance pas son chrono.
    if (s.shownAt === null) store({ ...s, shownAt: Date.now() });
    const current = sessions.get(s.id)!;
    return c.json({ index: current.next, total: current.questions.length, ...publicQuestion(current.questions[current.next]!), remainingMs: Math.max(0, QUESTION_MS - (Date.now() - current.shownAt!)) });
  });

  app.post("/api/arcade/answer", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const s = owned(body.sessionId, session.user.id);
    if (!s) return c.json({ error: "unknown_session" }, 404);
    const choice = Number.isInteger(body.choice) ? (body.choice as number) : -1;
    const q = s.questions[s.next];
    const res = answer(s, choice);
    if (!res.ok) return c.json({ error: res.reason }, 409);
    store(res.session);

    let reward: { granted: boolean; amount: number; reason?: "daily_cap" } | null = null;
    let rank: number | null = null;
    if (res.session.finished) {
      if (isPerfect(res.session)) {
        const day = berlinDay(new Date());
        if ((await perfectRewardsToday(session.user.id, day)) >= PERFECT_REWARDS_PER_DAY) reward = { granted: false, amount: 0, reason: "daily_cap" };
        else {
          const g = await grantCredits({ userId: session.user.id, amount: PERFECT_REWARD, transactionId: `arcade:${session.user.id}:${day}:${s.id}`, description: "Arcade: perfekter Durchgang", type: "grant" });
          reward = { granted: g.granted, amount: g.granted ? PERFECT_REWARD : 0 };
        }
      }
      if (res.session.showOnBoard && res.session.score > 0) {
        const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, session.user.id)).limit(1);
        await recordScore(session.user.id, boardName(row?.name), res.session.score).catch((e) => console.error("[arcade] bestenliste", e instanceof Error ? e.message : "erreur"));
        rank = (await topScores(session.user.id).catch(() => null))?.mine?.rank ?? null;
      }
    }
    return c.json({
      right: res.right,
      timedOut: res.timedOut,
      points: res.points,
      correct: q!.correct,
      explanation: q!.explanation,
      quote: q!.quote,
      page: q!.page,
      state: { index: res.session.next, correct: res.session.correct, streak: res.session.streak, score: res.session.score, total: res.session.questions.length, finished: res.session.finished },
      reward,
      rank,
    });
  });

  app.get("/api/arcade/leaderboard", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    try {
      return c.json(await topScores(session.user.id));
    } catch {
      return c.json({ week: null, rows: [], mine: null });
    }
  });
}
