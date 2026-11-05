import { S3Client } from "@aws-sdk/client-s3";
import { s3, S3_BUCKET } from "./s3";

/**
 * Stockage des médias du Hörsaal (vidéos HeyGen, exports Figma).
 *
 * Si les variables R2_* sont renseignées, on utilise ce bucket Cloudflare R2
 * dédié. Sinon on retombe sur le bucket déjà configuré pour les PDF (S3_*),
 * dans un préfixe séparé `media/`. Aucune nouvelle clé n'est donc
 * obligatoire pour démarrer.
 */
const r2Account = process.env.R2_ACCOUNT_ID;
const useR2 = Boolean(
  r2Account &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME,
);

export const mediaClient: S3Client = useR2
  ? new S3Client({
      region: "auto",
      endpoint: `https://${r2Account}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : s3;

export const MEDIA_BUCKET: string = useR2 ? process.env.R2_BUCKET_NAME! : S3_BUCKET;

export const mediaStorageConfigured = (): boolean => Boolean(MEDIA_BUCKET);

/** Types acceptés → extension. Tout le reste est refusé (415). */
export const MEDIA_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "image/png": "png",
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "application/json": "json", // animations Lottie
};

export const MEDIA_KINDS = new Set(["heygen-video", "figma-export"]);

/** 200 Mo : une vidéo d'avatar de quelques minutes en 720p tient largement. */
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
