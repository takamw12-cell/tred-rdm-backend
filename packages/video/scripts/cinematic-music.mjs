// Musiques des courts-métrages « Cinematic » : instrumentales, 46 s, générées
// par Replicate (stability-ai/stable-audio-2.5 ; sorties utilisables
// commercialement selon la licence du modèle — à revérifier avant diffusion).
//
//   node scripts/cinematic-music.mjs [id] [--force]
//
// Jeton lu dans le .env de la racine, jamais affiché. Facturé à la génération.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../src/assets/cine");
const END = "Instrumental only, no vocals, no speech. Clean mix, gentle intro, soft ending.";
const MUSIC = {
  amber: `Warm late-night lofi piano with soft tape hiss, mellow Rhodes chords, slow brushed drums entering after ten seconds, intimate and hopeful, cinematic, 72 BPM. ${END}`,
  neutral: `Light optimistic acoustic indie underscore, muted guitar plucks, soft claps and warm bass, bright but minimal, friendly teamwork mood, cinematic, 100 BPM. ${END}`,
  cold: `Cold nocturnal ambient electronica, glassy pads, distant felt piano notes, slow sub pulse, lonely then hopeful, cinematic, 80 BPM. ${END}`,
  tech1: `Dark premium tech underscore, deep analog bass pulse, shimmering metallic arpeggio, tight minimal percussion, building wonder and a big cinematic rise, 110 BPM. ${END}`,
  tech2: `Tense dark minimal electronic underscore that resolves into a clean confident pulse, glitch textures in the first eight seconds then precise crystalline synth plucks and deep bass, 100 BPM. ${END}`,
  tech3: `Futuristic expansive synthwave underscore, wide evolving pads, pulsing bass, sparkling arpeggios, sense of travelling through a vast space, premium and dark, 105 BPM. ${END}`,
};
const tok = readFileSync(join(here, "../../../.env"), "utf8").split(/\r?\n/).find((l) => l.startsWith("REPLICATE_API_TOKEN="))?.slice(20).trim().replace(/^["']|["']$/g, "");
if (!tok) throw new Error("REPLICATE_API_TOKEN absent du .env");
const H = { Authorization: `Bearer ${tok}`, "content-type": "application/json" };
const [only, flag] = process.argv.slice(2);
const jobs = [];
for (const [id, prompt] of Object.entries(MUSIC)) {
  if (only && only !== "--force" && only !== id) continue;
  const file = join(out, `music-${id}.mp3`);
  if (existsSync(file) && flag !== "--force" && only !== "--force") { console.log(`${id} : déjà généré`); continue; }
  const r = await fetch("https://api.replicate.com/v1/models/stability-ai/stable-audio-2.5/predictions", { method: "POST", headers: H, body: JSON.stringify({ input: { prompt, duration: 46, steps: 8 } }) });
  const j = await r.json();
  if (!r.ok) { console.log(`${id} : Replicate ${r.status} ${String(j.detail ?? j.title ?? "").slice(0, 160)}`); continue; }
  jobs.push({ id, file, url: j.urls.get });
  await new Promise((r) => setTimeout(r, 12000)); // débit limité quand le solde est bas
}
for (const job of jobs) {
  for (let i = 0; i < 90; i++) {
    const j = await (await fetch(job.url, { headers: H })).json();
    if (j.status === "succeeded") {
      const src = Array.isArray(j.output) ? j.output[0] : j.output;
      writeFileSync(job.file, Buffer.from(await (await fetch(src)).arrayBuffer()));
      console.log(`${job.id} : prêt → ${String(src).split(".").pop()}`);
      break;
    }
    if (j.status === "failed" || j.status === "canceled") { console.log(`${job.id} : ${j.status} ${String(j.error).slice(0, 200)}`); break; }
    await new Promise((r) => setTimeout(r, 4000));
  }
}
