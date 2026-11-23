import { captureServerError } from "../lib/sentry";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { generateObject } from "ai";
import { z } from "zod";
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
  allowedNumbers,
  buildVideoPrompt,
  countWords,
  animeScriptSchema,
  fromAnimeScript,
  fromMotionScript,
  motionScriptSchema,
  resolveBeam,
  sceneStartsMs,
  scriptVoiceText,
  solverSource,
  validateVideoScript,
  videoDurationMs,
  videoSceneSchema,
  videoScriptSchema,
  type ValidatedScene,
  type VideoScript,
  type VoiceWord,
} from "../lib/video-script";
import { drawnVideoReady, renderDrawnVideo, synthesizeEdge, voiceProvider } from "../lib/video-engine";
import { buildSrt, buildStoryboard, layoutScene, sketchField, sketchPromptBlock, type DrawStyle, type PlacedElement, type SketchElement, type WordRange } from "../lib/video-storyboard";
import { animeEnabled, animePromptBlock, cleanAnime, defaultAnime, fillMissingImages, type AnimeScene, type RawAnime } from "../lib/video-anime";
import { generateSceneImage } from "../lib/replicate-media";
import { cleanMotion, defaultMotion, motionEnabled, motionPromptBlock, type MotionScene, type RawMotion } from "../lib/video-motion";
import { isRealImageKey } from "../lib/video-visuals";
import { reserveChars } from "../tts/budget";

/**
 * Le pipeline de « Als Video erklären » : script (Claude) → contrôle par du
 * code → voix (ElevenLabs, horodatée) → stockage. Le lecteur joue ensuite la
 * composition avec le script et l'audio.
 *
 * Vidéo DESSINÉE (`req.style`, seulement si le moteur est installé —
 * lib/video-engine.ts) : le même script porte en plus un croquis par scène ;
 * après la voix, le moteur trace chaque élément à l'instant où la voix en
 * parle et FFmpeg assemble un MP4 (sous-titres en piste séparée). Si le dessin
 * échoue, la vidéo reste disponible dans le lecteur classique : l'étudiant ne
 * perd jamais sa vidéo pour une panne de rendu.
 *
 * Deux façons de le lancer, même code :
 *   · dans la file (REDIS_URL) : le worker l'exécute, BullMQ reprend un échec
 *     passager 2 fois (5 s puis 10 s), puis la vidéo est marquée `failed` ;
 *   · dans le service web (sans Redis) : `runPipelineInline`, un seul essai.
 *
 * Ce fichier n'importe ni les routes ni l'authentification : le worker le
 * charge sans démarrer le service web.
 */

export type StoredScript = { scenes: ValidatedScene[]; words: VoiceWord[]; sceneStartsMs: number[]; professor?: string; beam?: BeamDiagramPayload | null; backdrop?: string | null; style?: DrawStyle | null };

