/**
 * Fabrique les POSES du professeur pour les vidéos « anime » (web/video/anime-explanation.tsx),
 * à partir de son avatar (packages/web/public/avatars/<nom>.png) :
 *
 *     idle        il attend, bouche fermée
 *     talk        la même image, bouche ouverte
 *     point       il montre du doigt (en haut à gauche)
 *     point-talk  la même image, bouche ouverte
 *     hold        il tient un manche, le bras tendu (l'objet est ajouté par la vidéo)
 *     hold-talk   la même image, bouche ouverte
 *
 *     bun --env-file=.env scripts/generate-professor-sprites.mjs kenta
 *     bun --env-file=.env scripts/generate-professor-sprites.mjs mentor=C:/chemin/photo.jpg
 *
 * Avec `nom=photo`, la photo d'une personne RÉELLE est d'abord redessinée en personnage
 * (elle est envoyée à Replicate : seulement avec l'accord de cette personne), et l'avatar
 * est gardé dans public/avatars/<nom>.png.
 *
 * Replicate : black-forest-labs/flux-kontext-pro (retouche d'image : le
 * personnage reste le même d'une pose à l'autre), puis un détourage. Lit
 * REPLICATE_API_TOKEN dans l'environnement — jamais affiché.
 * Coût indicatif : 5 retouches (~0,04 $ chacune) + 2 détourages, soit ~0,25 $ par professeur.
 *
 * La bouche : la retouche « bouche ouverte » peut bouger d'autres pixels. Pour
 * que l'image ne tremble pas quand il parle, seule la zone de la bouche est
 * recopiée sur la pose bouche fermée (différence des deux images, limitée au visage).
 *
 * Les images brutes restent dans SPRITE_TMP (défaut : ./.sprites-tmp, ignoré par git)
 * pour être regardées avant d'être gardées.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Replicate from "replicate";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const AVATARS = join(HERE, "..", "packages", "web", "public", "avatars");
const OUT = join(AVATARS, "video");
const TMP = process.env.SPRITE_TMP || join(HERE, "..", ".sprites-tmp");
const EDIT = "black-forest-labs/flux-kontext-pro";
const CUTOUT = process.env.REPLICATE_CUTOUT_MODEL || "851-labs/background-remover";
const HEIGHT = 900;

const KEEP = "Keep the same character, the same face, the same hair, the same clothes, the same anime art style with clean outlines and flat colors, and the plain pure white background.";
// La silhouette (validée par le fondateur, 23 nov. 2026) : athlétique, proportions adultes — pas un personnage « chibi ».
const BUILD = "He has an athletic, fit build: broad shoulders, a slim waist, toned arms, a defined neck, and realistic adult proportions with a normal-sized head. He is not chubby and not chibi.";
const POSES = {
  // D'une photo, la pose d'attente est dessinée DIRECTEMENT (les proportions d'un adulte viennent de la photo).
  fromPhoto: `Redraw this man as a 2D anime character (seinen anime style, clean bold outlines, flat colors, soft cel shading), shown from the waist up, large in the frame, facing the viewer, BOTH hands resting on his hips, friendly smile. Keep his likeness: the same hairstyle, the same skin tone, the same facial hair, the same face shape, the same white t-shirt, with blue jeans. ${BUILD} Plain pure white background.`,
  // D'une PHOTO à un personnage : seulement avec `nom=chemin/de/la/photo` (voir plus bas).
  anime: "Turn this photo into a 2D anime style character portrait with clean bold outlines, flat colors and soft cel shading. Keep his likeness: the same hairstyle, the same skin tone, the same facial hair, the same face shape and the same clothes. Friendly smile, looking at the viewer, head and shoulders, plain pure white background.",
  body: `Zoom out to show this same character standing upright, facing the viewer, both arms relaxed down at his sides, with a friendly smile. Centered, with empty white space around him. ${KEEP}`,
  // Cadrée à la taille ; la pose « il montre » en est tirée : les deux gardent ainsi le même cadrage.
  idle: `Show him from the waist up, large in the frame: BOTH hands rest on his hips, and he looks at the viewer with a friendly smile. ${BUILD} ${KEEP}`,
  point: `Make him raise his right arm high and point with his index finger towards the upper left corner of the image, while his other hand stays on his hip and he looks at the viewer with a friendly smile. Do not move him, do not zoom out and do not change the framing: he stays visible from the waist up, at the same size, with the same body proportions. ${KEEP}`,
  // Il tient : le bras tendu vers la gauche, le poing fermé sur un manche (l'objet est ajouté par la vidéo).
  hold: `Make him stretch his right arm straight out towards the left edge of the image at chest height, with his fist closed as if he firmly grips a horizontal handle, while his other hand stays on his hip. His hand is empty: do not draw any object. Do not move him, do not zoom out and do not change the framing: he stays visible from the waist up, at the same size, with the same body proportions. ${KEEP}`,
  talk: "Open his mouth as if he is speaking in the middle of a sentence. Change ONLY the mouth. Keep everything else exactly identical: pose, position, framing, eyes, hair, clothes, arms and the white background.",
};

if (!process.env.REPLICATE_API_TOKEN) {
  console.error("x  REPLICATE_API_TOKEN absent. Lance : bun --env-file=.env scripts/generate-professor-sprites.mjs kenta");
  process.exit(1);
}
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN, useFileOutput: false });
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

function firstUrl(output) {
  if (typeof output === "string") return output.startsWith("http") ? output : null;
  if (Array.isArray(output)) return output.map(firstUrl).find(Boolean) ?? null;
  if (output && typeof output === "object") {
    const u = typeof output.url === "function" ? String(output.url()) : output.url;
    return typeof u === "string" ? firstUrl(u) : null;
  }
  return null;
}

const dataUri = (buf) => `data:image/png;base64,${buf.toString("base64")}`;

async function download(output, what) {
  const url = firstUrl(output);
  if (!url) throw new Error(`${what} : pas d'image (${JSON.stringify(output)?.slice(0, 200)})`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${what} : téléchargement ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Une retouche, gardée sur disque : relancer le script ne repaie pas une étape réussie. */
