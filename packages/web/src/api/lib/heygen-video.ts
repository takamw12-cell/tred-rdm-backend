/**
 * HeyGen — vidéo d'avatar à partir de NOTRE voix (API v3, https://api.heygen.com).
 *
 * L'avatar ne lit pas un texte : il bouge les lèvres sur le fichier audio
 * d'ElevenLabs. La voix et les mots horodatés restent donc ceux de la vidéo,
 * et l'avatar démarre à t = 0 comme elle.
 *
 * Trois appels : POST /v3/assets (l'audio) → POST /v3/videos (l'avatar) →
 * GET /v3/videos/{id} jusqu'à « completed ». Les API v1/v2 sont retirées
 * depuis le 31 octobre 2026.
 *
 * Deux sorties, au choix :
 *   - "green" : MP4 sur fond vert uni, détouré ensuite par FFmpeg (chromakey).
 *     Marche avec tous les avatars.
 *   - "alpha" : WebM à fond transparent. HeyGen refuse un avatar qui n'a pas
 *     été entraîné avec le détourage, et refuse `background` dans la même requête.
 *
 * Variables : HEYGEN_VIDEO_API_KEY (clé de heygen.com) et HEYGEN_VIDEO_AVATAR_ID
 * (l'identifiant d'un « look », pas d'un groupe). Ce ne sont PAS HEYGEN_API_KEY /
 * HEYGEN_AVATAR_ID : celles-ci appartiennent à l'avatar temps réel LiveAvatar
 * (api/avatar/heygen.ts), dont la clé vient d'une autre console.
 *
 * Aucun effet de bord au chargement ; `fetch` s'injecte pour les tests.
 */
export const HEYGEN_BASE = "https://api.heygen.com";
/** Le vert du fond : celui que FFmpeg retire (lib/avatar-composite.ts). */
export const HEYGEN_GREEN = "#00FF00";
/** HeyGen : « MP3 or WAV, max 32 MB » pour un audio envoyé comme asset. */
export const HEYGEN_MAX_AUDIO_BYTES = 32 * 1024 * 1024;

export type AvatarOutput = "green" | "alpha";
export type AvatarStatus = "pending" | "processing" | "completed" | "failed";

export interface HeygenEnv {
  [name: string]: string | undefined;
  HEYGEN_VIDEO_API_KEY?: string;
  HEYGEN_VIDEO_AVATAR_ID?: string;
}

export interface HeygenOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Délai d'un appel (pas de la génération). */
  timeoutMs?: number;
}

export class HeygenError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "HeygenError";
  }
}

export const heygenVideoConfigured = (env: HeygenEnv = process.env): boolean => Boolean(env.HEYGEN_VIDEO_API_KEY?.trim() && env.HEYGEN_VIDEO_AVATAR_ID?.trim());

