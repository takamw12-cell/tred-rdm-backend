import { PutObjectCommand } from "@aws-sdk/client-s3";
import { generateObject } from "ai";
import { eq } from "drizzle-orm";
import { gateway } from "../agent/gateway";
import { db } from "../database";
import { generatedVideo } from "../database/schema";
import { PRIMARY_MODEL } from "../lib/ai-models";
import type { BeamDiagramPayload } from "../lib/beam-tool";
import { LANGUAGES } from "../lib/languages";
import { MEDIA_BUCKET, mediaClient } from "../lib/media-storage";
import { addOutputTokens } from "../lib/plan";
import type { VideoJobData } from "../lib/queue";
import {
  alignmentToWords,
  buildVideoPrompt,
  resolveBeam,
  sceneStartsMs,
  scriptVoiceText,
  solverSource,
  validateVideoScript,
  videoDurationMs,
  videoScriptSchema,
  type ValidatedScene,
  type VoiceWord,
} from "../lib/video-script";
import { isRealImageKey } from "../lib/video-visuals";
import { reserveChars } from "../tts/budget";

/**
 * Le pipeline de « Als Video erklären » : script (Claude) → contrôle par du
 * code → voix (ElevenLabs, horodatée) → stockage. Le lecteur joue ensuite la
 * composition avec le script et l'audio ; il n'y a pas de MP4.
 *
 * Deux façons de le lancer, même code :
 *   · dans la file (REDIS_URL) : le worker l'exécute, BullMQ reprend un échec
 *     passager 2 fois (5 s puis 10 s), puis la vidéo est marquée `failed` ;
 *   · dans le service web (sans Redis) : `runPipelineInline`, un seul essai.
 *
 * Ce fichier n'importe ni les routes ni l'authentification : le worker le
 * charge sans démarrer le service web.
 */

export type StoredScript = { scenes: ValidatedScene[]; words: VoiceWord[]; sceneStartsMs: number[]; professor?: string; beam?: BeamDiagramPayload | null; backdrop?: string | null };

/** Code d'erreur stable, lu par le navigateur pour choisir son message. */
export const VIDEO_ERRORS = ["not_grounded", "script_failed", "daily_limit", "voice_failed", "storage_failed", "timeout"] as const;
export type VideoError = (typeof VIDEO_ERRORS)[number];

/**
 * Un refus du contrôle (`not_grounded`) ou du plafond de voix (`daily_limit`)
 * est une décision, pas une panne : le rejouer paierait un script de plus pour
 * la même réponse. Les trois autres sont des pannes passagères.
 */
const RETRYABLE: ReadonlySet<VideoError> = new Set(["script_failed", "voice_failed", "storage_failed"]);

export class PipelineError extends Error {
  readonly code: VideoError;
  readonly retryable: boolean;
  constructor(code: VideoError) {
    super(code);
    this.name = "PipelineError";
    this.code = code;
    this.retryable = RETRYABLE.has(code);
  }
}

/** Message d'échec quelconque (BullMQ, réseau…) → code connu du navigateur. */
export function videoErrorCode(reason: string | undefined): VideoError {
  if ((VIDEO_ERRORS as readonly string[]).includes(reason ?? "")) return reason as VideoError;
  // Le worker est mort en plein travail plus de fois que permis.
  if (/stalled/i.test(reason ?? "")) return "timeout";
  return "script_failed";
}

export const setVideoStatus = (id: string, patch: Partial<typeof generatedVideo.$inferInsert>) =>
  db.update(generatedVideo).set(patch).where(eq(generatedVideo.id, id));

export const failVideo = (id: string, error: VideoError) => setVideoStatus(id, { status: "failed", error });

/**
 * Le script validé, gardé dans la ligne entre deux essais : si la voix échoue,
 * la reprise ne repaie ni le modèle ni le plafond de caractères.
 */
interface Draft {
  draft: true;
  scenes: ValidatedScene[];
  title: string;
  beam: BeamDiagramPayload | null;
  backdrop: string | null;
  charsReserved: boolean;
}

