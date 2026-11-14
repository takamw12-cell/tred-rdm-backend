/**
 * Suivi d'un import côté navigateur (voir api/routes/jobs.ts).
 *
 * `POST /api/documents/upload` répond de deux façons :
 *   · 202 { jobId }  — le serveur a une file : on suit `GET /api/jobs/:jobId` ;
 *   · 200 { id }     — pas de file sur ce serveur : le document est déjà prêt.
 * Les deux aboutissent au même résultat pour l'appelant.
 */

export type ImportStatus = "pending" | "processing" | "done" | "failed";

export interface ImportProgress {
  status: ImportStatus;
  /** 0…100, pour la barre de progression. */
  progress: number;
}

export type ImportOutcome = { ok: true; documentId: string } | { ok: false; error: string };

interface JobBody {
  status: ImportStatus;
  progress?: number;
  result?: { documentId: string };
  error?: string;
}

const POLL_MS = 1200;
/** Un OCR de trente pages derrière une file chargée : on attend jusqu'à dix minutes. */
const MAX_WAIT_MS = 10 * 60_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * La barre ne recule jamais et ne reste jamais à zéro : en file d'attente elle
 * montre 8 %, pendant le traitement au moins 20 %, et le serveur affine.
 */
export function shownProgress(status: ImportStatus, progress: number, previous = 0): number {
  const floor = status === "done" ? 100 : status === "processing" ? 20 : 8;
  return Math.min(100, Math.max(previous, floor, Math.round(progress)));
}

/** Suit un travail jusqu'à `done` ou `failed`. Les coupures réseau passagères sont ignorées. */
export async function followImportJob(jobId: string, onProgress: (p: ImportProgress) => void): Promise<ImportOutcome> {
  const started = Date.now();
  let shown = 0;
  let missing = 0;
  while (Date.now() - started < MAX_WAIT_MS) {
    await sleep(POLL_MS);
    let res: Response;
    try {
      res = await fetch(`/api/jobs/${jobId}`);
    } catch {
      continue;
    }
    // 404 répété : le travail a disparu de la file (Redis vidé). 503 : Redis hoquette, on réessaie.
    if (res.status === 404 && ++missing >= 3) return { ok: false, error: "job_lost" };
    if (!res.ok) continue;
    missing = 0;
    const job = (await res.json().catch(() => null)) as JobBody | null;
    if (!job) continue;
    shown = shownProgress(job.status, job.progress ?? 0, shown);
    onProgress({ status: job.status, progress: shown });
    if (job.status === "done" && job.result) return { ok: true, documentId: job.result.documentId };
    if (job.status === "failed") return { ok: false, error: job.error ?? "extraction_failed" };
  }
  return { ok: false, error: "timeout" };
}
