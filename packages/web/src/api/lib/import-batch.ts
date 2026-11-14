import { contentMatchesExtension, MAX_UPLOAD_BYTES } from "./upload-guard";

/**
 * Import PAR LOT : plusieurs fichiers déposés d'un coup (2026-11-14).
 *
 * ── La règle ──────────────────────────────────────────────────────────────
 *
 * Un lot n'est pas un tout : c'est une suite d'imports INDÉPENDANTS. Chaque
 * fichier est contrôlé, envoyé au stockage et confié à la file avec son propre
 * `documentId` et son propre travail. Un fichier refusé, un stockage qui
 * hoquette sur le troisième, une file qui refuse le cinquième : les autres
 * passent quand même, et la réponse dit, fichier par fichier, ce qu'il en est.
 *
 * Rien n'est partagé entre deux documents d'un lot — ni texte, ni clé, ni
 * travail. C'est ce qui garantit qu'un cours ne se mélange jamais à un autre.
 *
 * Module pur : ni base, ni réseau. Le stockage, la file et le compteur sont
 * fournis par la route (api/index.ts) ; les tests en fournissent de faux.
 */

/** Cinq fichiers par lot : au-delà, la file se remplit d'un seul étudiant. */
export const BATCH_MAX_FILES = 5;
/** 100 Mo pour le lot entier (chaque fichier reste borné à 50 Mo). */
export const BATCH_MAX_BYTES = 100 * 1024 * 1024;

/** Le lot entier est refusé : rien n'a été lu ni stocké. */
export type BatchRefusal = "no_files" | "too_many_files" | "batch_too_large";

/** Ce fichier-là est refusé ; les autres ne sont pas concernés. */
export type BatchFileError =
  | "unsupported_format"
  | "file_too_large"
  | "empty_file"
  | "RATE_LIMITED"
  /** Le stockage ou la file n'ont pas répondu pour ce fichier : le navigateur le renvoie par l'import classique. */
  | "storage_unavailable"
  | "queue_unavailable"
  | "upload_failed";

/** Nombre et poids total. Chaque fichier est jugé ensuite, seul (`runBatch`). */
export function checkBatch(files: readonly { size: number }[]): BatchRefusal | null {
  if (files.length === 0) return "no_files";
  if (files.length > BATCH_MAX_FILES) return "too_many_files";
  if (files.reduce((total, f) => total + f.size, 0) > BATCH_MAX_BYTES) return "batch_too_large";
  return null;
}

/** `Content-Length` annoncé au-delà du plafond (+ 1 Mo pour l'enveloppe multipart) : refus sans lire le corps. */
export function declaredBatchTooLarge(contentLength: string | null | undefined): boolean {
  const n = Number(contentLength);
  return Number.isFinite(n) && n > BATCH_MAX_BYTES + 1024 * 1024;
}

export type DocKind = "vorlesung" | "uebung" | "klausur" | "other";
const KINDS: ReadonlySet<string> = new Set(["vorlesung", "uebung", "klausur", "other"]);
export const asKind = (value: unknown): DocKind => (typeof value === "string" && KINDS.has(value) ? (value as DocKind) : "other");

/** « TM2_Skript.pdf » → « TM2_Skript » : même règle que l'import d'un seul fichier. */
export function titleFromFilename(name: string): string {
  return (
    name
      .replace(/\.[a-z0-9]{1,5}$/i, "")
      .slice(0, 300)
      .trim() || "Dokument"
  );
}

export interface BatchFile {
  name: string;
  size: number;
  /** Lu au dernier moment, un fichier à la fois : jamais deux fichiers du lot en mémoire. */
  bytes: () => Promise<Uint8Array>;
  kind?: unknown;
}

export interface BatchJob {
  userId: string;
  documentId: string;
  fileKey: string;
  filename: string;
  title: string;
  kind: DocKind;
  semesterId: string | null;
  subjectId: string | null;
}

