// B-roll des courts-métrages « Cinematic » : un plan d'ambiance par film,
// généré par Replicate (lightricks/ltx-2.3-pro, 6 s, 1080p, sans son).
//
//   node scripts/cinematic-broll.mjs            (les plans manquants)
//   node scripts/cinematic-broll.mjs en1 --force
//
// Le jeton est lu dans le .env de la racine (REPLICATE_API_TOKEN) et n'est
// jamais affiché. Chaque plan est facturé par Replicate (à la seconde de vidéo).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "../src/assets/cine");
const MODEL = "lightricks/ltx-2.3-pro";
const LOOK = "Cinematic 35mm anamorphic film still in motion, shallow depth of field, subtle film grain, realistic, natural skin, no text, no captions, no logos.";

export const BROLL = {
  en1: `A university student alone at a wooden desk late at night, lit only by a warm amber desk lamp and the glow of an open laptop. Stacks of lecture notes and a coffee mug. The student rubs tired eyes, exhales, then leans toward the laptop and starts typing. Slow push-in from the side, the laptop screen is seen from behind. Warm amber tones, deep shadows. ${LOOK}`,
  en2: `Three engineering students sit around a table in a bright university seminar room in daylight, sharing one laptop. One points at the screen, the others lean in, nod and smile in agreement. Soft natural window light, neutral colours, one student wears a mustard yellow sweater. Slow lateral dolly, the laptop screen is seen from behind. ${LOOK}`,
  en3: `An international student sits alone on the bed of a small university dorm room at night with a laptop on the knees, headphones around the neck, a suitcase in the corner. Cold blue moonlight from the window, the face lit by the cool glow of the screen. The student looks lost, then focuses on the screen. Slow push-in, the laptop screen is seen from behind. Cold blue and teal tones. ${LOOK}`,
  de1: `A student in a small student room at night, sitting at a desk covered with printed exam sheets and a ring binder, a warm amber desk lamp. The student picks up one printed sheet, looks at it, frowns, then puts it next to the open laptop and starts typing. Slow push-in over the shoulder from behind at an angle, the screen is out of focus. Warm amber tones, deep shadows. ${LOOK}`,
  de2: `Three students study together at a long wooden table in a quiet university library, tall bookshelves behind them, sharing one laptop. Two of them write notes in notebooks while one points at the laptop. Soft warm library lamps and daylight, neutral colours, a yellow highlighter and a yellow notebook on the table. Slow lateral dolly, the laptop screen is seen from behind. ${LOOK}`,
  de3: `An exchange student sits at a small desk by a tall window of an old European apartment at night, city lights and light rain outside, a laptop open in front, a thick printed lecture script beside it. Cold blue night light, the face lit by the cool screen glow. The student flips a page of the script, sighs, then turns to the laptop. Slow push-in from the side, the laptop screen is seen from behind. Cold blue tones. ${LOOK}`,
  // Série B « Tech Premium » : très sombre, métal, néon jaune. Pas de personnage.
  b1: `A sleek dark aluminium laptop seen from behind on a black reflective surface in a pitch-dark studio. Golden sparks and thin streaks of warm yellow light swirl slowly around the laptop and rise like embers, soft volumetric haze, the lid edge glows. Slow orbiting camera, macro product shot, premium technology commercial, black and gold. ${LOOK}`,
  b2: `Abstract macro shot of a dark digital surface breaking apart: red corrupted pixels, flickering scan lines and shattered glass fragments flying toward the camera, then the fragments dissolve into clean darkness with a single calm golden light in the centre. High contrast, black background, red then gold, slow motion. ${LOOK}`,
  b3: `A camera flies slowly forward through an endless futuristic library at night: towering dark metal shelves, floating holographic pages and glowing yellow neon lines along the aisles, light fog, reflective black floor. Smooth continuous dolly forward, wide angle, science fiction, black, gunmetal and yellow neon. ${LOOK}`,
};

function token() {
  const line = readFileSync(join(here, "../../../.env"), "utf8").split(/\r?\n/).find((l) => l.startsWith("REPLICATE_API_TOKEN="));
  const t = line?.slice("REPLICATE_API_TOKEN=".length).trim().replace(/^["']|["']$/g, "");
  if (!t) throw new Error("REPLICATE_API_TOKEN absent du .env");
  return t;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [only, flag] = process.argv.slice(2);
  const H = { Authorization: `Bearer ${token()}`, "content-type": "application/json" };
  const jobs = [];
  for (const [id, prompt] of Object.entries(BROLL)) {
    if (only && only !== "--force" && only !== id) continue;
    const file = join(out, `broll-${id}.mp4`);
    if (existsSync(file) && flag !== "--force" && only !== "--force") { console.log(`${id} : déjà généré`); continue; }
    const r = await fetch(`https://api.replicate.com/v1/models/${MODEL}/predictions`, { method: "POST", headers: H, body: JSON.stringify({ input: { prompt, duration: 6, resolution: "1080p", aspect_ratio: "16:9", generate_audio: false, fps: 25 } }) });
    const j = await r.json();
    if (!r.ok) { console.log(`${id} : Replicate ${r.status} ${String(j.detail ?? j.title ?? "").slice(0, 160)}`); if (r.status === 402) break; continue; }
    console.log(`${id} : lancé (${j.id})`);
    jobs.push({ id, file, url: j.urls.get });
    await new Promise((r) => setTimeout(r, 12000)); // débit limité quand le solde Replicate est bas
  }
  for (const job of jobs) {
    for (let i = 0; i < 120; i++) {
      const j = await (await fetch(job.url, { headers: H })).json();
      if (j.status === "succeeded") {
        const src = Array.isArray(j.output) ? j.output[0] : j.output;
        writeFileSync(job.file, Buffer.from(await (await fetch(src)).arrayBuffer()));
        console.log(`${job.id} : prêt (${j.metrics?.predict_time?.toFixed?.(0) ?? "?"} s de calcul)`);
        break;
      }
      if (j.status === "failed" || j.status === "canceled") { console.log(`${job.id} : ${j.status} ${String(j.error).slice(0, 200)}`); break; }
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}
