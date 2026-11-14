import { DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { UnrecoverableError, type Job } from "bullmq";
import { db } from "../../database";
import { document } from "../../database/schema";
import { extractDocument, UnsupportedFormatError } from "../extract";
import { canAddDocument } from "../plan";
import { s3, S3_BUCKET } from "../s3";
import type { ImportJobData, ImportJobResult } from "./index";

export { IMPORT_ERRORS, importErrorCode, type ImportError } from "./index";

/**
 * Le travail « import-pdf », exécuté par le worker (src/worker.ts).
 *
 *   original (stockage objet) → texte (pdf.js, OCR si scan) → ligne `document`
 *
 * Le message d'une erreur est un CODE stable, lu par le navigateur
 * (`GET /api/jobs/:id` → `error`). Les refus définitifs — format, scan
 * illisible, pas de texte, limite de documents — lèvent `UnrecoverableError` :
 * les rejouer coûterait un OCR de plus pour le même résultat. Tout le reste
 * (stockage, base, modèle de vision indisponibles) est repris par BullMQ.
 */

// Même plafond que l'import historique (api/index.ts).
const MAX_CHARS = 400_000;

export async function processImport(job: Job<ImportJobData, ImportJobResult>): Promise<ImportJobResult> {
  const d = job.data;

  const obj = await s3.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: d.fileKey }));
  if (!obj.Body) throw new Error("original introuvable dans le stockage");
  const bytes = await obj.Body.transformToByteArray();
  await job.updateProgress(15);

  let extracted;
  try {
    extracted = await extractDocument(bytes, d.filename);
  } catch (err) {
    if (err instanceof UnsupportedFormatError) throw new UnrecoverableError("unsupported_format");
    if (err instanceof Error && err.name === "ScannedPdfUnreadableError") throw new UnrecoverableError("scan_unreadable");
    console.error(`[import] ${job.id} : extraction`, err instanceof Error ? err.message.slice(0, 300) : err);
    throw new Error("extraction_failed");
  }
  await job.updateProgress(80);

  const text = extracted.text.slice(0, MAX_CHARS);
  if (text.replace(/\[\[SEITE \d+\]\]/g, "").trim().length < 40) throw new UnrecoverableError("no_text");

  // Revérifié ici : dix imports déposés d'un coup ont tous passé le contrôle
  // de la route avant qu'un seul document n'existe.
  const quota = await canAddDocument(d.userId);
  if (!quota.ok) throw new UnrecoverableError("document_limit");

  await db
    .insert(document)
    .values({
      id: d.documentId,
      userId: d.userId,
      semesterId: d.semesterId,
      subjectId: d.subjectId,
      title: d.title,
      kind: d.kind,
      textContent: text,
      fileKey: d.fileKey,
      pageCount: extracted.pageCount,
      charCount: text.length,
    })
    // Une reprise après une coupure juste derrière l'INSERT ne doit pas échouer.
    .onConflictDoNothing();
  await job.updateProgress(100);

  return { documentId: d.documentId, pageCount: extracted.pageCount, ocr: extracted.ocr };
}

/** Échec définitif : l'original ne sert plus à personne, on ne le garde pas. */
export async function discardImportFile(fileKey: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: fileKey })).catch((err) => {
    console.error("[import] original non supprimé", (err as Error).message?.slice(0, 200));
  });
}