async function call(opts: HeygenOptions, path: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  const doFetch = opts.fetch ?? fetch;
  const res = await doFetch(`${HEYGEN_BASE}${path}`, {
    ...init,
    headers: { "x-api-key": opts.apiKey, accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
    // Le message d'erreur ne reprend jamais la clé ; il est coupé pour les journaux.
    const detail = typeof err?.message === "string" ? err.message : text.slice(0, 200);
    throw new HeygenError(`HeyGen ${res.status} ${path.split("?")[0]} : ${detail}`.slice(0, 400), res.status, typeof err?.code === "string" ? err.code : null);
  }
  const data = (body as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") throw new HeygenError(`HeyGen ${path.split("?")[0]} : réponse sans « data »`, res.status);
  return data as Record<string, unknown>;
}

/** Envoie la voix (MP3 ou WAV) ; rend l'identifiant à passer comme `audio_asset_id`. */
export async function uploadAudioAsset(opts: HeygenOptions, audio: Uint8Array, filename = "voice.mp3"): Promise<string> {
  if (audio.byteLength === 0) throw new HeygenError("audio vide", 0);
  if (audio.byteLength > HEYGEN_MAX_AUDIO_BYTES) throw new HeygenError("audio trop lourd pour HeyGen (32 Mo au plus)", 0);
  const form = new FormData();
  form.append("file", new Blob([audio as BlobPart], { type: filename.endsWith(".wav") ? "audio/wav" : "audio/mpeg" }), filename);
  const data = await call(opts, "/v3/assets", { method: "POST", body: form });
  if (typeof data.asset_id !== "string" || !data.asset_id) throw new HeygenError("HeyGen /v3/assets : pas d'« asset_id »", 200);
  return data.asset_id;
}

export interface AvatarVideoRequest {
  avatarId: string;
  audioAssetId: string;
  output: AvatarOutput;
  /** "16:9" pour un cadre large, "9:16" pour un avatar en pied, "1:1" pour une bulle. */
  aspectRatio?: "16:9" | "9:16" | "1:1";
  resolution?: "720p" | "1080p";
  title?: string;
}

/** Le corps de POST /v3/videos. Le schéma de HeyGen refuse tout champ inconnu : rien de plus que ceci. */
export function avatarVideoBody(req: AvatarVideoRequest): Record<string, unknown> {
  return {
    type: "avatar",
    avatar_id: req.avatarId,
    audio_asset_id: req.audioAssetId,
    aspect_ratio: req.aspectRatio ?? "1:1",
    resolution: req.resolution ?? "720p",
    ...(req.title ? { title: req.title.slice(0, 100) } : {}),
    // « alpha » : HeyGen retire le fond lui-même et refuse `background` dans la même requête.
    ...(req.output === "alpha" ? { output_format: "webm" } : { background: { type: "color", value: HEYGEN_GREEN } }),
  };
}

export interface AvatarVideoJob {
  videoId: string;
  /** Ce que HeyGen va vraiment rendre : « mp4 » alors qu'on demandait « webm » = pas de transparence. */
  outputFormat: "mp4" | "webm";
}

export async function createAvatarVideo(opts: HeygenOptions, req: AvatarVideoRequest): Promise<AvatarVideoJob> {
  const data = await call(opts, "/v3/videos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(avatarVideoBody(req)) });
  const videoId = typeof data.video_id === "string" ? data.video_id : typeof data.id === "string" ? data.id : "";
  if (!videoId) throw new HeygenError("HeyGen /v3/videos : pas de « video_id »", 200);
  const outputFormat = data.output_format === "webm" ? "webm" : "mp4";
  if (req.output === "alpha" && outputFormat !== "webm") throw new HeygenError("HeyGen n'a pas retenu le WebM transparent pour cet avatar : demander la sortie « green »", 200, "no_alpha");
  return { videoId, outputFormat };
}

export interface AvatarVideoState {
  status: AvatarStatus;
  /** URL signée, à durée limitée : à télécharger tout de suite. */
  videoUrl: string | null;
  durationS: number | null;
  failure: string | null;
}

export async function getAvatarVideo(opts: HeygenOptions, videoId: string): Promise<AvatarVideoState> {
  const data = await call(opts, `/v3/videos/${encodeURIComponent(videoId)}`);
  // La doc montre aussi « waiting » à la création : tout ce qui n'est ni fini ni en échec est une attente.
  const raw = String(data.status ?? "");
  const status: AvatarStatus = raw === "completed" || raw === "failed" || raw === "processing" ? raw : "pending";
  return {
    status,
    videoUrl: typeof data.video_url === "string" && data.video_url ? data.video_url : null,
    durationS: typeof data.duration === "number" ? data.duration : null,
    failure: status === "failed" ? String(data.failure_message ?? data.failure_code ?? "échec sans message").slice(0, 300) : null,
  };
}

/** Interroge HeyGen jusqu'à la fin. `sleep` s'injecte pour les tests. */
export async function waitForAvatarVideo(
  opts: HeygenOptions,
  videoId: string,
  wait: { everyMs?: number; maxMs?: number; sleep?: (ms: number) => Promise<void>; onTick?: (state: AvatarVideoState, elapsedMs: number) => void } = {},
): Promise<AvatarVideoState & { status: "completed"; videoUrl: string }> {
  const everyMs = wait.everyMs ?? 10_000;
  const maxMs = wait.maxMs ?? 20 * 60_000;
  const sleep = wait.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let elapsed = 0; elapsed <= maxMs; elapsed += everyMs) {
    const state = await getAvatarVideo(opts, videoId);
    wait.onTick?.(state, elapsed);
    if (state.status === "failed") throw new HeygenError(`HeyGen : génération en échec — ${state.failure}`, 200, "failed");
    if (state.status === "completed") {
      if (!state.videoUrl) throw new HeygenError("HeyGen : vidéo terminée sans « video_url »", 200);
      return { ...state, status: "completed", videoUrl: state.videoUrl };
    }
    await sleep(everyMs);
  }
  throw new HeygenError(`HeyGen : pas de vidéo après ${Math.round(maxMs / 60_000)} min`, 0, "timeout");
}

export interface AvatarLook {
  id: string;
  name: string;
  /** Les moteurs que ce look accepte, tels que HeyGen les nomme. */
  engines: string[];
}

/** Les « looks » du compte : leur `id` est le HEYGEN_VIDEO_AVATAR_ID. La forme exacte de la réponse n'est pas documentée en détail : lecture tolérante. */
export async function listAvatarLooks(opts: HeygenOptions, limit = 50): Promise<AvatarLook[]> {
  const data = await call(opts, `/v3/avatars/looks?limit=${Math.min(50, Math.max(1, limit))}`);
  const rows = Array.isArray(data) ? data : ((["looks", "items", "data", "avatars"].map((k) => data[k]).find(Array.isArray) as unknown[] | undefined) ?? []);
  return rows.flatMap((row) => {
    const r = row as Record<string, unknown>;
    return typeof r.id === "string" ? [{ id: r.id, name: String(r.name ?? r.display_name ?? ""), engines: Array.isArray(r.supported_api_engines) ? r.supported_api_engines.map(String) : [] }] : [];
  });
}

/** Toute la chaîne : la voix part, l'avatar revient. Rend les octets de la vidéo (MP4 fond vert ou WebM transparent). */
export async function renderAvatarVideo(
  opts: HeygenOptions,
  input: { avatarId: string; audio: Uint8Array; output: AvatarOutput; aspectRatio?: AvatarVideoRequest["aspectRatio"]; resolution?: AvatarVideoRequest["resolution"]; title?: string },
  wait: Parameters<typeof waitForAvatarVideo>[2] = {},
): Promise<{ video: Uint8Array; format: "mp4" | "webm"; videoId: string; durationS: number | null }> {
  const audioAssetId = await uploadAudioAsset(opts, input.audio);
  const job = await createAvatarVideo(opts, { avatarId: input.avatarId, audioAssetId, output: input.output, aspectRatio: input.aspectRatio, resolution: input.resolution, title: input.title });
  const done = await waitForAvatarVideo(opts, job.videoId, wait);
  // L'URL signée pointe chez le stockage de HeyGen : pas de clé dans cette requête.
  const res = await (opts.fetch ?? fetch)(done.videoUrl, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!res.ok) throw new HeygenError(`HeyGen : téléchargement de la vidéo refusé (${res.status})`, res.status);
  return { video: new Uint8Array(await res.arrayBuffer()), format: job.outputFormat, videoId: job.videoId, durationS: done.durationS };
}
