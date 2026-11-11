import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { generateObject } from "ai";
import { and, desc, eq } from "drizzle-orm";
import type { Hono } from "hono";
import { gateway } from "../agent/gateway";
import { auth } from "../auth";
import { elevenLabsConfigured, resolvePremiumVoice } from "../avatar/elevenlabs";
import { db } from "../database";
import { document, generatedVideo } from "../database/schema";
import { PRIMARY_MODEL } from "../lib/ai-models";
import { LANGUAGES } from "../lib/languages";
import { MEDIA_BUCKET, mediaClient, mediaStorageConfigured } from "../lib/media-storage";
import { addOutputTokens, consume, quotaError, tokenCapError, withinTokenCap } from "../lib/plan";
import { selectRelevantContext } from "../lib/retrieval";
import {
  alignmentToWords,
  buildVideoPrompt,
  sceneStartsMs,
  scriptVoiceText,
  validateVideoScript,
  videoDurationMs,
  videoRequestSchema,
  videoScriptSchema,
  type ValidatedScene,
  type VideoRequest,
  type VideoSource,
  type VoiceWord,
} from "../lib/video-script";
import { visibleDocuments } from "../lib/visible-documents";
import { myCourseIds } from "../routes/courses";
import { reserveChars } from "../tts/budget";

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
 * Sans document de cours, la vidéo est REFUSÉE (422 no_documents) : le
 * navigateur invite l'étudiant à déposer son cours. Avec documents, le script
 * est contrôlé par lib/video-script.ts ; s'il ne reste pas assez de scènes
 * prouvées, la vidéo échoue (not_grounded) plutôt que d'inventer.
 *
 * ── Inerte sans clés ──────────────────────────────────────────────────────
 * Sans ANTHROPIC_API_KEY ou ELEVENLABS_API_KEY : 503 not_configured, et le
 * bouton garde son comportement actuel.
 */

const MAX_CONTEXT_CHARS = 24_000;
/** Au-delà, le travail est considéré comme perdu (redémarrage du serveur). */
const STALE_MS = 5 * 60_000;
const ID_RE = /^gv_[a-f0-9]{20}$/;

type StoredScript = { scenes: ValidatedScene[]; words: VoiceWord[]; sceneStartsMs: number[] };

/** Code d'erreur stable, lu par le navigateur pour choisir son message. */
type VideoError = "not_grounded" | "script_failed" | "daily_limit" | "voice_failed" | "storage_failed" | "timeout";

const setStatus = (id: string, patch: Partial<typeof generatedVideo.$inferInsert>) =>
  db.update(generatedVideo).set(patch).where(eq(generatedVideo.id, id));

const fail = (id: string, error: VideoError) => setStatus(id, { status: "failed", error });

/** La voix de la vidéo : une voix imposée pour la langue, sinon celle du professeur choisi. */
function voiceFor(language: string, professor?: string | null): string | null {
  const forced = process.env[`ELEVENLABS_VIDEO_VOICE_${language.toUpperCase()}`]?.trim();
  return forced || resolvePremiumVoice(professor ?? undefined)?.voiceId || null;
}

/**
 * ElevenLabs « with-timestamps » : le MP3 et l'instant de chaque caractère.
 * `language_code` fixe la phonétique de la langue de l'étudiant ; certains
 * modèles le refusent (400) : on recommence alors sans lui, le modèle
 * multilingue reconnaît la langue du texte.
 */
async function synthesize(text: string, voiceId: string, language: string): Promise<{ audio: Uint8Array; words: VoiceWord[] }> {
  const call = (withLanguage: boolean) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "content-type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: process.env.ELEVENLABS_VIDEO_MODEL_ID || process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2",
        ...(withLanguage ? { language_code: language } : {}),
        // Stabilité basse et un peu de style : une voix qui explique, pas qui lit.
        voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(120_000),
    });
  let res = await call(true);
  if (res.status === 400 || res.status === 422) res = await call(false);
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { audio_base64: string; alignment: Parameters<typeof alignmentToWords>[0] };
  return { audio: new Uint8Array(Buffer.from(data.audio_base64, "base64")), words: alignmentToWords(data.alignment) };
}

