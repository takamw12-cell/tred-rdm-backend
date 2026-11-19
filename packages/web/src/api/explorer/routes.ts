import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import { and, eq, like } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import { creditTransaction } from "../database/schema";
import { grantCredits } from "../lib/credits";
import { berlinDay } from "../lib/briefing";
import { DETECTIVE_REWARD, DETECTIVE_REWARDS_PER_DAY, DETECTIVE_TTL_MS, detectivePerfect, guess, newDetective, type DetectiveSession } from "./detective";

/**
 * Explorateur 3D :
 *   GET  /api/explorer/catalog              les fichiers .glb déposés dans public/models/<filière>/
 *   POST /api/explorer/detective/start      une partie de « 3D Detective » sur un modèle
 *   POST /api/explorer/detective/guess      un clic sur une pièce ; à la fin, sans-faute → +1 crédit
 */
export const MODEL_FOLDERS = ["engineering", "medicine", "mathematics", "physics", "law", "informatics"] as const;
const FILE = /^[a-z0-9][a-z0-9-]{0,60}\.glb$/;

/** Les .glb déposés (hors modèles livrés), par filière. Lu au plus une fois par minute. */
let cache: { at: number; files: Array<{ name: string; discipline: string }> } | null = null;
export function droppedModels(roots: string[] = [join(process.cwd(), "dist", "models"), join(process.cwd(), "public", "models")], now = Date.now()) {
  if (cache && now - cache.at < 60_000) return cache.files;
  const root = roots.find((r) => existsSync(r));
  const files: Array<{ name: string; discipline: string }> = [];
  if (root) {
    for (const discipline of MODEL_FOLDERS) {
      const dir = join(root, discipline);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) if (FILE.test(f)) files.push({ name: `${discipline}/${f.slice(0, -4)}`, discipline });
    }
  }
  cache = { at: now, files };
  return files;
}

const sessions = new Map<string, DetectiveSession>();

export function registerExplorerRoutes(app: Hono, builtInFiles: Set<string>) {
  app.get("/api/explorer/catalog", (c) => c.json({ dropped: droppedModels().filter((f) => !builtInFiles.has(f.name)) }));

  app.post("/api/explorer/detective/start", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const s = newDetective(session.user.id, body.modelId);
    if (!s) return c.json({ error: "unknown_model" }, 400);
    if (sessions.size > 5_000) sessions.delete(sessions.keys().next().value!);
    sessions.set(s.id, s);
    return c.json({ sessionId: s.id, total: s.targets.length, target: s.targets[0] });
  });

  app.post("/api/explorer/detective/guess", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const body = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const s = typeof body.sessionId === "string" ? sessions.get(body.sessionId) : undefined;
    if (!s || s.userId !== session.user.id || Date.now() - s.createdAt > DETECTIVE_TTL_MS) return c.json({ error: "unknown_session" }, 404);
    const res = guess(s, body.hotspotId);
    if (!res.ok) return c.json({ error: "finished" }, 409);
    sessions.set(s.id, res.session);

    let reward: { granted: boolean; amount: number; reason?: "daily_cap" } | null = null;
    if (res.finished && detectivePerfect(res.session)) {
      const day = berlinDay(new Date());
      const done = await db.select({ id: creditTransaction.id }).from(creditTransaction).where(and(eq(creditTransaction.userId, session.user.id), like(creditTransaction.id, `detective:${session.user.id}:${day}:%`)));
      if (done.length >= DETECTIVE_REWARDS_PER_DAY) reward = { granted: false, amount: 0, reason: "daily_cap" };
      else {
        const g = await grantCredits({ userId: session.user.id, amount: DETECTIVE_REWARD, transactionId: `detective:${session.user.id}:${day}:${s.id}`, description: "3D Detective: alles gefunden", type: "grant" });
        reward = { granted: g.granted, amount: g.granted ? DETECTIVE_REWARD : 0 };
      }
    }
    return c.json({ right: res.right, target: res.target, next: res.finished ? null : res.session.targets[res.session.round], round: res.session.round, total: res.session.targets.length, correct: res.session.correct, finished: res.finished, reward });
  });
}