async function step(file, make) {
  const path = join(TMP, file);
  if (existsSync(path)) return readFileSync(path);
  const buf = await sharp(await make()).png().toBuffer();
  writeFileSync(path, buf);
  console.log(`   ${file}`);
  return buf;
}

const edit = (image, prompt, aspect) =>
  replicate.run(EDIT, { input: { prompt, input_image: dataUri(image), aspect_ratio: aspect, output_format: "png", safety_tolerance: 2 } }).then((o) => download(o, "retouche"));

let cutoutVersion = null;
async function cutout(image) {
  if (!cutoutVersion) {
    const [owner, name] = CUTOUT.split("/");
    cutoutVersion = (await replicate.models.get(owner, name)).latest_version?.id;
    if (!cutoutVersion) throw new Error(`${CUTOUT} : aucune version`);
  }
  return download(await replicate.run(`${CUTOUT}:${cutoutVersion}`, { input: { image: dataUri(image) } }), "détourage");
}

/**
 * La pose « bouche ouverte » : la pose fermée, où seule la zone de la bouche
 * vient de la retouche. Rend aussi le cadre trouvé (pour le journal).
 */
async function mouthOnly(closed, open) {
  const a = sharp(closed).ensureAlpha();
  const { width, height } = await a.metadata();
  const A = await a.raw().toBuffer();
  const B = await sharp(open).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
  // Le visage est dans la moitié haute : on cherche là le bloc de pixels qui a le plus changé.
  const cell = 8;
  const cols = Math.ceil(width / cell);
  const rows = Math.ceil((height * 0.6) / cell);
  const heat = new Float32Array(cols * rows);
  for (let y = 0; y < rows * cell && y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
      if (d > 90) heat[Math.floor(y / cell) * cols + Math.floor(x / cell)] += 1;
    }
  }
  let best = 0;
  let bx = 0;
  let by = 0;
  // Fenêtre glissante de 7 × 5 cellules : la bouche, pas un trait isolé.
  for (let r = 0; r + 5 <= rows; r++) {
    for (let c = 0; c + 7 <= cols; c++) {
      let s = 0;
      for (let dr = 0; dr < 5; dr++) for (let dc = 0; dc < 7; dc++) s += heat[(r + dr) * cols + c + dc];
      if (s > best) [best, bx, by] = [s, c, r];
    }
  }
  if (best < 40) throw new Error("bouche introuvable : les deux images sont presque identiques");
  const pad = 14;
  const x0 = Math.max(0, bx * cell - pad);
  const y0 = Math.max(0, by * cell - pad);
  const x1 = Math.min(width, (bx + 7) * cell + pad);
  const y1 = Math.min(height, (by + 5) * cell + pad);
  const out = Buffer.from(A);
  const feather = 10;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const edge = Math.min(x - x0, x1 - 1 - x, y - y0, y1 - 1 - y);
      const t = Math.min(1, edge / feather);
      const i = (y * width + x) * 4;
      for (let k = 0; k < 3; k++) out[i + k] = Math.round(A[i + k] * (1 - t) + B[i + k] * t);
    }
  }
  return { image: await sharp(out, { raw: { width, height, channels: 4 } }).png().toBuffer(), box: [x0, y0, x1 - x0, y1 - y0] };
}

