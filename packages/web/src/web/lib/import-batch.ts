import type { ImportOutcome, ImportProgress } from "./import-job";

/**
 * Import par lot, côté navigateur : la file que l'étudiant voit.
 *
 * Chaque fichier déposé devient une ligne avec SON statut — en attente, envoi,
 * lecture, terminé, erreur. Un fichier qui échoue (PDF abîmé, protégé par mot
 * de passe, format refusé) garde son erreur sur sa ligne ; les autres suivent
 * leur chemin. Rien de ce module ne lève : toute panne devient l'erreur DU
 * fichier concerné.
 *
 * Deux chemins, un seul résultat :
 *   · le serveur a une file (GET /api/config → `importQueue`) : le lot part en
 *     UN envoi (POST /api/documents/upload-batch), puis chaque travail est
 *     suivi par GET /api/jobs/:jobId ;
 *   · sinon : les fichiers partent un par un par POST /api/documents/upload,
 *     qui extrait dans la requête.
 *
 * Module pur : le réseau est fourni (`BatchTransport`), les tests en donnent un faux.
 */

/** Mêmes plafonds que le serveur (api/lib/import-batch.ts, api/lib/upload-guard.ts). */
export const BATCH_MAX_FILES = 5;
export const BATCH_MAX_BYTES = 100 * 1024 * 1024;
export const FILE_MAX_BYTES = 50 * 1024 * 1024;

export type QueueStatus = "waiting" | "uploading" | "reading" | "done" | "error";

export interface QueueItem {
  /** Rang dans le lot : stable, sert de clé. */
  index: number;
  name: string;
  size: number;
  status: QueueStatus;
  /** 0…100 pendant la lecture. */
  progress: number;
  /** Code d'erreur (contrôle local, réponse du serveur ou travail de la file). */
  error?: string;
  documentId?: string;
}

export type BatchRefusal = "too_many_files" | "batch_too_large";

/** Le lot entier est-il recevable ? Refusé AVANT tout envoi, donc sans rien faire monter pour rien. */
export function checkSelection(files: readonly { size: number }[]): BatchRefusal | null {
  if (files.length > BATCH_MAX_FILES) return "too_many_files";
  if (files.reduce((total, f) => total + f.size, 0) > BATCH_MAX_BYTES) return "batch_too_large";
  return null;
}

/** Ce que le navigateur peut refuser seul, sans le serveur. */
export function precheckFile(file: { name: string; size: number }, accepted: (name: string) => boolean): string | null {
  if (!accepted(file.name)) return "unsupported_format";
  if (file.size > FILE_MAX_BYTES) return "file_too_large";
  if (file.size === 0) return "empty_file";
  return null;
}

/** La file au dépôt : tout le monde attend, sauf les fichiers déjà refusés. */
export function initialQueue(files: readonly { name: string; size: number }[], accepted: (name: string) => boolean): QueueItem[] {
  return files.map((f, index) => {
    const error = precheckFile(f, accepted);
    return error ? { index, name: f.name, size: f.size, status: "error", progress: 0, error } : { index, name: f.name, size: f.size, status: "waiting", progress: 0 };
  });
}

export interface QueueSummary {
  total: number;
  done: number;
  failed: number;
  /** Plus rien n'est en cours. */
  finished: boolean;
  /** Avancement d'ensemble, 0…100 : un fichier terminé OU en erreur compte pour entier. */
  percent: number;
}

export function summarize(items: readonly QueueItem[]): QueueSummary {
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error").length;
  const total = items.length;
  const share = items.reduce((n, i) => n + (i.status === "done" || i.status === "error" ? 100 : i.status === "reading" ? Math.min(95, Math.max(10, i.progress)) : i.status === "uploading" ? 5 : 0), 0);
  return { total, done, failed, finished: total > 0 && done + failed === total, percent: total === 0 ? 0 : Math.round(share / total) };
}

/* ── Le réseau, vu d'ici ──────────────────────────────────────────────── */

export interface BatchUploadResult {
  name: string;
  jobId: string | null;
  documentId: string | null;
  error: string | null;
}

export type BatchUploadResponse =
  /** 202 : un résultat par fichier, dans l'ordre du dépôt. */
  | { kind: "accepted"; results: BatchUploadResult[] }
  /** 503 `queue_unavailable` : ce serveur n'a pas (ou plus) de file. */
  | { kind: "no_queue" }
  /** Le lot entier est refusé (limite du tarif, rafale, lot trop gros…). */
  | { kind: "refused"; error: string };

export type SingleUploadResponse =
  | { ok: true; documentId: string }
  | { ok: true; jobId: string }
  /** `stop` : inutile d'essayer les fichiers suivants (limite de documents du tarif, limite d'imports atteinte). */
  | { ok: false; error: string; stop?: boolean };

