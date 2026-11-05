import { PutObjectCommand } from "@aws-sdk/client-s3";
import Replicate from "replicate";
import { estimateMediaCostCents } from "./avatar-cost";
import { MEDIA_BUCKET, mediaClient } from "./media-storage";
import { releaseMedia, reserveMedia, type MediaKind } from "./media-quota";

/**
 * Génération d'images et de vidéos via Replicate, pour l'outil du tuteur
 * `generiere_bild_oder_video`.
 *
 * Pourquoi le SDK et pas le serveur MCP : le serveur MCP (`replicate-mcp`,
 * déclaré dans .mcp.json) sert à Claude Code pendant le développement. En
 * production, lancer un processus `npx` par requête serait lent et fragile ;
 * le SDK officiel appelle la même API directement.
 *
 * Les URL renvoyées par Replicate EXPIRENT au bout d'une heure. Le fichier est
 * donc recopié dans notre stockage objet et servi par /api/media/generated/…,
 * réservé à son propriétaire : la conversation reste lisible demain.
 *
 * Modèles réglables sans redéployer le code :
 *   REPLICATE_IMAGE_MODEL  défaut black-forest-labs/flux-schnell
 *   REPLICATE_VIDEO_MODEL  défaut wan-video/wan-2.2-t2v-fast (480p, ~5 s)
 * Les paramètres envoyés au modèle vidéo par défaut (num_frames,
 * frames_per_second) sont à confirmer au premier essai avec la vraie clé.
 * Pour un autre modèle, seul `prompt` est envoyé.
 */

export const replicateConfigured = (): boolean => Boolean(process.env.REPLICATE_API_TOKEN);

const IMAGE_MODEL = () => process.env.REPLICATE_IMAGE_MODEL || "black-forest-labs/flux-schnell";
const VIDEO_MODEL = () => process.env.REPLICATE_VIDEO_MODEL || "wan-video/wan-2.2-t2v-fast";

export const MAX_VIDEO_SECONDS = 5;

export interface MediaRequest {
  userId: string;
  prompt: string;
  type: MediaKind;
  /** Durée voulue pour une vidéo, en secondes (1–5). Ignorée pour une image. */
  dauer?: number;
}

export type MediaResult =
  | { ok: true; type: MediaKind; url: string; contentType: string; kostenCents: number }
  | { ok: false; fehler: string };

function inputFor(model: string, prompt: string, type: MediaKind, seconds: number) {
  if (type === "image") {
    return model === "black-forest-labs/flux-schnell"
      ? { prompt, aspect_ratio: "16:9", output_format: "webp", num_outputs: 1 }
      : { prompt };
  }
  if (model === "wan-video/wan-2.2-t2v-fast") {
    // 16 images/s : 81 images ≈ 5 s, le plancher de ce modèle.
    const fps = 16;
    return { prompt, num_frames: Math.max(81, Math.round(seconds * fps) + 1), frames_per_second: fps };
  }
  return { prompt };
}

/** Première URL trouvée dans la sortie (chaîne, tableau, ou objet {url}). */
function firstUrl(output: unknown): string | null {
  if (typeof output === "string") return output.startsWith("http") ? output : null;
  if (Array.isArray(output)) {
    for (const o of output) {
      const u = firstUrl(o);
      if (u) return u;
    }
    return null;
  }
  if (output && typeof output === "object") {
    const u = (output as { url?: unknown }).url;
    if (typeof u === "string") return firstUrl(u);
    if (typeof u === "function") return firstUrl(String((u as () => unknown)()));
  }
  return null;
}

const EXT: Record<string, string> = {
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

/** Plafond de taille d'un média recopié : un clip de 5 s en 480p fait quelques Mo. */
const MAX_BYTES = 50 * 1024 * 1024;

export async function generateMedia(req: MediaRequest): Promise<MediaResult> {
  if (!replicateConfigured()) return { ok: false, fehler: "not_configured" };
  const prompt = req.prompt.trim().slice(0, 1500);
  if (!prompt) return { ok: false, fehler: "empty_prompt" };

  const seconds = Math.min(MAX_VIDEO_SECONDS, Math.max(1, Math.round(req.dauer ?? MAX_VIDEO_SECONDS)));

  const quota = await reserveMedia(req.userId, req.type);
  if (!quota.ok) {
    return {
      ok: false,
      fehler: `daily_limit_reached: höchstens ${quota.limit} ${req.type === "video" ? "Videos" : "Bilder"} pro Tag`,
    };
  }

  try {
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
      useFileOutput: false,
    });
    const model = req.type === "image" ? IMAGE_MODEL() : VIDEO_MODEL();
    const output = await replicate.run(model as `${string}/${string}`, {
      input: inputFor(model, prompt, req.type, seconds),
    });

    const src = firstUrl(output);
    if (!src) throw new Error("Replicate: keine URL in der Ausgabe");

    // On ne recopie que depuis Replicate : jamais une URL arbitraire.
    const host = new URL(src).hostname;
    if (!/(^|\.)replicate\.(delivery|com)$/.test(host)) {
      throw new Error(`Replicate: unerwarteter Host ${host}`);
    }

    const res = await fetch(src, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`Download ${res.status}`);
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    const ext = EXT[contentType];
    if (!ext || !contentType.startsWith(req.type === "image" ? "image/" : "video/")) {
      throw new Error(`Unerwarteter Inhaltstyp ${contentType || "?"}`);
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) throw new Error("Dateigröße ungültig");

    const file = `${crypto.randomUUID()}.${ext}`;
    await mediaClient.send(
      new PutObjectCommand({
        Bucket: MEDIA_BUCKET,
        Key: `media/generated/${req.userId}/${file}`,
        Body: bytes,
        ContentType: contentType,
      }),
    );

    const kostenCents = estimateMediaCostCents(req.type, seconds);
    console.log(
      `[media] ${req.type} user=${req.userId} model=${model} cost≈${kostenCents}¢ (${quota.used}/${quota.limit} heute)`,
    );
    return {
      ok: true,
      type: req.type,
      url: `/api/media/generated/${req.userId}/${file}`,
      contentType,
      kostenCents,
    };
  } catch (err) {
    await releaseMedia(req.userId, req.type).catch(() => undefined);
    console.error("[media] generation failed", err);
    return { ok: false, fehler: "generation_failed" };
  }
}
