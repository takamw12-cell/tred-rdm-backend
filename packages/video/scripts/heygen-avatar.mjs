// Avatar HeyGen qui bouge les lèvres sur NOTRE voix (ElevenLabs), pour les vidéos « duo ».
//   node scripts/heygen-avatar.mjs ugc-en1-11pm-panic          (si absent)
//   node scripts/heygen-avatar.mjs ugc-en1-11pm-panic --force
// Entrée : public/pro/vo-<id>.mp3. Sortie : public/pro/avatar-<id>.mp4 (carré, fond uni).
// API v3 de heygen.com : POST /v3/assets → POST /v3/videos → GET /v3/videos/{id}.
// Clés lues dans le .env de la racine (HEYGEN_VIDEO_API_KEY, HEYGEN_VIDEO_AVATAR_ID), jamais affichées.
// COÛT : chaque vidéo consomme des crédits HeyGen (à la seconde de vidéo).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../public/pro");
const env = Object.fromEntries(
  readFileSync(join(here, "../../../.env"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^HEYGEN_VIDEO_(API_KEY|AVATAR_ID)=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const key = env.HEYGEN_VIDEO_API_KEY;
const avatarId = env.HEYGEN_VIDEO_AVATAR_ID;
if (!key || !avatarId) throw new Error("HEYGEN_VIDEO_API_KEY ou HEYGEN_VIDEO_AVATAR_ID absente du .env");

/** Le fond derrière l'avatar : celui du cercle du présentateur. */
const BACKGROUND = "#0B1020";
const [id, flag] = process.argv.slice(2);
if (!id) throw new Error("usage : node scripts/heygen-avatar.mjs <id du storyboard> [--force]");
const mp3 = join(out, `vo-${id}.mp3`);
const target = join(out, `avatar-${id}.mp4`);
if (!existsSync(mp3)) throw new Error(`voix absente : ${mp3} (lancer voiceover-pro.mjs d'abord)`);
if (existsSync(target) && flag !== "--force") {
  console.log(`${id} : avatar déjà généré`);
  process.exit(0);
}

async function call(path, init = {}) {
  const res = await fetch(`https://api.heygen.com${path}`, { ...init, headers: { "x-api-key": key, accept: "application/json", ...init.headers }, signal: AbortSignal.timeout(60_000) });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {}
  // Le message d'erreur ne reprend jamais la clé.
  if (!res.ok) throw new Error(`HeyGen ${res.status} ${path} : ${String(body?.error?.message ?? text).slice(0, 300)}`);
  return body?.data ?? {};
}

const form = new FormData();
form.append("file", new Blob([readFileSync(mp3)], { type: "audio/mpeg" }), "voice.mp3");
const asset = await call("/v3/assets", { method: "POST", body: form });
if (!asset.asset_id) throw new Error("HeyGen /v3/assets : pas d'asset_id");
const job = await call("/v3/videos", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "avatar", avatar_id: avatarId, audio_asset_id: asset.asset_id, aspect_ratio: "1:1", resolution: "720p", title: `TRED ${id}`, background: { type: "color", value: BACKGROUND } }),
});
const videoId = job.video_id ?? job.id;
if (!videoId) throw new Error("HeyGen /v3/videos : pas de video_id");
console.log(`${id} : génération lancée (${videoId})`);
for (let waited = 0; waited <= 20 * 60; waited += 10) {
  const state = await call(`/v3/videos/${encodeURIComponent(videoId)}`);
  if (state.status === "failed") throw new Error(`HeyGen : échec — ${String(state.failure_message ?? state.failure_code ?? "sans message").slice(0, 300)}`);
  if (state.status === "completed" && state.video_url) {
    const res = await fetch(state.video_url, { signal: AbortSignal.timeout(300_000) });
    if (!res.ok) throw new Error(`HeyGen : téléchargement refusé (${res.status})`);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    console.log(`${id} : avatar prêt, ${state.duration ?? "?"} s, après ${waited} s d'attente`);
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 10_000));
}
throw new Error("HeyGen : pas de vidéo après 20 minutes");
