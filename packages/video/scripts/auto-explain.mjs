// « Auto-Explain Video » : un brief → une vidéo de cours avec avatar.
//
//   modèle (script + mise en scène) → ElevenLabs (voix, mots horodatés)
//   → HeyGen (avatar qui parle sur cette voix) → Remotion (schémas animés)
//   → FFmpeg (avatar incrusté dans le coin, son de la vidéo de fond).
//
//   node scripts/auto-explain.mjs <nom>                 tout le pipeline
//   node scripts/auto-explain.mjs <nom> --placeholder   sans HeyGen : un avatar de REMPLACEMENT fabriqué sur place
//   node scripts/auto-explain.mjs <nom> --layout=standing --corner=bottom-left --size=0.26
//   node scripts/auto-explain.mjs <nom> --compose       refait seulement l'incrustation
//   node scripts/auto-explain.mjs <nom> --fixture --placeholder   script et voix repris de scripts/auto-explain-briefs/<nom>.fixture/ :
//                                                       aucun appel payant (sert à éprouver la ferme de rendu)
//
// <nom> = un dossier out/auto-explain/<nom>/ qui contient brief.json (exemples : scripts/auto-explain-briefs/).
// À lancer depuis WSL (moteur de rendu de Remotion). Variables : BUN (défaut « bun »), FFMPEG (défaut « ffmpeg » ;
// il faut les filtres chromakey et geq, que le ffmpeg de Remotion n'a pas), RENDER_CONCURRENCY (défaut 1).
// Clés dans le .env de la racine : ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, HEYGEN_VIDEO_API_KEY, HEYGEN_VIDEO_AVATAR_ID.
import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VIDEO = join(here, "..");
const WEB = join(VIDEO, "..", "web");
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--"));
const flag = (f) => args.includes(`--${f}`);
const opt = (k, fallback) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? fallback;
if (!name || !/^[a-z0-9][a-z0-9_-]*$/i.test(name)) {
  console.error("x  Donne le nom du brief : node scripts/auto-explain.mjs en1");
  process.exit(1);
}
const dir = join(VIDEO, "out", "auto-explain", name);
mkdirSync(dir, { recursive: true });
const example = join(here, "auto-explain-briefs", `${name}.json`);
if (!existsSync(join(dir, "brief.json")) && existsSync(example)) copyFileSync(example, join(dir, "brief.json"));
if (!existsSync(join(dir, "brief.json"))) {
  console.error(`x  ${join(dir, "brief.json")} introuvable.`);
  process.exit(1);
}
const BUN = process.env.BUN || "bun";
const FFMPEG = process.env.FFMPEG || "ffmpeg";
// Un ffmpeg Windows lancé depuis WSL n'ouvre pas un chemin /mnt/c : tout est donné en relatif au dossier de travail.
const ffmpeg = (list) => execFileSync(FFMPEG, ["-hide_banner", "-loglevel", "error", ...list], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
// Sous WSL, un bun.exe Windows veut un chemin Windows : chemins relatifs là aussi.
const toRel = (from, to) => execFileSync("realpath", ["--relative-to", from, to], { encoding: "utf8" }).trim();

/* ── 1. Script, voix, avatar ───────────────────────────────────────────── */
if (flag("fixture")) {
  const fixture = join(here, "auto-explain-briefs", `${name}.fixture`);
  for (const file of ["props.json", "voice.mp3", "meta.json"]) copyFileSync(join(fixture, file), join(dir, file));
  console.log("script et voix : repris du dépôt (aucun appel payant)");
} else if (!flag("compose")) execFileSync(BUN, [toRel(VIDEO, join(here, "auto-explain-prepare.ts")), toRel(VIDEO, dir), ...(flag("placeholder") ? ["--no-avatar"] : [])], { cwd: VIDEO, stdio: "inherit" });
const meta = JSON.parse(readFileSync(join(dir, "meta.json"), "utf8"));
if (flag("placeholder")) meta.avatar = null;
const seconds = meta.durationMs / 1000;

/* ── 2. Les schémas animés (Remotion) ──────────────────────────────────── */
if (!flag("compose") || !existsSync(join(dir, "base.mp4"))) {
  // La voix est servie en HTTP local le temps du rendu : rien n'est posé dans le dossier public de l'app.
  const server = createServer((req, res) => {
    const file = join(dir, "voice.mp3");
    res.writeHead(200, { "content-type": "audio/mpeg", "content-length": statSync(file).size, "access-control-allow-origin": "*" });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const props = JSON.parse(readFileSync(join(dir, "props.json"), "utf8"));
  props.audioUrl = `http://127.0.0.1:${server.address().port}/voice.mp3`;
  // La bande que l'avatar occupera : les blocs et les sous-titres se rangent à sa gauche (composition en 960 de large).
  props.reserveRight = Math.round(960 * (Number(opt("size")) || (opt("layout", "bubble") === "standing" ? 0.26 : 0.17)) + 36);
  writeFileSync(join(dir, "render-props.json"), JSON.stringify(props));
  const bundle = join(VIDEO, "out", ".bundle-auto-explain");
  try {
    // Le bundle est refait à chaque rendu complet : il porte le code de la composition, qui change avec la branche.
    if (!flag("keep-bundle") || !existsSync(join(bundle, "index.html"))) {
      execFileSync("npx", ["remotion", "bundle", "src/index.ts", `--out-dir=${bundle}`], { cwd: VIDEO, stdio: ["ignore", "ignore", "inherit"] });
      console.log("bundle : prêt");
    }
    // Rendu en tâche asynchrone : un appel synchrone figerait ce processus, et le petit serveur de la voix avec lui.
    await new Promise((resolve, reject) => {
      const child = spawn("npx", ["remotion", "render", bundle, "MotionExplanation", join(dir, "base.mp4"), `--props=${join(dir, "render-props.json")}`, "--scale=2", "--codec=h264", "--crf=18", `--concurrency=${process.env.RENDER_CONCURRENCY || "1"}`], { cwd: VIDEO, stdio: "inherit" });
      child.on("error", reject);
      child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`remotion render : code ${code}`))));
    });
  } finally {
    server.close();
  }
  console.log("schémas animés : base.mp4");
}

