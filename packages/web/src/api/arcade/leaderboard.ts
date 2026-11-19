import IORedis from "ioredis";
import { redisUrl } from "../lib/queue";
import { weekKey } from "./game";

/**
 * Bestenliste de la semaine (Arcade). Redis : `arcade:speedrun:leaderboard:<semaine>`
 * (meilleur score de chaque compte, ZADD GT) et `…:names:<semaine>` (prénom
 * seul). Elle expire 15 jours après sa création. Sans Redis (développement),
 * une table en mémoire tient lieu.
 *
 * RGPD : n'y entrent que les comptes qui l'ont demandé (case « In der
 * Bestenliste erscheinen », décochée par défaut), avec leur prénom seul — ni
 * nom, ni université, ni identifiant.
 */
const KEY = (week: string) => `arcade:speedrun:leaderboard:${week}`;
const NAMES = (week: string) => `arcade:speedrun:leaderboard:names:${week}`;
const TTL_S = 15 * 24 * 3600;

let client: IORedis | null = null;
function redis(): IORedis | null {
  const url = redisUrl();
  if (!url) return null;
  if (!client) {
    client = new IORedis(url, { family: 0, maxRetriesPerRequest: 1, connectTimeout: 5_000, lazyConnect: false });
    client.on("error", (err) => console.error("[arcade] redis", err.message));
  }
  return client;
}

const memory = new Map<string, Map<string, { score: number; name: string }>>();

export interface BoardRow {
  rank: number;
  name: string;
  score: number;
  me: boolean;
}

export async function recordScore(userId: string, name: string, score: number, now = Date.now()): Promise<void> {
  const week = weekKey(now);
  const r = redis();
  if (r) {
    await r.multi().zadd(KEY(week), "GT", score, userId).hset(NAMES(week), userId, name).expire(KEY(week), TTL_S).expire(NAMES(week), TTL_S).exec();
    return;
  }
  const board = memory.get(week) ?? new Map();
  const prev = board.get(userId);
  if (!prev || score > prev.score) board.set(userId, { score, name });
  memory.set(week, board);
}

/** Les 10 meilleurs de la semaine, et la place du compte s'il y figure. */
export async function topScores(userId: string, now = Date.now()): Promise<{ week: string; rows: BoardRow[]; mine: BoardRow | null }> {
  const week = weekKey(now);
  const r = redis();
  let entries: Array<{ id: string; score: number; name: string }> = [];
  let mine: BoardRow | null = null;
  if (r) {
    const flat = await r.zrevrange(KEY(week), 0, 9, "WITHSCORES");
    const ids = flat.filter((_, i) => i % 2 === 0);
    const names = ids.length ? await r.hmget(NAMES(week), ...ids) : [];
    entries = ids.map((id, i) => ({ id, score: Number(flat[i * 2 + 1]), name: names[i] ?? "Anonym" }));
    const [rank, score, myName] = await Promise.all([r.zrevrank(KEY(week), userId), r.zscore(KEY(week), userId), r.hget(NAMES(week), userId)]);
    if (rank !== null && score !== null) mine = { rank: rank + 1, name: myName ?? "Anonym", score: Number(score), me: true };
  } else {
    const all = [...(memory.get(week) ?? new Map()).entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.score - a.score);
    entries = all.slice(0, 10);
    const i = all.findIndex((e) => e.id === userId);
    if (i >= 0) mine = { rank: i + 1, name: all[i]!.name, score: all[i]!.score, me: true };
  }
  return { week, rows: entries.map((e, i) => ({ rank: i + 1, name: e.name, score: e.score, me: e.id === userId })), mine };
}
