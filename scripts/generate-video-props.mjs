/**
 * Fabrique les OBJETS des vidéos « anime » (packages/web/public/video-props/) : des images
 * détourées que la composition anime elle-même (la clé tourne autour de l'écrou, la planche
 * bascule sur son appui). Le mouvement est calculé par le code : il est donc juste.
 *
 *     bun --env-file=.env scripts/generate-video-props.mjs            (tous)
 *     bun --env-file=.env scripts/generate-video-props.mjs wrench     (certains)
 *
 * Replicate : black-forest-labs/flux-schnell (~0,003 $ l'image) puis un détourage.
 * Lit REPLICATE_API_TOKEN dans l'environnement — jamais affiché.
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Replicate from "replicate";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "packages", "web", "public", "video-props");
const STYLE = "2D anime style illustration, clean bold black outlines, flat colors, soft cel shading, a single object isolated on a plain pure white background, no shadow, no text, no hands, no people";
const PROPS = {
  wrench: ["one long steel open-end wrench lying perfectly horizontal, seen from the side, the open jaw on the left end, the long straight handle going to the right", "21:9"],
  plank: ["one long straight wooden plank lying perfectly horizontal, seen exactly from the side, light brown wood with grain, very long and thin", "21:9"],
  rock: ["one big heavy grey boulder, rounded, sitting on its flat base", "1:1"],
  wedge: ["one small solid grey stone block shaped like a triangle with a flat base and a pointed top, seen from the side", "1:1"],
};
const CUTOUT = process.env.REPLICATE_CUTOUT_MODEL || "851-labs/background-remover";

if (!process.env.REPLICATE_API_TOKEN) {
  console.error("x  REPLICATE_API_TOKEN absent. Lance : bun --env-file=.env scripts/generate-video-props.mjs");
  process.exit(1);
}
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN, useFileOutput: false });
mkdirSync(OUT, { recursive: true });
const first = (o) => (typeof o === "string" ? o : Array.isArray(o) ? o.map(first).find(Boolean) : o?.url ? first(typeof o.url === "function" ? String(o.url()) : o.url) : null);
const get = async (o) => Buffer.from(await (await fetch(first(o))).arrayBuffer());
const [owner, name] = CUTOUT.split("/");
const version = (await replicate.models.get(owner, name)).latest_version.id;

let failures = 0;
for (const prop of process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROPS)) {
  try {
    const [subject, ratio] = PROPS[prop];
    let image = null;
    for (let k = 0; k < 3 && !image; k++) {
      const out = await replicate.run("black-forest-labs/flux-schnell", { input: { prompt: `${STYLE}. ${subject}`, aspect_ratio: ratio, output_format: "png", num_outputs: 1 } }).catch(() => null);
      if (first(out)) image = await get(out);
    }
    if (!image) throw new Error("pas d'image");
    const cut = await get(await replicate.run(`${CUTOUT}:${version}`, { input: { image: `data:image/png;base64,${image.toString("base64")}` } }));
    // Recadré au plus près : la composition place l'objet par ses bords.
    await sharp(cut).trim({ threshold: 10 }).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 92 }).toFile(join(OUT, `${prop}.webp`));
    console.log(`ok ${prop}`);
  } catch (err) {
    failures++;
    console.error(`x  ${prop} : ${err?.message ?? err}`);
  }
}
process.exit(failures ? 1 : 0);
