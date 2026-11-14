import { Worker, type Job } from "bullmq";
import { IMPORT_QUEUE, queueConfigured, workerConnection, type ImportJobData, type ImportJobResult } from "./api/lib/queue";
import { discardImportFile, processImport } from "./api/lib/queue/import-job";

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

const workers: Worker[] = [importWorker];
for (const w of workers) w.on("error", (err) => console.error(`[worker] ${w.name}`, err.message));

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
  await Promise.all(workers.map((w) => w.close().catch(() => {})));
  clearTimeout(force);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

export { workers };
