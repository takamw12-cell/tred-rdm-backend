// Assemble une vidéo à partir des clips du fondateur (public/video-clips/<nom>/) :
// voix ElevenLabs calée mot par mot, durée de chaque clip, puis rendu Remotion.
//
//   npm run clips -- <nom> --voice      la voix seule : affiche la durée de chaque scène
//   npm run clips -- <nom>              le rendu 1920×1080 → out/clips/<nom>.mp4
//   npm run clips -- <nom> --portrait   1080×1920        --no-music : sans la boucle de fond
//
// À lancer depuis WSL (le moteur de rendu de Remotion y est installé).
// La clé ELEVENLABS_API_KEY est lue dans le .env de la racine et n'est jamais affichée.
// ElevenLabs n'est rappelé que si un texte a changé (voice.json garde le texte lu).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VIDEO = join(here, "..");
const WEB = join(VIDEO, "..", "web");
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const flag = (f) => args.includes(`--${f}`);
if (!name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
  console.error("x  Donne le nom du dossier : npm run clips -- hebelprinzip");
  process.exit(1);
}
const dir = join(WEB, "public", "video-clips", name);
const rel = (file) => `video-clips/${name}/${file}`;
if (!existsSync(join(dir, "project.json"))) {
  console.error(`x  ${rel("project.json")} introuvable. Mode d'emploi : packages/web/public/video-clips/README.md`);
  process.exit(1);
}
const project = JSON.parse(readFileSync(join(dir, "project.json"), "utf8"));
const scenes = (project.scenes ?? []).filter((s) => String(s.voiceover ?? "").trim());
if (scenes.length === 0) {
  console.error("x  Aucune scène avec un texte (« voiceover »).");
  process.exit(1);
}

/* ── 1. La voix ────────────────────────────────────────────────────────── */

const envOf = (key) => {
  const line = readFileSync(join(VIDEO, "..", "..", ".env"), "utf8").split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, "") || "";
};
/** La voix de Prof. Kenta (celle des vidéos de l'app), ou celle donnée par ELEVENLABS_CLIPS_VOICE. */
function voiceId() {
  const own = envOf("ELEVENLABS_CLIPS_VOICE");
  if (own) return own;
  const src = readFileSync(join(WEB, "src", "api", "avatar", "elevenlabs.ts"), "utf8");
  const m = /id: "genius", env: "([A-Z_]+)", defaultVoiceId: "([^"]+)"/.exec(src);
  if (!m) throw new Error("voix « genius » introuvable dans api/avatar/elevenlabs.ts");
  return envOf(m[1]) || m[2];
}

/** L'alignement d'ElevenLabs (un instant par caractère) → un instant par mot. */
function toWords(alignment) {
  const words = [];
  let cur = null;
  alignment.characters.forEach((ch, i) => {
    const start = alignment.character_start_times_seconds[i] * 1000;
    const end = alignment.character_end_times_seconds[i] * 1000;
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
    } else if (cur) {
      cur.text += ch;
      cur.endMs = Math.round(end);
    } else cur = { text: ch, startMs: Math.round(start), endMs: Math.round(end) };
  });
  if (cur) words.push(cur);
  return words;
}

