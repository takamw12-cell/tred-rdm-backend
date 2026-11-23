// « Auto-Explain Video », étape 1 (lancée par auto-explain.mjs avec Bun) :
// le modèle écrit le script et la mise en scène, ElevenLabs lit la voix,
// HeyGen fait parler l'avatar sur cette voix. Écrit dans le dossier de travail :
// brief.json (lu), script.json, voice.json, voice.mp3, props.json, avatar.mp4|webm, meta.json.
// Chaque étape payante est reprise du dossier si son entrée n'a pas changé.
// Les clés sont lues dans le .env de la racine et ne sont jamais affichées.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..");
const WEB = join(ROOT, "packages", "web");
const dir = process.argv[2];
if (!dir || !existsSync(join(dir, "brief.json"))) throw new Error("usage : bun auto-explain-prepare.ts <dossier avec brief.json>");
const skipAvatar = process.argv.includes("--no-avatar");

// Sur la machine du fondateur les clés sont dans le .env de la racine ; dans GitHub Actions ce sont des secrets,
// déjà présents dans l'environnement. Une clé de l'environnement n'est jamais remplacée par le fichier.
if (existsSync(join(ROOT, ".env")))
  for (const line of readFileSync(join(ROOT, ".env"), "utf8").split(/\r?\n/)) {
    const m = /^(ANTHROPIC_API_KEY|ELEVENLABS_API_KEY|HEYGEN_VIDEO_API_KEY|HEYGEN_VIDEO_AVATAR_ID)=(.*)$/.exec(line.trim());
    if (m && m[2] && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, "");
  }
// Un module importé ouvre la base au chargement : une base locale vide, jamais celle de production.
process.env.DATABASE_URL = `file:${join(dir, "unused.db").replaceAll("\\", "/")}`;
delete process.env.DATABASE_AUTH_TOKEN;

const req = createRequire(join(WEB, "package.json"));
const load = (file: string) => import(pathToFileURL(join(WEB, "src", "api", file)).href);
const { generateObject } = await import(pathToFileURL(req.resolve("ai")).href);
const { gateway } = await load("agent/gateway.ts");
const { PRIMARY_MODEL } = await load("lib/ai-models.ts");
const { LANGUAGES } = await load("lib/languages.ts");
const vs = await load("lib/video-script.ts");
const mo = await load("lib/video-motion.ts");
const hg = await load("lib/heygen-video.ts");
const ads = await load("lib/ad-claims.ts");

const read = (file: string) => {
  try {
    return JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch {
    return null;
  }
};
const brief = read("brief.json") as { title: string; language: "en" | "de"; question: string; source: { title: string; content: string }; voiceId: string; avatar?: { output?: "green" | "alpha"; aspectRatio?: "16:9" | "9:16" | "1:1" } };
const sources = [{ title: brief.source.title, kind: "vorlesung", content: brief.source.content }];
const briefKey = JSON.stringify([brief.question, brief.source, brief.language]);

/* ── 1. Le script et la mise en scène (modèle) ─────────────────────────── */
let script = read("script.json");
let checked: any = null;
if (script?.briefKey === briefKey) {
  console.log("script : repris (aucun appel au modèle)");
  checked = vs.validateVideoScript(script.raw, sources, brief.question, { beam: false });
} else {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY absente (.env de la racine, ou secret du dépôt)");
  // Deux essais au plus : si le contrôle retire une scène pour promesse absolue (règle UWG), le modèle le sait au second.
  let note = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const { system, prompt } = vs.buildVideoPrompt({ language: LANGUAGES[brief.language], sources, question: brief.question, answer: "", extra: mo.motionPromptBlock() + note });
    const t0 = Date.now();
    const { object, usage } = await generateObject({ model: gateway(PRIMARY_MODEL), schema: vs.motionScriptSchema, system, prompt, abortSignal: AbortSignal.timeout(150_000) });
    console.log(`script : modèle ${PRIMARY_MODEL}, essai ${attempt}, ${Date.now() - t0} ms, tokens entrée ${usage?.inputTokens} sortie ${usage?.outputTokens}`);
    script = { briefKey, raw: vs.fromMotionScript(object) };
    checked = vs.validateVideoScript(script.raw, sources, brief.question, { beam: false });
    const claims = (checked.dropped ?? []).filter((d: any) => d.reason === "absolute_claim");
    if (claims.length === 0 && checked.ok) break;
    console.log(`  contrôle, essai ${attempt} : ${checked.ok ? "" : `refusé (${checked.error}) · `}${claims.length} scène(s) retirée(s) pour promesse absolue${claims.length ? ` (${claims.map((d: any) => d.detail).join(" ; ")})` : ""}`);
    note = `\n\nATTENTION — ton premier script a été refusé par le contrôle : ${claims.length ? `promesse absolue sur TRED (${claims.map((d: any) => d.detail).join(" ; ")}). ` : ""}Récris-le en respectant le bloc « CE QUE TU DIS DE TRED » : dis ce que TRED vérifie, avec les formulations validées.`;
  }
  writeFileSync(join(dir, "script.json"), JSON.stringify(script, null, 1));
}
console.log(`contrôle : ${checked.ok ? `${checked.scenes.length} scènes gardées sur ${script.raw.scenes.length}` : `REFUSÉ (${checked.error})`}, ${checked.words} mots${checked.dropped?.length ? `, retirées : ${JSON.stringify(checked.dropped)}` : ""}`);
if (!checked.ok) process.exit(2);
const allowed = vs.allowedNumbers(sources, brief.question);
checked.scenes.forEach((scene: any, i: number) => {
  const staged = mo.cleanMotion(scene.motion, allowed);
  console.log(`  scène ${i + 1} [${scene.stage}] ${staged.motion ? staged.motion.blocks.map((b: any) => b.type + (b.icon ? `:${b.icon}` : "")).join(" + ") : "mise en scène du code"}`);
  scene.motion = staged.motion ?? mo.defaultMotion(scene, i);
});