/** L'alpha du détourage, posé sur une image de même cadrage. */
async function withAlphaOf(image, cut) {
  const { width, height } = await sharp(cut).metadata();
  const alpha = await sharp(cut).ensureAlpha().extractChannel(3).raw().toBuffer();
  // Le détourage perce parfois le personnage (des dents blanches, un tee-shirt blanc) : tout ce
  // qui est transparent SANS toucher le bord de l'image est rebouché.
  const outside = new Uint8Array(width * height);
  const stack = [];
  const visit = (i) => {
    if (!outside[i] && alpha[i] < 128) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < width; x++) (visit(x), visit((height - 1) * width + x));
  for (let y = 0; y < height; y++) (visit(y * width), visit(y * width + width - 1));
  while (stack.length) {
    const i = stack.pop();
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < width * (height - 1)) visit(i + width);
  }
  for (let i = 0; i < alpha.length; i++) if (!outside[i] && alpha[i] < 255) alpha[i] = 255;
  const rgb = await sharp(image).resize(width, height, { fit: "fill" }).removeAlpha().raw().toBuffer();
  return sharp(rgb, { raw: { width, height, channels: 3 } }).joinChannel(alpha, { raw: { width, height, channels: 1 } }).png().toBuffer();
}

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error("x  Donne un professeur : kenta, haruto, ren, aiko…");
  process.exit(1);
}
let failures = 0;
for (const arg of names) {
  const [name, photo] = arg.split(/=(.*)/s);
  try {
    console.log(`→  ${name}`);
    if (photo && !existsSync(join(AVATARS, `${name}.png`))) {
      const drawn = await step(`${name}-avatar.png`, async () => edit(await sharp(readFileSync(photo)).png().toBuffer(), POSES.anime, "1:1"));
      await sharp(drawn).resize(512, 512).png().toFile(join(AVATARS, `${name}.png`));
      await sharp(drawn).resize(512, 512).webp({ quality: 86 }).toFile(join(AVATARS, `${name}.webp`));
    }
    const avatar = readFileSync(join(AVATARS, `${name}.png`));
    const body = photo ? null : await step(`${name}-body.png`, () => edit(avatar, POSES.body, "3:4"));
    const idle = await step(`${name}-idle.png`, async () => (photo ? edit(await sharp(readFileSync(photo)).png().toBuffer(), POSES.fromPhoto, "3:4") : edit(body, POSES.idle, "match_input_image")));
    const point = await step(`${name}-point.png`, () => edit(idle, POSES.point, "match_input_image"));
    const hold = await step(`${name}-hold.png`, () => edit(idle, POSES.hold, "match_input_image"));
    const holdOpen = await step(`${name}-hold-open.png`, () => edit(hold, POSES.talk, "match_input_image"));
    const holdCut = await step(`${name}-hold-cut.png`, () => cutout(hold));
    const idleOpen = await step(`${name}-idle-open.png`, () => edit(idle, POSES.talk, "match_input_image"));
    const pointOpen = await step(`${name}-point-open.png`, () => edit(point, POSES.talk, "match_input_image"));
    const idleCut = await step(`${name}-idle-cut.png`, () => cutout(idle));
    const pointCut = await step(`${name}-point-cut.png`, () => cutout(point));

    const talk = await mouthOnly(idle, idleOpen);
    const pointTalk = await mouthOnly(point, pointOpen);
    const holdTalk = await mouthOnly(hold, holdOpen);
    console.log(`   bouche : ${talk.box.join(",")} · ${pointTalk.box.join(",")}`);
    // Les quatre poses gardent le MÊME cadre : le lecteur les superpose sans décalage.
    const poses = {
      idle: await withAlphaOf(idle, idleCut),
      talk: await withAlphaOf(talk.image, idleCut),
      point: await withAlphaOf(point, pointCut),
      "point-talk": await withAlphaOf(pointTalk.image, pointCut),
      hold: await withAlphaOf(hold, holdCut),
      "hold-talk": await withAlphaOf(holdTalk.image, holdCut),
    };
    for (const [pose, buf] of Object.entries(poses)) {
      await sharp(buf).resize({ height: HEIGHT }).webp({ quality: 88, alphaQuality: 90 }).toFile(join(OUT, `${name}-${pose}.webp`));
    }
    console.log(`ok ${name} : 6 poses dans public/avatars/video/`);
  } catch (err) {
    failures++;
    console.error(`x  ${name} : ${err?.message ?? err}`);
  }
}
process.exit(failures ? 1 : 0);
