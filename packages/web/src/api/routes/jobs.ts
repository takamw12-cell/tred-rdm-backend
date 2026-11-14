import { and, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { requestSession } from "../lib/request-session";
import { db } from "../database";
import { generatedVideo } from "../database/schema";
import { IMPORT_JOB_ID_RE, VIDEO_JOB_ID_RE, importErrorCode, importQueue, publicStatus, queueConfigured, videoJobView, type ImportJobResult } from "../lib/queue";

/**
 * GET /api/jobs/:jobId — l'état d'un travail de la file, pour son propriétaire.
 *
 * Deux types : « import-pdf » (imp_…) et « generate-video » (gv_…).
 *
 *   { jobId, type, status: "pending" | "processing" | "done" | "failed",
 *     progress: 0…100, result?, error? }
 *
 * L'état vient de Redis (BullMQ), pas d'une table : un aller-retour, aucune
 * migration. Un travail terminé y reste une heure, un échec un jour
 * (lib/queue/index.ts). Un identifiant inconnu, expiré ou appartenant à un
 * autre compte répond le même 404.
 */

export function registerJobRoutes(app: Hono) {
  app.get("/api/jobs/:jobId", async (c) => {
    // Le suivi d'un travail est interrogé chaque seconde : la session déjà lue par le garde-fou suffit.
    const session = await requestSession(c.req.raw);
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const jobId = c.req.param("jobId");
    c.header("Cache-Control", "no-store");

    // Une vidéo explicative : son état est dans sa ligne `generated_video`
    // (le worker l'y écrit à chaque étape). Le contenu se lit sur /api/video/:id.
    if (VIDEO_JOB_ID_RE.test(jobId)) {
      const [row] = await db
        .select({ status: generatedVideo.status, error: generatedVideo.error })
        .from(generatedVideo)
        .where(and(eq(generatedVideo.id, jobId), eq(generatedVideo.userId, session.user.id)));
      if (!row) return c.json({ error: "not found" }, 404);
      const v = videoJobView(row.status);
      return c.json({
        jobId,
        type: "generate-video" as const,
        ...v,
        ...(v.status === "done" ? { result: { videoId: jobId } } : {}),
        ...(v.status === "failed" ? { error: row.error ?? "script_failed" } : {}),
      });
    }

    if (!IMPORT_JOB_ID_RE.test(jobId) || !queueConfigured()) return c.json({ error: "not found" }, 404);

    let job;
    let state: string;
    try {
      job = await importQueue().getJob(jobId);
      if (!job || job.data.userId !== session.user.id) return c.json({ error: "not found" }, 404);
      state = await job.getState();
    } catch (err) {
      // Redis ne répond pas : le navigateur réessaie au prochain tour.
      console.error("[jobs] état illisible", (err as Error).message?.slice(0, 200));
      return c.json({ error: "queue_unavailable" }, 503);
    }

    const status = publicStatus(state, job.attemptsMade);
    return c.json({
      jobId,
      type: "import-pdf" as const,
      status,
      progress: status === "done" ? 100 : typeof job.progress === "number" ? job.progress : 0,
      ...(status === "done" ? { result: job.returnvalue as ImportJobResult } : {}),
      ...(status === "failed" ? { error: importErrorCode(job.failedReason) } : {}),
    });
  });
}