export interface BatchTransport {
  uploadBatch: (files: File[]) => Promise<BatchUploadResponse>;
  uploadOne: (file: File) => Promise<SingleUploadResponse>;
  follow: (jobId: string, onProgress: (p: ImportProgress) => void) => Promise<ImportOutcome>;
}

/** Erreurs d'un fichier du lot qui se rattrapent par l'import classique. */
const RETRY_SINGLE = new Set(["storage_unavailable", "queue_unavailable"]);

/**
 * Importe `files` et tient la file à jour (`onChange` reçoit une copie à chaque
 * changement). Renvoie la file finale. Ne lève jamais.
 */
export async function runImportBatch(
  files: readonly File[],
  opts: {
    /** Le serveur a une file (GET /api/config → `importQueue`). */
    queue: boolean;
    accepted: (name: string) => boolean;
    transport: BatchTransport;
    onChange: (items: QueueItem[]) => void;
    /** Un document vient d'être importé (rafraîchir la liste). */
    onImported?: (item: QueueItem) => void;
  },
): Promise<QueueItem[]> {
  const items = initialQueue(files, opts.accepted);
  const publish = () => opts.onChange(items.map((i) => ({ ...i })));
  const set = (index: number, patch: Partial<QueueItem>) => {
    Object.assign(items[index]!, patch);
    publish();
  };
  const fail = (index: number, error: string) => set(index, { status: "error", error, progress: 0 });
  const succeed = (index: number, documentId: string) => {
    set(index, { status: "done", progress: 100, documentId, error: undefined });
    opts.onImported?.({ ...items[index]! });
  };
  publish();

  /** Suit un travail de la file jusqu'au bout. */
  const followJob = async (index: number, jobId: string) => {
    try {
      const outcome = await opts.transport.follow(jobId, (p) => {
        // « pending » : il attend son tour dans la file ; « processing » : le worker le lit.
        if (p.status === "pending") set(index, { status: "waiting", progress: 0 });
        else if (p.status === "processing") set(index, { status: "reading", progress: p.progress });
      });
      if (outcome.ok) succeed(index, outcome.documentId);
      else fail(index, outcome.error);
    } catch {
      fail(index, "network");
    }
  };

  /** Un fichier, seul, par l'import classique. `false` : inutile de continuer avec les suivants. */
  const importSingle = async (index: number): Promise<boolean> => {
    set(index, { status: "reading", progress: 10, error: undefined });
    try {
      const res = await opts.transport.uploadOne(files[index]!);
      if (!res.ok) {
        fail(index, res.error);
        return !res.stop;
      }
      if ("documentId" in res) succeed(index, res.documentId);
      else await followJob(index, res.jobId);
    } catch {
      fail(index, "network");
    }
    return true;
  };

  /** Les fichiers un par un : celui qui échoue n'arrête pas les suivants. */
  const importSequentially = async (indexes: number[]) => {
    for (let k = 0; k < indexes.length; k++) {
      const goOn = await importSingle(indexes[k]!);
      if (!goOn) {
        // Limite atteinte : les suivants recevraient la même réponse.
        const reason = items[indexes[k]!]!.error ?? "upload_failed";
        for (const rest of indexes.slice(k + 1)) fail(rest, reason);
        return;
      }
    }
  };

  const eligible = items.filter((i) => i.status !== "error").map((i) => i.index);
  if (eligible.length === 0) return items;

  if (!opts.queue) {
    await importSequentially(eligible);
    return items;
  }

  for (const index of eligible) set(index, { status: "uploading" });
  let response: BatchUploadResponse;
  try {
    response = await opts.transport.uploadBatch(eligible.map((i) => files[i]!));
  } catch {
    response = { kind: "refused", error: "network" };
  }

  if (response.kind === "no_queue") {
    // La file a disparu entre-temps : on dépose un par un, rien n'est perdu.
    for (const index of eligible) set(index, { status: "waiting" });
    await importSequentially(eligible);
    return items;
  }
  if (response.kind === "refused") {
    for (const index of eligible) fail(index, response.error);
    return items;
  }

  const follows: Promise<void>[] = [];
  const retry: number[] = [];
  eligible.forEach((index, k) => {
    const result = response.results[k];
    if (!result) fail(index, "upload_failed");
    else if (result.jobId) {
      set(index, { status: "waiting", progress: 0 });
      follows.push(followJob(index, result.jobId));
    } else if (result.error && RETRY_SINGLE.has(result.error)) retry.push(index);
    else fail(index, result.error ?? "upload_failed");
  });
  await Promise.all([...follows, importSequentially(retry)]);
  return items;
}
