import { dbErrorCode, withDbRetry, type DbRetryOptions } from "../db-retry";
import { IMPORT_ERRORS } from "./index";

/**
 * Ce qu'un import en échec a le droit de laisser derrière lui.
 *
 * ── La fuite (test de charge du 18 nov. 2026) ───────────────────────────────
 *
 * Quand l'enregistrement d'un document échouait, le worker écrivait
 * `err.message` dans son journal. Or le message de la base est « Failed
 * query: insert into "document" … params: … » : il contient les paramètres,
 * donc le TEXTE ENTIER du cours de l'étudiant. Dix-huit échecs ont produit
 * 26 500 lignes de journal. Le même message était rangé par BullMQ dans Redis
 * (`failedReason`, `stacktrace`).
 *
 * ── La règle ────────────────────────────────────────────────────────────────
 *
 * Un échec d'import se résume à des identifiants, un code et deux mesures :
 * `{ jobId, documentId, userId, errorCode, pageCount, byteSize }`. Jamais le
 * texte, jamais les octets, jamais un message d'erreur recopié — un message
 * inconnu devient « unknown_error ».
 *
 * Module pur (pas de base, pas de stockage) : tests/import-failure-log.test.ts.
 */

/** L'enregistrement du document a échoué. Son message est un code ; rien d'autre ne voyage avec elle. */
export class ImportWriteError extends Error {
  readonly errorCode: string;
  readonly pageCount: number;
  readonly byteSize: number;

  constructor(errorCode: string, measures: { pageCount: number; byteSize: number }) {
    // Pas de `cause` : l'erreur d'origine porte le texte du document.
    super("db_write_failed");
    this.name = "ImportWriteError";
    this.errorCode = errorCode;
    this.pageCount = measures.pageCount;
    this.byteSize = measures.byteSize;
  }
}

/**
 * Enregistre le document : trois essais sur une panne passagère de la base
 * (lib/db-retry.ts), puis une erreur qui ne porte qu'un code. `insert` doit
 * pouvoir être rejoué (identifiant fixe + `onConflictDoNothing`).
 */
export async function saveImportedDocument(insert: () => Promise<unknown>, measures: { pageCount: number; byteSize: number }, retry: DbRetryOptions = {}): Promise<void> {
  try {
    await withDbRetry(insert, retry);
  } catch (err) {
    throw new ImportWriteError(dbErrorCode(err), measures);
  }
}

export interface ImportFailureLog {
  jobId: string | null;
  documentId: string | null;
  userId: string | null;
  errorCode: string;
  pageCount: number | null;
  byteSize: number | null;
  attempt: number;
  final: boolean;
}

/** Le minimum lu sur un travail BullMQ (le vrai `Job` le satisfait). */
export interface FailedImportJob {
  id?: string;
  attemptsMade?: number;
  data?: { userId?: string; documentId?: string };
}

const KNOWN_CODES: ReadonlySet<string> = new Set([...IMPORT_ERRORS, "db_write_failed"]);

function failureCode(err: unknown): string {
  if (err instanceof ImportWriteError) return `db_write_failed:${err.errorCode}`;
  const message = err instanceof Error ? err.message : "";
  if (KNOWN_CODES.has(message)) return message;
  // Une erreur de base arrivée telle quelle : son code, pas son message.
  const code = dbErrorCode(err);
  if (/^[A-Z][A-Z0-9_]+$/.test(code)) return `db_error:${code}`;
  // Une erreur nommée (« NoSuchKey », « TimeoutError ») : son nom suffit à s'orienter.
  return code !== "unknown" ? code : "unknown_error";
}

export function importFailureLog(job: FailedImportJob | undefined, err: unknown, final: boolean): ImportFailureLog {
  const measured = err instanceof ImportWriteError ? err : null;
  return {
    jobId: job?.id ?? null,
    documentId: job?.data?.documentId ?? null,
    userId: job?.data?.userId ?? null,
    errorCode: failureCode(err),
    pageCount: measured?.pageCount ?? null,
    byteSize: measured?.byteSize ?? null,
    attempt: job?.attemptsMade ?? 0,
    final,
  };
}

/** La seule ligne que le worker écrit pour un import en échec. */
export function logImportFailure(job: FailedImportJob | undefined, err: unknown, final: boolean, write: (...args: unknown[]) => void = console.warn): void {
  write(`[worker] import échoué ${JSON.stringify(importFailureLog(job, err, final))}`);
}