/* ── 3. L'avatar ───────────────────────────────────────────────────────── */
let avatar = meta.avatar;
if (!avatar && flag("placeholder")) {
  // REMPLACEMENT, pas HeyGen : deux dessins du professeur de l'app alternés sur fond vert, avec la mention à l'image.
  // Il sert à éprouver l'incrustation (retrait du vert, masque, position, durée) sans payer HeyGen.
  const pose = (file) => toRel(dir, join(WEB, "public", "avatars", "video", file));
  ffmpeg(["-y", "-f", "lavfi", "-i", `color=c=0x00FF00:s=720x720:r=25:d=${seconds.toFixed(2)}`, "-loop", "1", "-i", pose("mentor-idle.webp"), "-loop", "1", "-i", pose("mentor-talk.webp"),
    "-filter_complex", "[1:v]scale=-2:900[a];[2:v]scale=-2:900[b];[0:v][a]overlay=(W-w)/2:40:shortest=1[s];[s][b]overlay=(W-w)/2:40:enable='lt(mod(t,0.36),0.18)':shortest=1,drawbox=x=0:y=600:w=iw:h=120:color=black@0.8:t=fill,drawbox=x=150:y=640:w=420:h=14:color=white@0.9:t=fill,drawbox=x=230:y=672:w=260:h=10:color=white@0.6:t=fill[v]",
    "-map", "[v]", "-t", seconds.toFixed(2), "-c:v", "libx264", "-pix_fmt", "yuv420p", "placeholder-avatar.mp4"]);
  avatar = { file: "placeholder-avatar.mp4", source: "green", placeholder: true };
  console.log("avatar : REMPLACEMENT fabriqué sur place (aucun appel à HeyGen)");
}
if (!avatar) {
  console.error("x  Pas d'avatar : pose HEYGEN_VIDEO_API_KEY et HEYGEN_VIDEO_AVATAR_ID dans le .env de la racine, ou lance avec --placeholder.");
  process.exit(1);
}

/* ── 4. L'incrustation (FFmpeg) ────────────────────────────────────────── */
const layout = opt("layout", "bubble");
const out = `${name}${avatar.placeholder ? "-placeholder" : ""}-${layout}.mp4`;
// La composition est en 960 × 540, rendue avec --scale=2 : la vidéo de fond fait 1920 × 1080.
const spec = { base: "base.mp4", avatar: avatar.file, out, width: 1920, height: 1080, source: avatar.source, layout, corner: opt("corner", "bottom-right"), ...(opt("size") ? { size: Number(opt("size")) } : {}) };
// La commande est écrite par le module testé de l'app (lib/avatar-composite.ts), lu ici par Bun.
const list = JSON.parse(execFileSync(BUN, ["-e", `import { compositeArgs } from "../web/src/api/lib/avatar-composite.ts"; console.log(JSON.stringify(compositeArgs(${JSON.stringify(spec)})));`], { cwd: VIDEO, encoding: "utf8" }));
ffmpeg(list);
console.log(`ok  ${join(dir, out)}`);
