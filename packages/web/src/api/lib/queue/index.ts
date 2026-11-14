import { Queue, type ConnectionOptions, type JobsOptions } from "bullmq";
import IORedis from "ioredis";
import type { VideoRequest, VideoSource } from "../video-script";

/**
 * Les files de travaux (Redis + BullMQ).
 *
 * ── Pourquoi ──────────────────────────────────────────────────────────────
 *
 * L'import d'un document et la vidéo explicative prennent de dix secondes à
 * plusieurs minutes. Faits dans le service web, ils occupent le processeur et
 * la mémoire du processus qui répond à tous les autres étudiants. Ici, le
 * service web ne fait que DÉPOSER un travail ; un service à part
 * (`src/worker.ts`) le traite. On ajoute des workers sans toucher au web.
 *
 * ── Inerte sans REDIS_URL ─────────────────────────────────────────────────
 *
 * Sans REDIS_URL, `queueConfigured()` est faux et l'application se comporte
 * exactement comme avant : import dans la requête, vidéo dans le processus
 * web. Si Redis tombe en cours de route, `queueReady()` devient faux et
 * l'appelant retombe sur ce même chemin historique.
 */

export const IMPORT_QUEUE = "import-pdf";
export const VIDEO_QUEUE = "generate-video";

/** 1 essai + 2 reprises, attente exponentielle : 5 s puis 10 s. */
export const RETRY: Pick<JobsOptions, "attempts" | "backoff"> = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5_000 },
};

export interface ImportJobData {
  userId: string;
  /** Identifiant du futur document (déjà dans la clé de stockage). */
  documentId: string;
  /** Clé de l'original dans le stockage objet. */
  fileKey: string;
  filename: string;
  title: string;
  kind: "vorlesung" | "uebung" | "klausur" | "other";
  semesterId: string | null;
  subjectId: string | null;
}

export interface ImportJobResult {
  documentId: string;
  pageCount: number;
  ocr: boolean;
}

export interface VideoJobData {
  /** Identifiant de la ligne `generated_video` (c'est aussi le jobId). */
  id: string;
  userId: string;
  req: VideoRequest;
  sources: VideoSource[];
  voiceId: string;
  professor: string;
}

export function redisUrl(): string | null {
  return process.env.REDIS_URL?.trim() || null;
}

/** Les files ne servent que si Redis ET le stockage objet sont branchés. */
export function queueConfigured(): boolean {
  return Boolean(redisUrl() && process.env.S3_BUCKET && process.env.S3_ACCESS_KEY_ID);
}

/**
 * Connexion Redis du worker. `family: 0` : le réseau privé de Railway résout
 * en IPv6, ioredis ne tente que l'IPv4 par défaut. `maxRetriesPerRequest: null`
 * est exigé par BullMQ : le worker attend que Redis revienne au lieu
 * d'abandonner ses travaux.
 */
export function workerConnection(): ConnectionOptions {
  const url = redisUrl();
  if (!url) throw new Error("REDIS_URL manquant");
  return { url, family: 0, maxRetriesPerRequest: null };
}

/**
 * Connexion du service web (qui dépose les travaux) : une seule, partagée par
 * les files. Elle échoue vite — une requête HTTP ne doit jamais rester
 * suspendue parce que Redis ne répond pas.
 */
let producer: IORedis | null = null;
function producerConnection(): IORedis {
  if (!producer) {
    const url = redisUrl();
    if (!url) throw new Error("REDIS_URL manquant");
    producer = new IORedis(url, { family: 0, maxRetriesPerRequest: 1, connectTimeout: 5_000 });
    // Sans écouteur, une coupure Redis ferait tomber le processus.
    producer.on("error", (err) => console.error("[queue] redis", err.message));
  }
  return producer;
}

/** Redis répond-il, là, maintenant ? Sinon l'appelant prend le chemin sans file. */
export function queueReady(): boolean {
  return queueConfigured() && producerConnection().status === "ready";
}

const queues = new Map<string, Queue>();

function queue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, {
      connection: producerConnection(),
      defaultJobOptions: {
        ...RETRY,
        // Un travail terminé reste lisible une heure (le navigateur vient y
        // lire son résultat), un échec un jour (pour comprendre une panne).
        removeOnComplete: { age: 3600, count: 5000 },
        removeOnFail: { age: 24 * 3600, count: 5000 },
      },
    });
    q.on("error", (err) => console.error(`[queue] ${name}`, err.message));
    queues.set(name, q);
  }
  return q;
}

export const importQueue = (): Queue<ImportJobData, ImportJobResult> => queue(IMPORT_QUEUE) as Queue<ImportJobData, ImportJobResult>;
export const videoQueue = (): Queue<VideoJobData, void> => queue(VIDEO_QUEUE) as Queue<VideoJobData, void>;

/** Ouvre les connexions au démarrage du service web : le premier dépôt ne paie pas la connexion. */
export function warmQueues(): void {
  if (!queueConfigured()) return;
  importQueue();
  videoQueue();
}

/** Identifiant d'un travail d'import : imprévisible, sans « : » (interdit par BullMQ). */
export function newImportJobId(): string {
  return `imp_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
}
export const IMPORT_JOB_ID_RE = /^imp_[a-f0-9]{24}$/;

/** Taille des files, pour /api/health/queues et le test de charge. */
export async function queueDepths(): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  for (const q of [importQueue(), videoQueue()]) {
    out[q.name] = await q.getJobCounts("waiting", "active", "delayed", "failed");
  }
  return out;
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => {})));
  queues.clear();
  producer?.disconnect();
  producer = null;
}

/** Codes d'échec que le navigateur sait traduire. */
export const IMPORT_ERRORS = ["unsupported_format", "scan_unreadable", "no_text", "document_limit", "extraction_failed"] as const;
export type ImportError = (typeof IMPORT_ERRORS)[number];

export function importErrorCode(reason: string | undefined): ImportError {
  return (IMPORT_ERRORS as readonly string[]).includes(reason ?? "") ? (reason as ImportError) : "extraction_failed";
}

export type JobStatus = "pending" | "processing" | "done" | "failed";

/** État BullMQ → état public. Une reprise en attente (`delayed`) reste « processing » : le travail a commencé. */
export function publicStatus(state: string, attemptsMade: number): JobStatus {
  if (state === "completed") return "done";
  if (state === "failed") return "failed";
  if (state === "active") return "processing";
  if (state === "delayed" && attemptsMade > 0) return "processing";
  return "pending";
}