export interface BatchItemResult {
  /** Nom du fichier, tel que déposé. */
  name: string;
  jobId: string | null;
  documentId: string | null;
  error: BatchFileError | null;
}

export interface BatchDeps {
  isSupported: (filename: string) => boolean;
  extension: (filename: string) => string;
  /** Compteur par compte : une unité par fichier accepté. `false` : limite atteinte. */
  allow: () => Promise<boolean>;
  store: (fileKey: string, bytes: Uint8Array, ext: string) => Promise<void>;
  enqueue: (job: BatchJob, jobId: string) => Promise<void>;
  /** Retire un original dont le travail n'a pas pu être créé. */
  discard: (fileKey: string) => Promise<void>;
  newDocumentId: () => string;
  newJobId: () => string;
}

/**
 * Traite chaque fichier du lot, l'un après l'autre et chacun pour soi.
 * Ne lève jamais : toute panne devient l'erreur DU fichier concerné.
 * Le résultat garde l'ordre du dépôt (résultat n ↔ fichier n).
 */
export async function runBatch(
  userId: string,
  files: readonly BatchFile[],
  scope: { semesterId: string | null; subjectId: string | null },
  deps: BatchDeps,
): Promise<BatchItemResult[]> {
  const results: BatchItemResult[] = [];
  for (const file of files) {
    const refuse = (error: BatchFileError): BatchItemResult => ({ name: file.name, jobId: null, documentId: null, error });
    try {
      results.push(await importOne(userId, file, scope, deps, refuse));
    } catch (err) {
      // Une lecture qui casse, une dépendance qui lève hors des cas prévus :
      // c'est l'échec de CE fichier, pas celui du lot.
      console.error("[upload-batch] fichier non traité", (err as Error)?.message?.slice(0, 200));
      results.push(refuse("upload_failed"));
    }
  }
  return results;
}

async function importOne(
  userId: string,
  file: BatchFile,
  scope: { semesterId: string | null; subjectId: string | null },
  deps: BatchDeps,
  refuse: (error: BatchFileError) => BatchItemResult,
): Promise<BatchItemResult> {
  // Endung prüfen, bevor irgendetwas gelesen wird.
  if (!deps.isSupported(file.name)) return refuse("unsupported_format");
  if (file.size > MAX_UPLOAD_BYTES) return refuse("file_too_large");
  const ext = deps.extension(file.name);

  const bytes = await file.bytes();
  if (bytes.byteLength === 0) return refuse("empty_file");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) return refuse("file_too_large");
  // Le type RÉEL, lu dans les octets : un exécutable renommé « cours.pdf » s'arrête ici.
  if (!contentMatchesExtension(ext, bytes)) return refuse("unsupported_format");

  // Compté après les contrôles : un fichier refusé ne consomme pas la limite.
  if (!(await deps.allow())) return refuse("RATE_LIMITED");

  const documentId = deps.newDocumentId();
  const jobId = deps.newJobId();
  // La clé porte le compte ET le document : deux fichiers d'un lot ne peuvent pas se recouvrir.
  const fileKey = `documents/${userId}/${documentId}.${ext}`;

  try {
    await deps.store(fileKey, bytes, ext);
  } catch (err) {
    console.error("[upload-batch] stockage indisponible", (err as Error)?.message?.slice(0, 200));
    return refuse("storage_unavailable");
  }

  try {
    await deps.enqueue(
      {
        userId,
        documentId,
        fileKey,
        filename: file.name.slice(0, 300),
        title: titleFromFilename(file.name),
        kind: asKind(file.kind),
        semesterId: scope.semesterId,
        subjectId: scope.subjectId,
      },
      jobId,
    );
  } catch (err) {
    console.error("[upload-batch] file indisponible", (err as Error)?.message?.slice(0, 200));
    // Sans travail, l'original ne sera lu par personne : on ne le garde pas.
    await deps.discard(fileKey).catch(() => {});
    return refuse("queue_unavailable");
  }

  return { name: file.name, jobId, documentId, error: null };
}
