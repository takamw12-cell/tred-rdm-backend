import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { Hono } from "hono";
import { AccessToken } from "livekit-server-sdk";
import { auth } from "../auth";
import {
  MAX_MEDIA_BYTES,
  MEDIA_BUCKET,
  MEDIA_KINDS,
  MEDIA_TYPES,
  mediaClient,
  mediaStorageConfigured,
} from "../lib/media-storage";
import { unconfigured } from "./pipeline";

/**
 * Routes HTTP du professeur virtuel. Elles sont branchées, mais elles
 * répondent 503 « not_configured » tant que les clés manquent : l'app
 * ne change donc pas de comportement avant que tu fournisses les clés.
 */

type AdminGuard = (c: {
  req: { raw: Request };
}) => Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 404 }>;

export function registerAvatarRoutes(app: Hono, requireAdmin: AdminGuard) {
  /**
   * Jeton d'accès LiveKit pour la room personnelle de l'étudiant.
   * La room est choisie par le SERVEUR (hoersaal-<userId>) : un client ne peut
   * pas demander à rejoindre la room de quelqu'un d'autre.
   */
  app.post("/api/livekit/token", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

    const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return c.json({ error: "not_configured" }, 503);
    }

    const room = unconfigured.transport.roomFor(session.user.id);
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity: session.user.id,
      name: session.user.name ?? undefined,
      ttl: "10m",
    });
    token.addGrant({ room, roomJoin: true, canPublish: true, canSubscribe: true });

    return c.json({ url: LIVEKIT_URL, room, token: await token.toJwt() });
  });

  /**
   * Dépôt d'un média (vidéo HeyGen, export Figma) dans le stockage objet.
   * Réservé aux admins : ce sont des assets du produit, pas des fichiers
   * d'étudiants. Formulaire multipart : `file` + `kind`.
   */
  app.post("/api/storage/upload", async (c) => {
    const guard = await requireAdmin(c);
    if (!guard.ok) return c.json({ error: "NOT_FOUND" }, guard.status);
    if (!mediaStorageConfigured()) return c.json({ error: "not_configured" }, 503);

    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > MAX_MEDIA_BYTES) return c.json({ error: "too_large" }, 413);

    let form: FormData;
    try {
      form = await c.req.formData();
    } catch {
      return c.json({ error: "invalid form data" }, 400);
    }

    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "file required" }, 400);
    if (file.size === 0) return c.json({ error: "empty file" }, 400);
    if (file.size > MAX_MEDIA_BYTES) return c.json({ error: "too_large" }, 413);

    const ext = MEDIA_TYPES[file.type];
    if (!ext) return c.json({ error: "unsupported_format" }, 415);

    const kind = String(form.get("kind") ?? "");
    if (!MEDIA_KINDS.has(kind)) return c.json({ error: "invalid kind" }, 400);

    // Le nom d'origine n'entre jamais dans la clé : pas de « ../ », pas de collision.
    const key = `media/${kind}/${crypto.randomUUID()}.${ext}`;
    try {
      await mediaClient.send(
        new PutObjectCommand({
          Bucket: MEDIA_BUCKET,
          Key: key,
          Body: new Uint8Array(await file.arrayBuffer()),
          ContentType: file.type,
        }),
      );
    } catch (err) {
      console.error("[media] upload failed", err);
      return c.json({ error: "storage_failed" }, 502);
    }

    return c.json({ key, size: file.size, contentType: file.type });
  });
}
