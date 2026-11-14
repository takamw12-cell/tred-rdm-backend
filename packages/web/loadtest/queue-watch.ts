/**
 * Affiche la taille des files Redis, une fois par seconde — à lancer à côté du
 * test de charge, ou avant un pic pour voir si le worker suit.
 *
 *     REDIS_URL=… S3_BUCKET=… S3_ACCESS_KEY_ID=… bun packages/web/loadtest/queue-watch.ts
 *
 * `waiting` : travaux qui attendent un worker. S'il grandit sans redescendre,
 * il faut plus de répliques du worker (GUIDE_FOUNDER.md).
 */
import { closeQueues, queueConfigured, queueDepths } from "../src/api/lib/queue";

if (!queueConfigured()) {
  console.error("REDIS_URL ou S3_* manquant : pas de file à observer.");
  process.exit(1);
}

const seconds = Number(process.argv[2]) || 120;
let peak = 0;
for (let i = 0; i < seconds; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const depths = await queueDepths();
    const waiting = Object.values(depths).reduce((n, q) => n + (q.waiting ?? 0) + (q.delayed ?? 0), 0);
    peak = Math.max(peak, waiting);
    const line = Object.entries(depths)
      .map(([name, q]) => `${name} attente=${q.waiting ?? 0} en cours=${q.active ?? 0} reprises=${q.delayed ?? 0} échecs=${q.failed ?? 0}`)
      .join(" | ");
    console.log(`${new Date().toISOString().slice(11, 19)} ${line}`);
  } catch (error) {
    console.log(`${new Date().toISOString().slice(11, 19)} Redis ne répond pas : ${(error as Error).message}`);
  }
}
console.log(`\nPic de la file (travaux en attente, toutes files) : ${peak}`);
await closeQueues();
process.exit(0);