async function readDraft(id: string): Promise<Draft | null> {
  const [row] = await db.select({ script: generatedVideo.script, status: generatedVideo.status }).from(generatedVideo).where(eq(generatedVideo.id, id));
  if (!row?.script || row.status === "done") return null;
  try {
    const parsed = JSON.parse(row.script) as Partial<Draft>;
    return parsed.draft === true && Array.isArray(parsed.scenes) ? (parsed as Draft) : null;
  } catch {
    return null;
  }
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

/** 1. Le script, puis son contrôle par du code. */
async function writeScript(job: VideoJobData): Promise<Draft> {
  const { id, userId, req, sources } = job;
  const language = LANGUAGES[req.language]!;
  await setVideoStatus(id, { status: "script" });
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
    // La poutre de la vidéo : un calcul du chat, ou l'exemple chiffré du cours
    // passé au solveur. Jamais un schéma dessiné d'après le modèle.
    const resolved = resolveBeam(object, sources, req.question);
    const beam = resolved.payload;
    // L'image de contexte : un mot-clé de la bibliothèque, ou rien.
    const backdrop = isRealImageKey(object.backdrop) ? object.backdrop : null;
    if (resolved.rejected) console.warn(`[video] ${id} : poutre du script écartée (${resolved.rejected})`);
    const allSources = resolved.run ? [...sources, solverSource(resolved.run)] : sources;
    const checked = validateVideoScript(object, allSources, req.question, { beam: beam !== null });
    if (checked.dropped.length > 0) {
      console.warn(`[video] ${id} : ${checked.dropped.length} scène(s) supprimée(s)`, checked.dropped.map((d) => (d.detail ? `${d.reason}(${d.detail})` : d.reason)).join(", "));
    }
    if (!checked.ok) {
      console.warn(`[video] ${id} : script refusé (${checked.error}, ${checked.words} mots, ${object.scenes.length} scènes écrites, ${sources.length} sources dont ${sources.filter((x) => x.solver).length} solveur)`);
      throw new PipelineError("not_grounded");
    }
    return { draft: true, scenes: checked.scenes, title: checked.title, beam, backdrop, charsReserved: false };
  } catch (err) {
    if (err instanceof PipelineError) throw err;
    console.error(`[video] ${id} : script`, (err as Error).message?.slice(0, 300));
    throw new PipelineError("script_failed");
  }
}

/**
 * Le pipeline complet. Lève `PipelineError` ; ne marque PAS la vidéo en échec
 * lui-même : c'est l'appelant qui sait s'il reste une reprise.
 */
export async function runPipeline(job: VideoJobData): Promise<void> {
  const { id, userId, req, voiceId, professor } = job;

  // 1. Le script — ou celui d'un essai précédent, déjà payé et validé.
  const draft = (await readDraft(id)) ?? (await writeScript(job));
  const { scenes, title, beam, backdrop } = draft;

  // 2. La voix. Le plafond quotidien de caractères de l'étudiant s'applique, une seule fois.
  const text = scriptVoiceText(scenes);
  if (!draft.charsReserved) {
    if (!reserveChars(userId, text.length)) throw new PipelineError("daily_limit");
    draft.charsReserved = true;
  }
  await setVideoStatus(id, { status: "voice", title: title.slice(0, 200), script: JSON.stringify(draft) });
  let audio: Uint8Array;
  let words: VoiceWord[];
  try {
    ({ audio, words } = await synthesize(text, voiceId, req.language));
    if (audio.byteLength === 0 || words.length === 0) throw new Error("audio vide");
  } catch (err) {
    console.error(`[video] ${id} : voix`, (err as Error).message?.slice(0, 300));
    throw new PipelineError("voice_failed");
  }

  // 3. Le stockage. La durée de la vidéo est celle de la voix.
  const audioKey = `media/generated/${userId}/${id}.mp3`;
  try {
    await mediaClient.send(new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: audioKey, Body: audio, ContentType: "audio/mpeg" }));
  } catch (err) {
    console.error(`[video] ${id} : stockage`, (err as Error).message?.slice(0, 300));
    throw new PipelineError("storage_failed");
  }
  const stored: StoredScript = { scenes, words, sceneStartsMs: sceneStartsMs(scenes, words), professor, beam, backdrop };
  await setVideoStatus(id, { status: "done", script: JSON.stringify(stored), audioKey, durationMs: videoDurationMs(words) });
  console.log(`[video] ${id} : visuels ${scenes.map((sc) => sc.visual).join(",")}${beam ? " · poutre calculée" : ""}`);
  console.log(`[video] ${id} : prête, ${scenes.length} scènes, ${Math.round(videoDurationMs(words) / 1000)} s, ${text.length} caractères, langue ${req.language}`);
}

/** Sans file : le pipeline tourne dans le service web, un seul essai. */
export function runPipelineInline(job: VideoJobData): void {
  void runPipeline(job).catch(async (err) => {
    const code = err instanceof PipelineError ? err.code : "script_failed";
    if (!(err instanceof PipelineError)) console.error(`[video] ${job.id} : pipeline`, (err as Error).message?.slice(0, 300));
    await failVideo(job.id, code).catch(() => {});
  });
}
