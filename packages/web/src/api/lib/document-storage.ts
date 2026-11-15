import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { StreamDeps } from "./document-stream";

/**
 * Lecture de l'original d'un document dans le stockage (Cloudflare R2 en
 * production) pour GET /api/documents/:id/stream.
 *
 * C'est le seul endroit où la route parle au stockage. Il ne décide de RIEN :
 * la clé qu'il reçoit a déjà été lue en base pour le compte de la session
 * (lib/document-owner.ts) — jamais tirée de l'adresse appelée.
 *
 * Les erreurs du stockage remontent avec leur nom S3 (`NoSuchKey`,
 * `InvalidRange`, …) : lib/document-stream.ts les traduit en 404 / 416 / 502
 * sans rien laisser passer du message d'origine.
 *
 * Testé contre un R2 simulé : tests/document-stream-r2.test.ts.
 */

/** Au-delà, une plage d'octets n'est plus gardée en mémoire : elle part en flux. */
export const STREAM_BUFFER_MAX = 4 * 1024 * 1024;

export function storedObjectReader(client: S3Client, bucket: string): StreamDeps["getObject"] {
  return async (fileKey, range) => {
    const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: fileKey, ...(range ? { Range: range } : {}) }));
    if (!obj.Body) throw Object.assign(new Error("original vide"), { name: "NoSuchKey" });
    // Une plage de lecteur (256 Ko, quelques Mo au plus) part en octets :
    // sa taille est annoncée. Un fichier entier ou une très grande plage
    // part en flux, sans jamais tenir en mémoire.
    const small = Boolean(range) && (obj.ContentLength ?? Number.POSITIVE_INFINITY) <= STREAM_BUFFER_MAX;
    const body = small ? await obj.Body.transformToByteArray() : (obj.Body.transformToWebStream() as ReadableStream<Uint8Array>);
    return { body, contentLength: obj.ContentLength, contentRange: obj.ContentRange };
  };
}
