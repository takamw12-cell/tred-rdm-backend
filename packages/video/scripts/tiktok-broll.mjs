// B-roll de la campagne TikTok « Survive Your Klausur » : plans verticaux
// (9:16, 1080 × 1920, 6 s, sans son) générés par Replicate avec le même
// modèle que les courts-métrages (lightricks/ltx-2.3-pro).
//
//   node scripts/tiktok-broll.mjs               (les plans manquants)
//   node scripts/tiktok-broll.mjs stress --force
//
// Le plan « relief » (l'étudiant soulagé) part de la DERNIÈRE IMAGE du plan
// « stress » (image-to-video) : même personne, même pièce, même lumière.
//
// Le jeton est lu dans le .env de la racine (REPLICATE_API_TOKEN) et n'est
// jamais affiché. Chaque plan est facturé par Replicate (à la seconde de vidéo).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../src/assets/tiktok");
const MODEL = "lightricks/ltx-2.3-pro";

// L'ambiance « bleu nuit » de la campagne (#0A0E27), avec une pointe d'orange (#FF5722).
const NIGHT = "Deep midnight-blue ambient light, near-black shadows, cold blue-white screen glow, one small warm orange practical light far in the blurred background.";
const LOOK = "Vertical 9:16 video, realistic, shot on a phone-like wide lens, shallow depth of field, slight natural handheld motion, natural skin texture, no text, no captions, no subtitles, no logos, no watermark.";

export const BROLL = {
  stress: {
    prompt: `Close-up of a male university student in his early twenties with short dark hair, wearing a dark grey hoodie, sitting at a desk in a small dark dorm room late at night. His face is lit only by the glow of the laptop screen in front of him. An open ring binder and a thick stack of printed lecture notes lie on the desk. He stares at the screen, runs both hands through his hair, exhales in frustration and lets his head sink slightly. ${NIGHT} ${LOOK}`,
    camera_motion: "dolly_in",
  },
  relief: {
    from: "stress",
    prompt: `The same student lifts his head and looks at the laptop screen. His eyes widen as he suddenly understands, a relieved smile spreads across his face, he leans back in his chair, exhales and nods slightly. ${NIGHT} ${LOOK}`,
    camera_motion: "static",
  },
  // PAS de plan « turbine » ici : broll-turbine.mp4 est un VRAI moteur (clip
  // Pexels recadré, voir src/assets/tiktok/CREDITS.md). Deux essais générés
  // (2026-11-14) n'ont pas tenu devant un œil d'aéronautique : une douzaine de
  // pales en forme de rames, puis — moteur à l'arrêt, soufflante décrite pièce
  // par pièce — des pales en rayons de vélo et un moteur posé au sol dans l'axe
  // du fuselage. Ne pas le régénérer : ce script l'écraserait.
  desk: {
    prompt: `Slow lateral move over a student's desk at night, seen from above at an angle: an open notebook filled with handwritten equations and pencil sketches of an aircraft wing, a mechanical pencil, a steaming mug of coffee, and an open laptop whose out-of-focus screen shows dark-themed program code. ${NIGHT} ${LOOK}`,
    camera_motion: "dolly_right",
  },
};

function token() {
  const line = readFileSync(join(here, "../../../.env"), "utf8").split(/\r?\n/).find((l) => l.startsWith("REPLICATE_API_TOKEN="));
  const t = line?.slice("REPLICATE_API_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
  if (!t) throw new Error("REPLICATE_API_TOKEN absent du .env");
  return t;
}

/** Le ffmpeg livré avec Remotion (node_modules/@remotion/compositor-*). */
function ffmpeg(args) {
  const base = join(here, "../node_modules/@remotion");
  const dir = readdirSync(base).find((d) => d.startsWith("compositor-") && existsSync(join(base, d, "ffmpeg")));
  if (!dir) throw new Error("ffmpeg de Remotion introuvable (npm install dans packages/video)");
  const bin = join(base, dir, "ffmpeg");
  execFileSync(bin, args, { stdio: "ignore", env: { ...process.env, LD_LIBRARY_PATH: join(base, dir) } });
}

/** Dernière image d'un plan, en PNG réduit (540 × 960), prête à servir de première image. */
function lastFrame(video) {
  const png = video.replace(/\.mp4$/, "-last.png");
  ffmpeg(["-hide_banner", "-loglevel", "error", "-y", "-sseof", "-0.25", "-i", video, "-frames:v", "1", "-vf", "scale=720:1280", png]);
  return `data:image/png;base64,${readFileSync(png).toString("base64")}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(out, { recursive: true });
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.find((a) => !a.startsWith("--"));
  const H = { Authorization: `Bearer ${token()}`, "content-type": "application/json" };
  const file = (id) => join(out, `broll-${id}.mp4`);

  async function generate(id, spec) {
    const input = { prompt: spec.prompt, duration: 6, resolution: "1080p", aspect_ratio: "9:16", generate_audio: false, fps: 25, camera_motion: spec.camera_motion ?? "none" };
    if (spec.from) {
      if (!existsSync(file(spec.from))) return console.log(`${id} : le plan « ${spec.from} » doit exister d'abord`), "skipped";
      Object.assign(input, { task: "image_to_video", image: lastFrame(file(spec.from)) });
    }
    const r = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, { method: "POST", headers: H, body: JSON.stringify({ input }) });
    const j = await r.json();
    if (!r.ok) {
      console.log(`${id} : Replicate ${r.status} ${String(j.detail ?? j.title ?? "").slice(0, 200)}`);
      return r.status === 402 ? "no-credit" : "failed";
    }
    console.log(`${id} : lancé (${j.id})`);
    for (let i = 0; i < 180; i++) {
      await new Promise((res) => setTimeout(res, 5000));
      const p = await (await fetch(j.urls.get, { headers: H })).json();
      if (p.status === "succeeded") {
        const src = Array.isArray(p.output) ? p.output[0] : p.output;
        writeFileSync(file(id), Buffer.from(await (await fetch(src)).arrayBuffer()));
        console.log(`${id} : prêt (${p.metrics?.predict_time?.toFixed?.(0) ?? "?"} s de calcul)`);
        return "ok";
      }
      if (p.status === "failed" || p.status === "canceled") return console.log(`${id} : ${p.status} ${String(p.error).slice(0, 200)}`), "failed";
    }
    return console.log(`${id} : toujours en cours après 15 min, abandon du suivi (${j.id})`), "failed";
  }

  // Dans l'ordre : « relief » a besoin de « stress ».
  for (const [id, spec] of Object.entries(BROLL)) {
    if (only && only !== id) continue;
    if (existsSync(file(id)) && !force) {
      console.log(`${id} : déjà généré`);
      continue;
    }
    const result = await generate(id, spec);
    if (result === "no-credit") {
      console.log("Crédit Replicate épuisé : recharge le compte, puis relance ce script (les plans déjà faits sont gardés).");
      break;
    }
    await new Promise((res) => setTimeout(res, 12000)); // débit limité quand le solde Replicate est bas
  }
}
