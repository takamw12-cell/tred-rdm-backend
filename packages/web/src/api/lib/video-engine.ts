import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceWord } from "./video-script";
import type { EngineStoryboard, WordRange } from "./video-storyboard";

/**
 * Le moteur de dessin de « Als Video erklären » — le serveur lance deux petits
 * programmes Python (api/video-engine/) dans des sous-processus :
 *
 *   · synthesize_voice.py : le texte → la voix (Edge-TTS) + l'instant de chaque mot ;
 *   · render_video.py     : le storyboard + la voix → le MP4 dessiné (Handanim ou
 *                           Buttery pour l'image, FFmpeg pour l'assemblage).
 *
 * ── Sécurité (même règles que lib/sympy-verify.ts) ────────────────────────
 *  1. Jamais de shell : `spawn` à liste d'arguments fixe. Rien de ce qu'écrit
 *     le modèle ne devient un argument ni un nom de fichier : le storyboard
 *     voyage dans un fichier JSON d'un dossier temporaire créé ici.
 *  2. Interpréteur isolé (`-I -B`), environnement vide : aucun secret du
 *     serveur n'atteint Python.
 *  3. Délai strict, processus tué au-delà ; sortie bornée.
 *  4. Le programme lui-même revalide et borne chaque champ du storyboard.
 *
 * ── Inerte sans Python ────────────────────────────────────────────────────
 * Sans interpréteur (`VIDEO_ENGINE_PYTHON`, ou /opt/video-engine dans l'image),
 * `drawnVideoReady()` répond faux : l'interface ne propose pas le choix de
 * style et « Als Video erklären » se comporte exactement comme avant.
 */

const ENGINE_DIR = fileURLToPath(new URL("../video-engine/", import.meta.url).href);
export const RENDER_SCRIPT = join(ENGINE_DIR, "render_video.py");
export const VOICE_SCRIPT = join(ENGINE_DIR, "synthesize_voice.py");
const MUSIC_BED = join(ENGINE_DIR, "music", "focus.mp3");
const IMAGE_PYTHON = "/opt/video-engine/bin/python";
const MAX_STDOUT = 512 * 1024;

type Env = Record<string, string | undefined>;

/** L'interpréteur du moteur : VIDEO_ENGINE_PYTHON s'il est posé, sinon celui de l'image. null : pas de vidéo dessinée. */
export function enginePython(env: Env = process.env): string | null {
  const chosen = env.VIDEO_ENGINE_PYTHON?.trim();
  if (chosen) return chosen;
  return existsSync(IMAGE_PYTHON) ? IMAGE_PYTHON : null;
}

export const drawnVideoReady = (env: Env = process.env): boolean => enginePython(env) !== null;

/**
 * La musique de fond des vidéos dessinées : une boucle lofi synthétisée par nous
 * (packages/video/scripts/lofi-music.mjs, aucun échantillon — libre de droits).
 * Le moteur la baisse à −20 dB quand la voix parle. `VIDEO_MUSIC=off` : pas de musique.
 */
export function musicBed(env: Env = process.env): string | null {
  if (env.VIDEO_MUSIC?.trim().toLowerCase() === "off") return null;
  return existsSync(MUSIC_BED) ? MUSIC_BED : null;
}

export type VoiceProvider = "elevenlabs" | "edge";

/**
 * La voix de la vidéo. ElevenLabs reste la voix par défaut : Edge-TTS n'est pas
 * une API officielle de Microsoft (voir GUIDE_FOUNDER.md) et ne sert que si le
 * fondateur l'a choisi (`VIDEO_VOICE_PROVIDER=edge`) et que le moteur est là.
 */
export function voiceProvider(env: Env = process.env): VoiceProvider {
  return env.VIDEO_VOICE_PROVIDER?.trim().toLowerCase() === "edge" && drawnVideoReady(env) ? "edge" : "elevenlabs";
}

/** Une voix neuronale par langue de l'interface (noms vérifiés dans la liste du service le 22 nov. 2026). */
export const EDGE_VOICES: Record<string, string> = {
  de: "de-DE-TanjaNeural",
  en: "en-US-AriaNeural",
  fr: "fr-FR-DeniseNeural",
  es: "es-ES-ElviraNeural",
  it: "it-IT-ElsaNeural",
  pt: "pt-BR-FranciscaNeural",
  ru: "ru-RU-SvetlanaNeural",
  ar: "ar-SA-ZariyahNeural",
  hi: "hi-IN-SwaraNeural",
  bn: "bn-BD-NabanitaNeural",
  ja: "ja-JP-NanamiNeural",
  zh: "zh-CN-XiaoxiaoNeural",
};