/** Le pipeline, après la réponse HTTP. Chaque étape met `status` à jour pour le polling. */
async function runPipeline(job: { id: string; userId: string; req: VideoRequest; sources: VideoSource[]; voiceId: string }): Promise<void> {
  const { id, userId, req, sources, voiceId } = job;
  const language = LANGUAGES[req.language]!;

  // 1. Le script, puis son contrôle par du code.
  await setStatus(id, { status: "script" });
  let scenes: ValidatedScene[];
  let title: string;
  try {
    const { system, prompt } = buildVideoPrompt({ language, sources, question: req.question, answer: req.answer });
    const { object, usage } = await generateObject({
      model: gateway(PRIMARY_MODEL),
      schema: videoScriptSchema,
      system,
      prompt,
      abortSignal: AbortSignal.timeout(90_000),
    });
    void addOutputTokens(userId, usage?.outputTokens ?? 0);
    const checked = validateVideoScript(object, sources, req.question);
    if (checked.dropped.length > 0) {
      console.warn(`[video] ${id} : ${checked.dropped.length} scène(s) supprimée(s)`, checked.dropped.map((d) => d.reason).join(", "));
    }
    if (!checked.ok) {
      console.warn(`[video] ${id} : script refusé (${checked.error}, ${checked.words} mots)`);
      return void (await fail(id, "not_grounded"));
    }
    scenes = checked.scenes;
    title = checked.title;
  } catch (err) {
    console.error(`[video] ${id} : script`, (err as Error).message?.slice(0, 300));
    return void (await fail(id, "script_failed"));
  }

  // 2. La voix. Le plafond quotidien de caractères de l'étudiant s'applique.
  await setStatus(id, { status: "voice", title: title.slice(0, 200) });
  const text = scriptVoiceText(scenes);
  if (!reserveChars(userId, text.length)) return void (await fail(id, "daily_limit"));
  let audio: Uint8Array;
  let words: VoiceWord[];
  try {
    ({ audio, words } = await synthesize(text, voiceId, req.language));
    if (audio.byteLength === 0 || words.length === 0) throw new Error("audio vide");
  } catch (err) {
    console.error(`[video] ${id} : voix`, (err as Error).message?.slice(0, 300));
    return void (await fail(id, "voice_failed"));
  }

  // 3. Le stockage. La durée de la vidéo est celle de la voix.
  const audioKey = `media/generated/${userId}/${id}.mp3`;
  try {
    await mediaClient.send(new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: audioKey, Body: audio, ContentType: "audio/mpeg" }));
  } catch (err) {
    console.error(`[video] ${id} : stockage`, (err as Error).message?.slice(0, 300));
    return void (await fail(id, "storage_failed"));
  }
  const stored: StoredScript = { scenes, words, sceneStartsMs: sceneStartsMs(scenes, words) };
  await setStatus(id, { status: "done", script: JSON.stringify(stored), audioKey, durationMs: videoDurationMs(words) });
  console.log(`[video] ${id} : prête, ${scenes.length} scènes, ${Math.round(videoDurationMs(words) / 1000)} s, ${text.length} caractères, langue ${req.language}`);
}

export function registerVideoRoutes(app: Hono) {
  app.post("/api/video/generate", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
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

    const voiceId = voiceFor(language, req.professor);
    if (!voiceId) return c.json({ error: "not_configured" }, 503);

    // Les mêmes documents que le chat : les miens, et ceux partagés dans mes cours.
    const visible = visibleDocuments(uid, await myCourseIds(uid));
    const rows = req.docId
      ? await db.select().from(document).where(and(eq(document.id, req.docId), visible))
      : req.semesterId
        ? await db.select().from(document).where(and(eq(document.semesterId, req.semesterId), eq(document.userId, uid)))
        : await db.select().from(document).where(visible);
    const docs = rows.filter((d) => (d.textContent ?? "").trim().length > 0).map((d) => ({ title: d.title, kind: d.kind, content: d.textContent ?? "" }));
    // Zéro invention : sans cours, pas de vidéo. Le navigateur invite à déposer le cours.
    if (docs.length === 0) return c.json({ error: "no_documents" }, 422);
    const { sources } = selectRelevantContext(docs, `${req.question}\n${req.answer}`.slice(0, 4000), MAX_CONTEXT_CHARS);

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

    // Le pipeline continue après la réponse ; une erreur imprévue marque la vidéo en échec.
    void runPipeline({ id, userId: uid, req, sources, voiceId }).catch(async (err) => {
      console.error(`[video] ${id} : pipeline`, (err as Error).message?.slice(0, 300));
      await fail(id, "script_failed").catch(() => {});
    });
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
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "UNAUTHORIZED" }, 401);
    const id = c.req.param("id");
    if (!ID_RE.test(id)) return c.json({ error: "not found" }, 404);
    const [row] = await db.select().from(generatedVideo).where(and(eq(generatedVideo.id, id), eq(generatedVideo.userId, session.user.id)));
    if (!row) return c.json({ error: "not found" }, 404);

    // Un travail resté en cours trop longtemps a été perdu (redémarrage du serveur).
    if (row.status !== "done" && row.status !== "failed" && Date.now() - row.createdAt.getTime() > STALE_MS) {
      await fail(id, "timeout");
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
