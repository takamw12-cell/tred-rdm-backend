import { S3Client } from "@aws-sdk/client-s3";

/** Les variables lues pour construire le client du stockage. */
export interface S3Env {
  [name: string]: string | undefined;
  S3_REGION?: string;
  S3_ENDPOINT?: string;
  S3_FORCE_PATH_STYLE?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
}

// S3-compatible object storage for the original uploaded PDFs, so students can
// re-read the exact source document and not only the extracted text.
//
// Path-style addressing is the default because Cloudflare R2 requires it
// (https://<account>.r2.cloudflarestorage.com/<bucket>/<key>). Providers that
// need virtual-hosted style (e.g. Tigris) can opt out with
// S3_FORCE_PATH_STYLE=false.
//
// Une fonction, et pas seulement une constante : tests/document-stream-r2.test.ts
// construit le MÊME client contre un R2 simulé — région, adressage et signature
// sont alors ceux de la production, pas une copie écrite pour le test.
export function createS3Client(env: S3Env = process.env): S3Client {
  return new S3Client({
    region: env.S3_REGION ?? "auto",
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export const s3 = createS3Client();

export const S3_BUCKET = process.env.S3_BUCKET!;