const text = scenes.map((s) => String(s.voiceover).trim().replace(/\s+/g, " ")).join("\n\n");
let voice = null;
try {
  voice = JSON.parse(readFileSync(join(dir, "voice.json"), "utf8"));
  if (voice.text !== text || !existsSync(join(dir, "voice.mp3"))) voice = null;
} catch {
  voice = null;
}
if (voice) console.log("voix : reprise (aucun appel à ElevenLabs)");
else {
  const key = envOf("ELEVENLABS_API_KEY");
  if (!key) {
    console.error("x  ELEVENLABS_API_KEY absente du .env de la racine.");
    process.exit(1);
  }
  const call = (withLanguage) =>
    fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId()}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", ...(withLanguage && project.language ? { language_code: project.language } : {}), voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } }),
    });
  let res = await call(true);
  if (res.status === 400 || res.status === 422) res = await call(false);
  if (!res.ok) {
    console.error(`x  ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const data = await res.json();
  writeFileSync(join(dir, "voice.mp3"), Buffer.from(data.audio_base64, "base64"));
  voice = { text, words: toWords(data.alignment) };
  writeFileSync(join(dir, "voice.json"), JSON.stringify(voice));
  console.log(`voix : ElevenLabs, ${text.length} caractères`);
}

// La voix a lu exactement le texte envoyé : les mots de chaque scène se comptent.
const words = voice.words;
let k = 0;
const sceneStartsMs = scenes.map((s) => {
  const start = words[Math.min(k, words.length - 1)]?.startMs ?? 0;
  k += String(s.voiceover).trim().split(/\s+/).length;
  return start;
});
sceneStartsMs[0] = 0;
const durationMs = (words[words.length - 1]?.endMs ?? 0) + 600;

/* ── 2. Les clips ──────────────────────────────────────────────────────── */

function clipSeconds(file) {
  try {
    const out = execFileSync("npx", ["remotion", "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { cwd: VIDEO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const n = Number(out.trim().split(/\s+/).pop());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}
let missing = 0;
const props = {
  audioUrl: rel("voice.mp3"),
  musicUrl: flag("no-music") ? null : "audio/video-focus.mp3",
  durationMs,
  words,
  sceneStartsMs,
  scenes: scenes.map((s, i) => {
    const need = ((sceneStartsMs[i + 1] ?? durationMs) - sceneStartsMs[i]) / 1000;
    const file = String(s.clip ?? "");
    const there = file && existsSync(join(dir, file));
    const seconds = there ? clipSeconds(join(dir, file)) : 0;
    if (!there) missing++;
    const note = !there ? "ABSENT (carton gris)" : seconds + 0.05 >= need ? `${seconds.toFixed(1)} s, coupé à la fin de la scène` : seconds >= need / 2 ? `${seconds.toFixed(1)} s, ralenti ×${(seconds / need).toFixed(2)}` : `${seconds.toFixed(1)} s, ralenti ×0.50 puis repris au début`;
    console.log(`scène ${i + 1} : ${need.toFixed(1)} s à couvrir · ${file || "(pas de clip)"} : ${note}`);
    return { src: there && seconds > 0 ? rel(file) : null, clipSeconds: seconds, formula: String(s.formula ?? "").trim(), formulaPosition: String(s.formulaPosition ?? "top-left"), label: file || `Szene ${i + 1}` };
  }),
};
writeFileSync(join(dir, "props.json"), JSON.stringify(props));
console.log(`« ${project.title ?? name} » : ${(durationMs / 1000).toFixed(1)} s, ${scenes.length} scènes${missing ? `, ${missing} clip(s) à déposer dans public/${rel("")}` : ""}`);
if (flag("voice")) process.exit(0);

/* ── 3. Le rendu ───────────────────────────────────────────────────────── */

const out = join(VIDEO, "out", "clips", `${name}${flag("portrait") ? "-portrait" : ""}.mp4`);
mkdirSync(dirname(out), { recursive: true });
// Deux étapes : le bundle d'abord, le rendu ensuite. En une seule commande, Remotion lance son
// navigateur pendant la construction et dépasse son délai de démarrage sur une machine chargée.
// Le bundle recopie le dossier public : il est refait à chaque fois, pour prendre les nouveaux clips.
const bundle = join(VIDEO, "out", ".bundle-clips");
execFileSync("npx", ["remotion", "bundle", "src/index.ts", `--out-dir=${bundle}`], { cwd: VIDEO, stdio: ["ignore", "ignore", "inherit"] });
console.log("bundle : prêt");
execFileSync("npx", ["remotion", "render", bundle, flag("portrait") ? "ClipsVideo-Portrait" : "ClipsVideo", out, `--props=${join(dir, "props.json")}`, "--scale=2", "--codec=h264", "--crf=18", `--concurrency=${process.env.CLIPS_CONCURRENCY || "1"}`], { cwd: VIDEO, stdio: "inherit" });
console.log(`ok  ${out}`);
