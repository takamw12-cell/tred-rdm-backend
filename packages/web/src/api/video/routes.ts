import { GetObjectCommand } from "@aws-sdk/client-s3";
import { and, desc, eq, gt } from "drizzle-orm";
import type { Hono } from "hono";
import { auth } from "../auth";
import { elevenLabsConfigured, resolvePremiumVoice } from "../avatar/elevenlabs";
import { db } from "../database";
import { document, generatedVideo, solverResult } from "../database/schema";
import { LANGUAGES } from "../lib/languages";
import { MEDIA_BUCKET, mediaClient, mediaStorageConfigured } from "../lib/media-storage";
import { consume, quotaError, tokenCapError, withinTokenCap } from "../lib/plan";
import { queueConfigured, queueReady, videoQueue, type VideoJobData } from "../lib/queue";
import { readProfessor } from "../lib/professor-store";
import { selectRelevantContext } from "../lib/retrieval";
import { MAX_SOLVER_RUNS, SOLVER_WINDOW_MS, serializeSolverRun, type SolverRun } from "../lib/solver-results";
import { solverSource, videoRequestSchema, type VideoRequest, type VideoSource } from "../lib/video-script";
import { visibleDocuments } from "../lib/visible-documents";
import { myCourseIds } from "../routes/courses";
import { requestSession } from "../lib/request-session";
import { userRateLimit, USER_LIMITS } from "../middleware/rate-limit";
import { failVideo, runPipelineInline, type StoredScript } from "./pipeline";

/**
 * « Als Video erklären » — la vidéo explicative sur mesure.
 *
 *   POST /api/video/generate   crée la vidéo, répond tout de suite { id }
 *   GET  /api/video/:id        l'avancement (polling), puis le script et l'audio
 *   GET  /api/video/:id/audio  la voix (MP3), réservée au propriétaire
 *   POST /api/video/:id/save   « Im Dashboard speichern »
 *   GET  /api/video            les vidéos sauvegardées (tableau de bord)
 *
 * Le pipeline tourne après la réponse : sources → script (Claude) → contrôle
 * par du code → voix (ElevenLabs, horodatée) → stockage. Il n'y a pas de MP4 :
 * le lecteur joue la composition avec le script et l'audio. La durée est celle
 * de la voix.
 *
 * ── Zéro hallucination ────────────────────────────────────────────────────
 * Deux sources seulement : les documents de cours de l'étudiant, et les
 * calculs que les solveurs ont faits dans ce chat (table `solver_result`,
 * remplie par `recordSolverRun`). Sans l'une ni l'autre, la vidéo est REFUSÉE
 * (422 no_documents) : le navigateur invite l'étudiant à déposer son cours.
 * Le script est ensuite contrôlé par lib/video-script.ts : tout nombre qui
 * n'est ni dans les documents ni dans une sortie de solveur fait supprimer sa
 * scène ; s'il ne reste pas assez de scènes prouvées, la vidéo échoue
 * (not_grounded) plutôt que d'inventer.
 *
 * ── Inerte sans clés ──────────────────────────────────────────────────────
 * Sans ANTHROPIC_API_KEY ou ELEVENLABS_API_KEY : 503 not_configured, et le
 * bouton garde son comportement actuel.
 */

const MAX_CONTEXT_CHARS = 24_000;
/**
 * Au-delà, le travail est considéré comme perdu (redémarrage du serveur).
 * Avec la file, une vidéo peut attendre son tour derrière d'autres et être
 * reprise deux fois : on lui laisse vingt minutes.
 */
const staleMs = () => (queueConfigured() ? 20 : 5) * 60_000;
const ID_RE = /^gv_[a-f0-9]{20}$/;

/**
 * Enregistre un calcul de solveur réussi (appelé par le tuteur, lib/solver-guard.ts).
 * Ne lève jamais et ne retarde pas la réponse du chat : sans la table
 * (migre-solver-result.mjs pas encore lancé), le calcul n'est simplement pas gardé.
 */
let warnedMissingTable = false;
export function recordSolverRun(userId: string, conversationId: string | null, run: SolverRun): void {
  const row = serializeSolverRun(run);
  if (!row) return;
  void db
    .insert(solverResult)
    .values({ id: `sr_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`, userId, conversationId, ...row })
    .catch((err) => {
      if (warnedMissingTable) return;
      warnedMissingTable = true;
      console.error("[solver] résultat non enregistré — lancer migre-solver-result.mjs", (err as Error).message?.slice(0, 200));
    });
}