const EDGE_VOICE_NAME = /^[a-z]{2,3}-[A-Za-z]{2,4}(-[A-Za-z]+)?-[A-Za-z]+Neural$/;

/** La voix d'une langue : `EDGE_TTS_VOICE_<LANGUE>` si elle est posée et bien formée, sinon celle de la table. null : langue sans voix. */
export function edgeVoiceFor(language: string, env: Env = process.env): string | null {
  const forced = env[`EDGE_TTS_VOICE_${language.toUpperCase()}`]?.trim();
  if (forced && EDGE_VOICE_NAME.test(forced)) return forced;
  return EDGE_VOICES[language] ?? null;
}

/* ── Sous-processus ────────────────────────────────────────────────────── */

export interface EngineRun {
  /** La dernière ligne JSON du programme, ou null (aucune, illisible, délai dépassé). */
  result: Record<string, unknown> | null;
  timedOut: boolean;
}

/** Lit la sortie du programme ligne par ligne : une ligne = un objet JSON, tout le reste est ignoré. */
export function parseEngineLine(line: string): Record<string, unknown> | null {
  const text = line.trim();
  if (!text.startsWith("{")) return null;
  try {
    const data: unknown = JSON.parse(text);
    return data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function runEngine(script: string, args: string[], opts: { cwd: string; stdin?: string; timeoutMs: number; onProgress?: (p: number) => void }): Promise<EngineRun> {
  return new Promise((resolve) => {
    const python = enginePython();
    if (!python) return resolve({ result: null, timedOut: false });
    let buffer = "";
    let size = 0;
    let last: Record<string, unknown> | null = null;
    let done = false;
    const finish = (timedOut: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const tail = parseEngineLine(buffer);
      resolve({ result: timedOut ? null : (tail ?? last), timedOut });
    };
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(python, ["-I", "-B", "-X", "utf8", script, ...args], {
        cwd: opts.cwd,
        // Aucun secret du serveur. HOME et MPLCONFIGDIR : Matplotlib et fontconfig écrivent leur cache dans le dossier jetable.
        env: {
          PATH: process.platform === "win32" ? (process.env.PATH ?? "") : "/usr/bin:/bin",
          LANG: "C.UTF-8",
          HOME: opts.cwd,
          MPLCONFIGDIR: opts.cwd,
          TQDM_DISABLE: "1",
          ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot, TEMP: opts.cwd, TMP: opts.cwd } : {}),
        } as unknown as NodeJS.ProcessEnv,
        stdio: ["pipe", "pipe", "ignore"],
        windowsHide: true,
      });
    } catch {
      return resolve({ result: null, timedOut: false });
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(true);
    }, opts.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_STDOUT) {
        child.kill("SIGKILL");
        last = null;
        buffer = "";
        return finish(false);
      }
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const obj = parseEngineLine(line);
        if (!obj) continue;
        if (typeof obj.progress === "number" && typeof obj.ok !== "boolean") opts.onProgress?.(Math.min(1, Math.max(0, obj.progress)));
        else last = obj;
      }
    });
    child.on("error", () => finish(false));
    child.on("close", () => finish(false));
    child.stdin?.on("error", () => {});
    child.stdin?.end(opts.stdin ?? "");
  });
}

const workDir = () => mkdtempSync(join(tmpdir(), "tred-video-"));
const discard = (dir: string) => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* un dossier temporaire qui reste n'empêche rien */
  }
};

const envMs = (name: string, fallback: number, max: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 10_000 && n <= max ? Math.floor(n) : fallback;
};

/* ── Voix (Edge-TTS) ───────────────────────────────────────────────────── */

export interface EdgeVoiceResult {
  audio: Uint8Array;
  words: VoiceWord[];
  /** Les mots de chaque scène dans `words`. */
  ranges: WordRange[];
  /** Le début de chaque scène, en millisecondes. */
  sceneStartsMs: number[];
  /** La fin du dernier son, en millisecondes. */
  endMs: number;
}