/* ── 2. La voix (ElevenLabs, mots horodatés) ───────────────────────────── */
const text = vs.scriptVoiceText(checked.scenes);
// Dernier filet avant toute dépense de voix et d'avatar : le texte lu, le titre et les titres de scène.
const claims = ads.absoluteClaims([checked.title, text, ...checked.scenes.flatMap((sc: any) => [sc.heading, ...sc.bullets])].join(". "));
if (claims.length > 0) {
  console.error(`x  le script garde une promesse absolue (${claims.join(", ")}) : arrêt avant la voix`);
  process.exit(4);
}
console.log("règle UWG : aucune promesse absolue dans le titre, la voix et les titres de scène");
let voice = read("voice.json");
if (voice?.text === text && voice.voiceId === brief.voiceId && existsSync(join(dir, "voice.mp3"))) console.log("voix : reprise (aucun appel à ElevenLabs)");
else {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY absente du .env de la racine");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${brief.voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", language_code: brief.language, voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true } }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status} ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  writeFileSync(join(dir, "voice.mp3"), Buffer.from(data.audio_base64, "base64"));
  voice = { text, voiceId: brief.voiceId, words: vs.alignmentToWords(data.alignment) };
  writeFileSync(join(dir, "voice.json"), JSON.stringify(voice));
  console.log(`voix : ElevenLabs, ${text.length} caractères`);
}
const words = voice.words;
const en = brief.language === "en";
const props = {
  audioUrl: "",
  durationMs: vs.videoDurationMs(words),
  title: checked.title,
  scenes: checked.scenes,
  words,
  sceneStartsMs: vs.sceneStartsMs(checked.scenes, words),
  labels: en ? { source: "Source", example: "Everyday example", solver: "Computed by the solver", stages: { hook: "The question", step: "Step", example: "Example", recap: "Remember" } } : { source: "Quelle", example: "Beispiel aus dem Alltag", solver: "Berechnet mit dem Löser", stages: { hook: "Die Frage", step: "Schritt", example: "Beispiel", recap: "Merke" } },
  decimalComma: !en,
};
writeFileSync(join(dir, "props.json"), JSON.stringify(props));
console.log(`« ${props.title} » : ${(props.durationMs / 1000).toFixed(1)} s, ${props.scenes.length} scènes`);

/* ── 3. L'avatar (HeyGen, sur NOTRE voix) ──────────────────────────────── */
const meta: Record<string, unknown> = { title: props.title, durationMs: props.durationMs, avatar: null };
const output = brief.avatar?.output ?? "green";
const done = read("meta.json");
if (skipAvatar) console.log("avatar : étape sautée (--no-avatar)");
else if (done?.avatar?.voiceText === text && existsSync(join(dir, done.avatar.file))) {
  meta.avatar = done.avatar;
  console.log(`avatar : repris (${done.avatar.file}, aucun appel à HeyGen)`);
} else if (!hg.heygenVideoConfigured()) console.log("avatar : HEYGEN_VIDEO_API_KEY ou HEYGEN_VIDEO_AVATAR_ID absente du .env de la racine — aucun appel à HeyGen");
else {
  const opts = { apiKey: process.env.HEYGEN_VIDEO_API_KEY! };
  const t0 = Date.now();
  const out = await hg.renderAvatarVideo(opts, { avatarId: process.env.HEYGEN_VIDEO_AVATAR_ID!, audio: new Uint8Array(readFileSync(join(dir, "voice.mp3"))), output, aspectRatio: brief.avatar?.aspectRatio ?? "1:1", title: brief.title }, { onTick: (s: any, ms: number) => console.log(`  HeyGen : ${s.status} (${Math.round(ms / 1000)} s)`) });
  const file = `avatar.${out.format}`;
  writeFileSync(join(dir, file), out.video);
  meta.avatar = { file, source: out.format === "webm" ? "alpha" : "green", videoId: out.videoId, durationS: out.durationS, voiceText: text };
  console.log(`avatar : HeyGen, ${Math.round((Date.now() - t0) / 1000)} s, ${Math.round(out.video.byteLength / 1024)} Ko → ${file}`);
}
writeFileSync(join(dir, "meta.json"), JSON.stringify(meta, null, 1));