/**
 * Les calculs récents de l'étudiant : ceux de cette conversation si elle est
 * connue, sinon ceux des deux dernières heures. Les plus récents d'abord.
 */
async function recentSolverRuns(userId: string, chatId?: string | null): Promise<SolverRun[]> {
  try {
    const scope = chatId
      ? eq(solverResult.conversationId, chatId)
      : gt(solverResult.createdAt, new Date(Date.now() - SOLVER_WINDOW_MS));
    const rows = await db
      .select()
      .from(solverResult)
      .where(and(eq(solverResult.userId, userId), scope))
      .orderBy(desc(solverResult.createdAt))
      .limit(MAX_SOLVER_RUNS);
    return rows.map((r) => ({ solver: r.solver, input: JSON.parse(r.input), output: JSON.parse(r.output) }));
  } catch {
    return [];
  }
}

/** La voix de la vidéo : une voix imposée pour la langue, sinon celle du professeur choisi. */
function voiceFor(language: string, professor?: string | null): string | null {
  const forced = process.env[`ELEVENLABS_VIDEO_VOICE_${language.toUpperCase()}`]?.trim();
  return forced || resolvePremiumVoice(professor ?? undefined)?.voiceId || null;
}

export function registerVideoRoutes(app: Hono) {
  app.post("/api/video/generate", async (c) => {
    const session = await requestSession(c.req.raw);
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    if (!process.env.ANTHROPIC_API_KEY || !elevenLabsConfigured() || !mediaStorageConfigured()) {
      return c.json({ error: "not_configured" }, 503);
    }
    const uid = session.user.id;

    const parsed = videoRequestSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid body" }, 400);
    // La langue de l'étudiant, exactement : jamais de repli silencieux sur l'allemand.
    const language = parsed.data.language.trim().toLowerCase().split("-")[0]!;
    if (!LANGUAGES[language]) return c.json({ error: "unsupported_language" }, 400);
    const req: VideoRequest = { ...parsed.data, language };

    // Le professeur de la vidéo (sa voix, son hologramme) : celui que l'étudiant a choisi.
    const professor = req.professor ?? (await readProfessor(uid));
    const voiceId = voiceFor(language, professor);
    if (!voiceId) return c.json({ error: "not_configured" }, 503);

    // Les mêmes documents que le chat : les miens, et ceux partagés dans mes cours.
    const visible = visibleDocuments(uid, await myCourseIds(uid));
    const rows = req.docId
      ? await db.select().from(document).where(and(eq(document.id, req.docId), visible))
      : req.semesterId
        ? await db.select().from(document).where(and(eq(document.semesterId, req.semesterId), eq(document.userId, uid)))
        : await db.select().from(document).where(visible);
    const docs = rows.filter((d) => (d.textContent ?? "").trim().length > 0).map((d) => ({ title: d.title, kind: d.kind, content: d.textContent ?? "" }));
    const runs = await recentSolverRuns(uid, req.chatId);
    // Zéro invention : sans cours ni calcul de solveur, pas de vidéo. Le navigateur invite à déposer le cours.
    if (docs.length === 0 && runs.length === 0) return c.json({ error: "no_documents" }, 422);
    const excerpts = docs.length > 0 ? selectRelevantContext(docs, `${req.question}\n${req.answer}`.slice(0, 4000), MAX_CONTEXT_CHARS).sources : [];
    // Les extraits du cours d'abord, puis les calculs des solveurs : tous numérotés [S1], [S2]…
    const sources: VideoSource[] = [...excerpts, ...runs.map(solverSource)];

    // Par COMPTE : 5 vidéos par jour. Après les refus ci-dessus (pas de
    // cours, langue inconnue), qui ne consomment donc pas la limite.
    const limited = await userRateLimit(c, uid, USER_LIMITS.video());
    if (limited) return limited;

    const cap = await withinTokenCap(uid);
    if (!cap.ok) return c.json(tokenCapError(cap.used, cap.cap), 402);
    const quota = await consume(uid, "video");
    if (!quota.ok) return c.json(quotaError(quota), 402);

    const id = `gv_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    try {
      await db.insert(generatedVideo).values({
        id,
        userId: uid,
        chatId: req.chatId ?? null,
        messageId: req.messageId ?? null,
        prompt: req.question.slice(0, 2000),
        language,
        status: "pending",
      });
    } catch (err) {
      // Table absente : migre-generated-video.mjs n'a pas tourné.
      console.error("[video] table generated_video illisible — lancer migre-generated-video.mjs", (err as Error).message);
      return c.json({ error: "not_migrated" }, 503);
    }

    // Avec la file (REDIS_URL) : un travail « generate-video », traité par le
    // worker et repris 2 fois en cas de panne passagère. Sans elle, ou si
    // Redis ne répond pas : le pipeline tourne ici, après la réponse.
    const job: VideoJobData = { id, userId: uid, req, sources, voiceId, professor };
    let queued = false;
    if (queueReady()) {
      try {
        await videoQueue().add("generate-video", job, { jobId: id });
        queued = true;
      } catch (err) {
        console.error(`[video] ${id} : file indisponible, pipeline dans le service web`, (err as Error).message?.slice(0, 200));
      }
    }
    if (!queued) runPipelineInline(job);
    return c.json({ id, status: "pending" }, 202);
  });

  app.get("/api/video", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    try {
      const rows = await db
        .select({ id: generatedVideo.id, title: generatedVideo.title, language: generatedVideo.language, durationMs: generatedVideo.durationMs, createdAt: generatedVideo.createdAt })
        .from(generatedVideo)
        .where(and(eq(generatedVideo.userId, session.user.id), eq(generatedVideo.saved, true), eq(generatedVideo.status, "done")))
        .orderBy(desc(generatedVideo.createdAt))
        .limit(50);
      return c.json({ videos: rows });
    } catch {
      // Table absente : la section du tableau de bord reste simplement vide.
      return c.json({ videos: [] });
    }
  });

  app.get("/api/video/:id", async (c) => {
    // Interrogé toutes les 1,5 s pendant la préparation : la session du garde-fou suffit.
    const session = await requestSession(c.req.raw);
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
    const [row] = await db.select().from(generatedVideo).where(and(eq(generatedVideo.id, id), eq(generatedVideo.userId, session.user.id)));
    if (!row) return c.json({ error: "not found" }, 404);

    // Un travail resté en cours trop longtemps a été perdu (redémarrage du serveur).
    if (row.status !== "done" && row.status !== "failed" && Date.now() - row.createdAt.getTime() > staleMs()) {
      await failVideo(id, "timeout");
      return c.json({ id, status: "failed", error: "timeout" });
    }
    if (row.status !== "done") return c.json({ id, status: row.status, error: row.error ?? undefined, title: row.title });

    const script = JSON.parse(row.script ?? "{}") as Partial<StoredScript>;
    return c.json({
      id,
      status: "done",
      title: row.title,
      language: row.language,
      durationMs: row.durationMs,
      saved: row.saved,
      createdAt: row.createdAt,
      audioUrl: `/api/video/${id}/audio`,
      scenes: script.scenes ?? [],
      words: script.words ?? [],
      sceneStartsMs: script.sceneStartsMs ?? [],
      professor: script.professor ?? null,
      beam: script.beam ?? null,
      backdrop: script.backdrop ?? null,
    });
  });

  app.get("/api/video/:id/audio", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
    const [row] = await db
      .select({ audioKey: generatedVideo.audioKey })
      .from(generatedVideo)
      .where(and(eq(generatedVideo.id, id), eq(generatedVideo.userId, session.user.id)));
    if (!row?.audioKey) return c.json({ error: "not found" }, 404);
    try {
      const obj = await mediaClient.send(new GetObjectCommand({ Bucket: MEDIA_BUCKET, Key: row.audioKey }));
      if (!obj.Body) return c.json({ error: "not found" }, 404);
      return new Response(obj.Body.transformToWebStream(), {
        headers: {
          "Content-Type": "audio/mpeg",
          ...(obj.ContentLength ? { "Content-Length": String(obj.ContentLength) } : {}),
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return c.json({ error: "not found" }, 404);
    }
  });

  app.post("/api/video/:id/save", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
    const body = (await c.req.json().catch(() => null)) as { saved?: unknown } | null;
    const saved = body?.saved !== false;
    const updated = await db
      .update(generatedVideo)
      .set({ saved })
      .where(and(eq(generatedVideo.id, id), eq(generatedVideo.userId, session.user.id), eq(generatedVideo.status, "done")))
      .returning({ id: generatedVideo.id });
    if (updated.length === 0) return c.json({ error: "not found" }, 404);
    return c.json({ id, saved });
  });
}