/** La réponse de synthesize_voice.py, lue strictement. Tout ce qui n'a pas la forme attendue est rejeté. */
export function parseEdgeSegments(result: Record<string, unknown> | null, expected: number): Omit<EdgeVoiceResult, "audio"> | null {
  if (!result || result.ok !== true || !Array.isArray(result.segments) || result.segments.length !== expected) return null;
  const words: VoiceWord[] = [];
  const ranges: WordRange[] = [];
  const sceneStartsMs: number[] = [];
  let endMs = 0;
  for (const seg of result.segments as unknown[]) {
    if (!seg || typeof seg !== "object") return null;
    const s = seg as { start_ms?: unknown; end_ms?: unknown; words?: unknown };
    if (typeof s.start_ms !== "number" || typeof s.end_ms !== "number" || !Array.isArray(s.words) || s.words.length === 0) return null;
    const from = words.length;
    for (const w of s.words as unknown[]) {
      const x = w as { text?: unknown; start_ms?: unknown; end_ms?: unknown };
      if (!x || typeof x.text !== "string" || typeof x.start_ms !== "number" || typeof x.end_ms !== "number") return null;
      words.push({ text: x.text.slice(0, 80), startMs: Math.max(0, Math.round(x.start_ms)), endMs: Math.max(0, Math.round(x.end_ms)) });
    }
    ranges.push({ from, to: words.length });
    sceneStartsMs.push(Math.max(0, Math.round(s.start_ms)));
    endMs = Math.max(endMs, Math.round(s.end_ms));
  }
  return { words, ranges, sceneStartsMs, endMs };
}

/** La voix off par Edge-TTS : une scène après l'autre, dans un seul MP3. Lève en cas d'échec. */
export async function synthesizeEdge(segments: string[], language: string): Promise<EdgeVoiceResult> {
  const voice = edgeVoiceFor(language);
  if (!voice) throw new Error(`edge-tts : aucune voix pour « ${language} »`);
  const dir = workDir();
  try {
    const out = join(dir, "voice.mp3");
    const run = await runEngine(VOICE_SCRIPT, ["--voice", voice, "--out", out], { cwd: dir, stdin: JSON.stringify({ segments }), timeoutMs: envMs("VIDEO_VOICE_TIMEOUT_MS", 120_000, 600_000) });
    const parsed = parseEdgeSegments(run.result, segments.length);
    if (!parsed || !existsSync(out)) throw new Error(`edge-tts : ${run.timedOut ? "délai dépassé" : String(run.result?.error ?? "aucune réponse")}`);
    return { audio: new Uint8Array(readFileSync(out)), ...parsed };
  } finally {
    discard(dir);
  }
}

/* ── Dessin + assemblage ───────────────────────────────────────────────── */

export interface DrawnVideo {
  video: Uint8Array;
  /** Les éléments que le moteur n'a pas su tracer (signes absents de la police, formule refusée). */
  dropped: string[];
  seconds: number;
}

/**
 * Rend la vidéo dessinée. `onProgress` reçoit l'avancement du dessin (0 à 1).
 * Lève en cas d'échec : l'appelant garde alors la vidéo sans MP4.
 */
export async function renderDrawnVideo(input: { storyboard: EngineStoryboard; audio: Uint8Array; srt?: string; language: string; onProgress?: (p: number) => void }): Promise<DrawnVideo> {
  const dir = workDir();
  try {
    const story = join(dir, "storyboard.json");
    const audio = join(dir, "voice.mp3");
    const out = join(dir, "video.mp4");
    writeFileSync(story, JSON.stringify(input.storyboard));
    writeFileSync(audio, input.audio);
    const args = ["--storyboard", story, "--audio", audio, "--out", out, "--language", /^[a-z]{2}$/.test(input.language) ? input.language : "de"];
    if (input.srt?.trim()) {
      const srt = join(dir, "subtitles.srt");
      writeFileSync(srt, input.srt);
      args.push("--subtitles", srt);
    }
    const music = musicBed();
    if (music) args.push("--music", music);
    const run = await runEngine(RENDER_SCRIPT, args, { cwd: dir, timeoutMs: envMs("VIDEO_RENDER_TIMEOUT_MS", 12 * 60_000, 30 * 60_000), onProgress: input.onProgress });
    if (run.result?.ok !== true || !existsSync(out)) {
      throw new Error(`moteur de dessin : ${run.timedOut ? "délai dépassé" : `${String(run.result?.error ?? "aucune réponse")} ${String(run.result?.detail ?? "").slice(0, 200)}`}`);
    }
    const dropped = Array.isArray(run.result.dropped) ? run.result.dropped.filter((d): d is string => typeof d === "string").slice(0, 50) : [];
    return { video: new Uint8Array(readFileSync(out)), dropped, seconds: typeof run.result.seconds === "number" ? run.result.seconds : 0 };
  } finally {
    discard(dir);
  }
}