/** Le script quand la vidéo est dessinée : chaque scène porte en plus son croquis. */
const drawnScriptSchema = videoScriptSchema.extend({ scenes: z.array(videoSceneSchema.extend({ sketch: sketchField })) });

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
  /** Vidéo dessinée : le style, et ce qui se trace pendant chaque scène (déjà contrôlé). */
  style?: DrawStyle | null;
  drawing?: PlacedElement[][];
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
  // Le style n'est suivi que si le moteur de dessin est là : sinon la vidéo classique, sans rien dire de plus au modèle.
  const style: DrawStyle | null = req.style && drawnVideoReady() ? req.style : null;
  try {
    // Motion design (le rendu normal) : le modèle choisit des blocs et des actions, il ne dessine rien.
    // Style anime (VIDEO_ANIME=on + Replicate) : le modèle est réalisateur — décor, action, image de chaque scène.
    const anime = !style && animeEnabled();
    const motion = !style && !anime && motionEnabled();
    const { system, prompt } = buildVideoPrompt({ language, sources, question: req.question, answer: req.answer, extra: style ? sketchPromptBlock(style, req.language) : anime ? animePromptBlock() : motion ? motionPromptBlock() : undefined });
    const request = { model: gateway(PRIMARY_MODEL), system, prompt, abortSignal: AbortSignal.timeout(motion || anime ? 150_000 : 90_000) };
    let object: VideoScript;
    let usage: { outputTokens?: number } | undefined;
    if (anime) {
      const out = await generateObject({ ...request, schema: animeScriptSchema });
      object = fromAnimeScript(out.object);
      usage = out.usage;
    } else if (motion) {
      const out = await generateObject({ ...request, schema: motionScriptSchema });
      object = fromMotionScript(out.object);
      usage = out.usage;
    } else {
      ({ object, usage } = await generateObject({ ...request, schema: style ? drawnScriptSchema : videoScriptSchema }));
    }
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
    if (anime) {
      // Décor, action et bulle de chaque scène gardée, contrôlés ; les images sont générées après la voix (runPipeline).
      const allowed = allowedNumbers(allSources, req.question);
      let fallback = 0;
      checked.scenes.forEach((scene, i) => {
        const staged = cleanAnime((scene as { anime?: RawAnime }).anime, scene, allowed);
        if (!staged) fallback++;
        (scene as { anime?: AnimeScene }).anime = staged ?? defaultAnime(scene, i);
      });
      if (fallback > 0) console.warn(`[video] ${id} : anime — ${fallback} scène(s) mises en scène par le code`);
    }
    if (motion) {
      // La mise en scène de chaque scène gardée, contrôlée (nombres, icônes, formules) ; sinon celle du code.
      const allowed = allowedNumbers(allSources, req.question);
      let removed = 0;
      let fallback = 0;
      checked.scenes.forEach((scene, i) => {
        const staged = cleanMotion((scene as { motion?: RawMotion }).motion, allowed);
        removed += staged.dropped.length;
        if (!staged.motion) fallback++;
        (scene as { motion?: MotionScene }).motion = staged.motion ?? defaultMotion(scene, i);
      });
      if (removed > 0 || fallback > 0) console.warn(`[video] ${id} : mise en scène — ${removed} bloc(s) retiré(s), ${fallback} scène(s) mises en scène par le code`);
    }
    if (!style) return { draft: true, scenes: checked.scenes, title: checked.title, beam, backdrop, charsReserved: false };
    // Le croquis de chaque scène gardée, contrôlé et mis en page ; le croquis brut ne quitte pas ce fichier.
    const allowed = allowedNumbers(allSources, req.question);
    let removed = 0;
    const drawing = checked.scenes.map((scene) => {
      const laid = layoutScene(scene as ValidatedScene & { sketch?: SketchElement[] }, allowed);
      removed += laid.sketchDropped.length;
      delete (scene as { sketch?: unknown }).sketch;
      return laid.placed;
    });
    if (removed > 0) console.warn(`[video] ${id} : ${removed} tracé(s) du croquis retiré(s) par le contrôle`);
    return { draft: true, scenes: checked.scenes, title: checked.title, beam, backdrop, charsReserved: false, style, drawing };
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
  let starts: number[];
  let ranges: WordRange[];
  try {
    if (voiceProvider() === "edge") {
      // Une synthèse par scène : le début de chacune est connu exactement, dans toutes les langues.
      ({ audio, words, ranges, sceneStartsMs: starts } = await synthesizeEdge(scenes.map((s) => s.voiceover.trim()), req.language));
    } else {
      ({ audio, words } = await synthesize(text, voiceId, req.language));
      starts = sceneStartsMs(scenes, words);
      // La voix a lu exactement le texte envoyé : les mots se comptent.
      let k = 0;
      ranges = scenes.map((s) => ({ from: Math.min(k, words.length), to: Math.min((k += countWords(s.voiceover)), words.length) }));
    }
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
  // 3 bis. Style anime : le décor de chaque scène, généré en parallèle. La voix est déjà payée :
  // une image manquante prend celle d'une scène voisine ; sans aucune image, la vidéo repasse en motion design.
  const staged = scenes as (ValidatedScene & { anime?: AnimeScene; motion?: MotionScene })[];
  if (staged.some((s) => s.anime && !s.anime.image)) {
    // Deux scènes qui montrent la même chose partagent leur image.
    const byPrompt = new Map<string, Promise<string | null>>();
    await Promise.all(
      staged.map(async (s) => {
        if (!s.anime || s.anime.image) return;
        const key = s.anime.prompt;
        if (!byPrompt.has(key)) byPrompt.set(key, generateSceneImage(userId, key));
        const url = await byPrompt.get(key)!;
        if (url) s.anime.image = url;
      }),
    );
    const made = staged.filter((s) => s.anime?.image).length;
    if (!fillMissingImages(staged)) {
      console.warn(`[video] ${id} : anime — aucune image générée, la vidéo passe en motion design`);
      staged.forEach((s, i) => {
        delete s.anime;
        s.motion = defaultMotion(s, i);
      });
    } else console.log(`[video] ${id} : anime — ${byPrompt.size} image(s) demandée(s), ${made}/${staged.length} scènes servies`);
  }

  // 4. Vidéo dessinée : le dessin calé sur la voix, puis l'assemblage en MP4.
  const durationMs = videoDurationMs(words);
  let videoKey: string | null = null;
  if (draft.style && draft.drawing && drawnVideoReady()) {
    try {
      await setVideoStatus(id, { status: "drawing" });
      const storyboard = buildStoryboard({
        style: draft.style,
        scenes: draft.drawing.map((placed, i) => ({ placed, wordCount: countWords(scenes[i]?.voiceover ?? "") })),
        words,
        ranges,
        sceneStartsMs: starts,
        durationMs,
      });
      let shown = 0;
      const drawn = await renderDrawnVideo({
        storyboard,
        audio,
        srt: buildSrt(words),
        language: req.language,
        onProgress: (p) => {
          // Un écrit en base par tranche de 10 % : assez pour la barre, sans bavarder avec Turso.
          const pct = Math.floor(p * 10) * 10;
          if (pct <= shown) return;
          shown = pct;
          void setVideoStatus(id, { status: pct >= 100 ? "assembly" : `drawing:${pct}` }).catch(() => {});
        },
      });
      await setVideoStatus(id, { status: "assembly" });
      const key = `media/generated/${userId}/${id}.mp4`;
      await mediaClient.send(new PutObjectCommand({ Bucket: MEDIA_BUCKET, Key: key, Body: drawn.video, ContentType: "video/mp4" }));
      videoKey = key;
      console.log(`[video] ${id} : dessinée (${draft.style}), ${storyboard.elements.length} tracés, ${drawn.video.byteLength} octets, rendu ${drawn.seconds} s${drawn.dropped.length ? `, ${drawn.dropped.length} tracé(s) sauté(s)` : ""}`);
    } catch (err) {
      // Le dessin a échoué : la vidéo reste jouable dans le lecteur classique (script + voix).
      console.error(`[video] ${id} : dessin`, (err as Error).message?.slice(0, 300));
      captureServerError(err, { feature: "video_generation", userId, action: "video drawing", tags: { style: draft.style } });
    }
  }
  const stored: StoredScript = { scenes, words, sceneStartsMs: starts, professor, beam, backdrop, style: videoKey ? draft.style : null };
  await setVideoStatus(id, { status: "done", script: JSON.stringify(stored), audioKey, ...(videoKey ? { videoKey } : {}), durationMs });
  console.log(`[video] ${id} : visuels ${scenes.map((sc) => sc.visual).join(",")}${beam ? " · poutre calculée" : ""}`);
  console.log(`[video] ${id} : prête, ${scenes.length} scènes, ${Math.round(durationMs / 1000)} s, ${text.length} caractères, langue ${req.language}`);
}

/** Sans file : le pipeline tourne dans le service web, un seul essai. */
export function runPipelineInline(job: VideoJobData): void {
  void runPipeline(job).catch(async (err) => {
    const code = err instanceof PipelineError ? err.code : "script_failed";
    if (!(err instanceof PipelineError)) console.error(`[video] ${job.id} : pipeline`, (err as Error).message?.slice(0, 300));
    // Un refus prévu (limite du jour) n'est pas une panne ; tout le reste part dans Sentry.
    if (code !== "daily_limit") captureServerError(err, { feature: "video_generation", userId: job.userId, action: "video pipeline", tags: { code } });
    await failVideo(job.id, code).catch(() => {});
  });
}
