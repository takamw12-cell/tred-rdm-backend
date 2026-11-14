import type { Hono } from "hono";
import { auth } from "../auth";
import { IMPORT_JOB_ID_RE, importErrorCode, importQueue, publicStatus, queueConfigured, type ImportJobResult } from "../lib/queue";

/**
 * GET /api/jobs/:jobId — l'état d'un travail de la file, pour son propriétaire.
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
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const jobId = c.req.param("jobId");
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
    c.header("Cache-Control", "no-store");
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
