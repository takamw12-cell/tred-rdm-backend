import { UnrecoverableError, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import {
  HEARTBEAT_EVERY_MS,
  HEARTBEAT_TTL_S,
  IMPORT_QUEUE,
  VIDEO_QUEUE,
  WORKER_HEARTBEAT_KEY,
  queueConfigured,
  redisUrl,
  workerConnection,
  type ImportJobData,
  type ImportJobResult,
  type VideoJobData,
} from "./api/lib/queue";
import { discardImportFile, processImport } from "./api/lib/queue/import-job";
import { failVideo, PipelineError, runPipeline, videoErrorCode } from "./api/video/pipeline";

/**
 * Le worker : même code que le service web, autre point d'entrée.
 *
 *   bun packages/web/src/worker.ts
 *
 * Il ne sert aucune requête HTTP. Il prend les travaux déposés dans Redis par
 * le service web et les traite. Pour absorber un pic, on augmente le nombre
 * de répliques de CE service (GUIDE_FOUNDER.md) : chaque réplique prend sa
 * part de la file, sans réglage.
 *
 * Ce fichier n'importe PAS `./api` : le service web y démarre ses rappels du
 * soir et son battement de rétention, qui ne doivent tourner qu'une fois.
 */

if (!queueConfigured()) {
  console.error("[worker] REDIS_URL ou S3_* manquant : rien à traiter. Voir GUIDE_FOUNDER.md.");
  process.exit(1);
}

const num = (name: string, fallback: number) => Math.max(1, Number(process.env[name]) || fallback);

/**
 * Imports traités en même temps par réplique. Deux par défaut : l'extraction
 * d'un PDF scanné occupe un cœur entier et garde le fichier en mémoire.
 */
const importWorker = new Worker<ImportJobData, ImportJobResult>(IMPORT_QUEUE, processImport, {
  connection: workerConnection(),
  concurrency: num("WORKER_IMPORT_CONCURRENCY", 2),
  // Un OCR de trente pages dure : on ne considère pas le travail perdu avant cinq minutes.
  lockDuration: 5 * 60_000,
});

const finalFailure = (job: Job | undefined) => Boolean(job && job.attemptsMade >= (job.opts.attempts ?? 1));

importWorker.on("completed", (job) => console.log(`[worker] import ${job.id} : terminé (${job.returnvalue.pageCount} pages)`));
importWorker.on("failed", (job, err) => {
  const final = finalFailure(job) || err.name === "UnrecoverableError";
  console.warn(`[worker] import ${job?.id} : ${err.message}${final ? " (définitif)" : " (sera repris)"}`);
  if (job && final) void discardImportFile(job.data.fileKey);
});

/**
 * « Als Video erklären » : script → contrôle → voix → stockage. Presque tout
 * le temps se passe à attendre Claude et ElevenLabs, donc trois à la fois par
 * réplique. Une panne passagère est reprise 2 fois (5 s, puis 10 s) ; un refus
 * (script non prouvé, plafond de voix) ne l'est pas.
 */
const videoWorker = new Worker<VideoJobData, void>(
  VIDEO_QUEUE,
  async (job) => {
    try {
      await runPipeline(job.data);
    } catch (err) {
      if (err instanceof PipelineError && !err.retryable) throw new UnrecoverableError(err.code);
      throw err;
    }
  },
  { connection: workerConnection(), concurrency: num("WORKER_VIDEO_CONCURRENCY", 3), lockDuration: 5 * 60_000 },
);

videoWorker.on("completed", (job) => console.log(`[worker] vidéo ${job.id} : prête`));
videoWorker.on("failed", (job, err) => {
  const final = finalFailure(job) || err.name === "UnrecoverableError";
  console.warn(`[worker] vidéo ${job?.id} : ${err.message}${final ? " (définitif)" : ` (essai ${job?.attemptsMade}/${job?.opts.attempts}, sera repris)`}`);
  // C'est ici, et seulement après la dernière reprise, que la vidéo devient
  // `failed` pour l'étudiant, avec un code que le navigateur sait traduire.
  if (job && final) void failVideo(job.data.id, videoErrorCode(err.message)).catch(() => {});
});

const workers: Worker[] = [importWorker, videoWorker];
for (const w of workers) w.on("error", (err) => console.error(`[worker] ${w.name}`, err.message));

/**
 * Le battement : « un worker est là ». Le service web ne dépose des travaux
 * que s'il le voit (lib/queue/index.ts) ; sans lui, il traite l'import dans
 * la requête. Posé toutes les 10 s, il expire seul 35 s après le dernier.
 */
const beat = new IORedis(redisUrl() as string, { family: 0, maxRetriesPerRequest: null });
beat.on("error", (err) => console.error("[worker] battement", err.message));
const pulse = () => void beat.set(WORKER_HEARTBEAT_KEY, String(Date.now()), "EX", HEARTBEAT_TTL_S).catch(() => {});
pulse();
const pulseTimer = setInterval(pulse, HEARTBEAT_EVERY_MS);

console.log(`[worker] prêt — files : ${workers.map((w) => `${w.name} ×${w.opts.concurrency}`).join(", ")}`);

/**
 * Arrêt propre : Railway envoie SIGTERM à chaque déploiement. On cesse de
 * prendre des travaux et on laisse finir ceux en cours ; ce qui ne finit pas
 * est repris par une autre réplique à l'expiration du verrou.
 */
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`[worker] ${signal} : arrêt après les travaux en cours`);
  const force = setTimeout(() => process.exit(0), 25_000);
  // On retire le battement tout de suite : le service web cesse de déposer des
  // travaux pour ce worker (une autre réplique le reposera dans les 10 s).
  clearInterval(pulseTimer);
  await beat.del(WORKER_HEARTBEAT_KEY).catch(() => {});
  await Promise.all(workers.map((w) => w.close().catch(() => {})));
  beat.disconnect();
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { workers };
