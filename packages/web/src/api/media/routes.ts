import { GetObjectCommand } from "@aws-sdk/client-s3";
import type { Hono } from "hono";
import { auth } from "../auth";
import { MEDIA_BUCKET, mediaClient } from "../lib/media-storage";

/**
 * Lecture des images et vidéos générées par le tuteur.
 *
 * Réservé au propriétaire : l'identifiant dans le chemin doit être celui de
 * la session. Le nom de fichier est un UUID + extension, vérifié par regex :
 * pas de « ../ », pas de clé arbitraire dans le bucket.
 */
const FILE_RE = /^[0-9a-f-]{36}\.(webp|png|jpg|mp4|webm)$/;

export function registerMediaRoutes(app: Hono) {
  app.get("/api/media/generated/:userId/:file", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);

    const { userId, file } = c.req.param();
    if (userId !== session.user.id) return c.json({ error: "FORBIDDEN" }, 403);
    if (!FILE_RE.test(file)) return c.json({ error: "not found" }, 404);

    try {
      const obj = await mediaClient.send(
        new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: `media/generated/${userId}/${file}` }),
      );
      if (!obj.Body) return c.json({ error: "not found" }, 404);
      return new Response(obj.Body.transformToWebStream(), {
        headers: {
          "Content-Type": obj.ContentType ?? "application/octet-stream",
          ...(obj.ContentLength ? { "Content-Length": String(obj.ContentLength) } : {}),
          // Privé : jamais mis en cache par un proxy partagé.
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return c.json({ error: "not found" }, 404);
    }
  });
}
