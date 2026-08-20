import { S3Client } from "@aws-sdk/client-s3";

// S3-compatible object storage for the original uploaded PDFs, so students can
// re-read the exact source document and not only the extracted text.
//
// Path-style addressing is the default because Cloudflare R2 requires it
// (https://<account>.r2.cloudflarestorage.com/<bucket>/<key>). Providers that
// need virtual-hosted style (e.g. Tigris) can opt out with
// S3_FORCE_PATH_STYLE=false.
export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export const S3_BUCKET = process.env.S3_BUCKET!;
