/**
 * Fonds « universels » (refonte du 11 nov. 2026) : 10 images par filière,
 * générées avec Replicate — FLUX 1.1 Pro Ultra (Black Forest Labs), choix du
 * fondateur après comparaison avec FLUX.2 Pro et Imagen 4 Ultra.
 *
 *     bun --env-file=.env packages/web/scripts/generate-universal-backgrounds.mjs aerospace           (une filière)
 *     bun --env-file=.env packages/web/scripts/generate-universal-backgrounds.mjs --all --budget=15   (toutes)
 *     bun packages/web/scripts/generate-universal-backgrounds.mjs --config                            (JSON seul)
 *
 * Une image carrée Ultra (2048×2048) donne les DEUX recadrages, nets sans
 * agrandissement :
 *   <cat>-uNN.webp    1920×1080 (paysage, ordinateur)
 *   <cat>-uNN-p.webp  1080×1920 (portrait, téléphone)
 * dans packages/web/public/backgrounds/<cat>/, WebP qualité 85 (sharp,
 * effort 6). Puis met à jour packages/web/src/web/data/universal-backgrounds.json,
 * lu par src/web/lib/background-sets.ts : seules les images réellement
 * présentes y figurent, jamais un fond vide.
 *
 * - N'écrase jamais une image : les fichiers sont servis « immutable » (cache
 *   d'un an, __server.ts). Changer une image = lui donner un nouveau nom.
 * - Reprend où il s'est arrêté (fichiers existants ignorés).
 * - --budget=X : plafond en dollars, vérifié AVANT le premier appel ; s'il ne
 *   couvre pas tout, seules les filières complètes qui y tiennent sont générées.
 * - --dry-run : affiche le plan et le coût, sans aucun appel.
 * - Lit REPLICATE_API_TOKEN dans l'environnement — jamais affiché.
 */
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(WEB, "public", "backgrounds");
const CONFIG = join(WEB, "src", "web", "data", "universal-backgrounds.json");
const MODEL = "black-forest-labs/flux-1.1-pro-ultra";
const COST_PER_IMAGE = 0.06; // replicate.com, vérifié le 2026-11-11
const QUALITY = 85;

/** Style imposé (fondateur), plus les contraintes de composition d'un fond d'écran. */
const STYLE =
  "cinematic lighting, dark and moody atmosphere, subtle gold and amber accents, ultra-high resolution, " +
  "professional, inspiring, depth of field, 8k, photorealistic photograph, " +
  "main subject centered with generous dark negative space around it, " +
  "no text, no letters, no logos, no watermark, no people, no faces";

/** 10 sujets par filière. Neutres : aucune marque, aucune personne. */
export const SUBJECTS = {
  aerospace: [
    "rocket on the launch pad at night, illuminated by floodlights, vapor venting from the engines, plain unmarked white rocket body, strictly no text, no letters, no numbers, no logos, no markings, no watermarks",
    "close-up of a turbofan jet engine's fan blades in a dark hangar",
    "airliner wing above a sea of clouds at sunset",
    "planet Earth seen from orbit at night with city lights and a thin atmosphere glow, satellite solar panel in the foreground",
    "close-up of a metal rocket engine bell nozzle on a test stand during a static fire test, the nozzle in sharp focus and clearly visible, bright exhaust plume below",
    "space station module interior with panels and soft lights, empty",
    "fighter jet silhouette in a dark hangar, rim light on the fuselage",
    "empty wind tunnel test section in a laboratory, a small white scale aircraft model on a sting mount, thin white smoke streamlines flowing over its wing, calm and precise, no explosions, no fire",
    "satellite on an assembly stand in a clean room, smooth gold thermal blanket with soft crisp reflections, sharp fine detail, photographic, not pixelated",
    "aircraft cockpit at night, glowing instruments, runway lights through the windshield",
  ],
  mechanical: [
    "large precision steel gears of an industrial gearbox",
    "CNC milling machine cutting a metal part with coolant spray",
    "cutaway of a car engine with pistons and crankshaft on a dark workbench",
    "steam turbine rotor in a dark power plant hall",
    "precision metal bearings and machined parts on a dark surface, macro",
    "hydraulic press in a dark workshop with glowing hot metal",
    "engineering workshop with lathes, warm lamps, metal shavings",
    "watch movement macro, tiny gears and jewels",
    "jet of sparks from an angle grinder on steel in a dark workshop",
    "3D printer building a complex metal part, glowing laser",
  ],
  mechatronics: [
    "robotic hand with exposed actuators and cables on a dark bench",
    "electronic control board connected to small servo motors",
    "automated assembly cell with a robot arm and a conveyor",
    "macro of a stepper motor and a gearbox",
    "printed circuit board inside a robot chassis, glowing status LEDs",
    "pneumatic actuators and tubing on an automation test rig",
    "exoskeleton prototype on a stand in a dark lab",
    "sensor array and lidar on a mobile robot",
    "camera-guided pick and place machine over a tray of parts",
    "workbench with oscilloscope, microcontroller and motor prototype",
  ],
  robotics: [
    "industrial robot arm welding with bright sparks in a dark factory",
    "four-legged walking robot on a test track in a dark research hall",
    "collaborative robot arms around a workbench in a clean lab",
    "formation of small drones with lights flying over a city at night",
    "humanoid robot hand reaching toward the light, dark background",
    "warehouse robots moving between tall shelves",
    "planetary rover prototype on a rocky test field at dusk",
    "underwater robot in a dark test tank with light beams",
    "surgical robot arms above an empty operating table",
    "robot vacuum gripper picking a part, macro",
  ],
  electrical: [
    "high voltage power line pylons at dusk",
    "lightning strike over a city at night",
    "macro of a printed circuit board with gold traces and microchips",
    "electrical substation at night with glowing insulators",
    "large power transformer in a dark hall",
    "oscilloscope showing a glowing sine wave on a dark bench",
    "copper coils of an electric motor, macro",
    "silicon wafer reflecting light in a clean room",
    "tesla coil arc in a dark laboratory",
    "control cabinet with neatly wired terminals and relays",
  ],
  civil: [
    "cable-stayed bridge at blue hour with light trails of traffic",
    "construction site with tower cranes and a concrete skeleton at dusk",
    "tunnel boring machine cutter head in a tunnel",
    "concrete dam wall seen from below, dramatic scale",
    "steel truss bridge underside, strong perspective",
    "skyscraper steel frame under construction at sunset",
    "highway interchange at night, aerial view",
    "surveying total station on a tripod at a construction site at dusk",
    "rebar cage before a concrete pour, macro perspective",
    "suspension bridge tower and cables in fog",
  ],
  architecture: [
    "modern concrete and glass building at dusk, dramatic upward perspective",
    "white architectural city model on a desk with blueprints, desk lamp light",
    "spiral staircase seen from below, minimalist, symmetrical",
    "contemporary museum facade with a geometric pattern illuminated at night",
    "brutalist concrete interior with light shafts",
    "drafting table with architectural drawings, pencils and a lamp",
    "interior of a large curved timber roof structure with repeating wooden ribs, no signs, no lettering",
    "glass atrium with sunlight beams",
    "cathedral vaulted ceiling, gothic arches",
    "minimalist courtyard with a reflecting pool at night",
  ],
  industrial: [
    "automated logistics warehouse with mobile robots between tall racks",
    "smart factory floor with a robotic assembly line",
    "container port at night with gantry cranes",
    "control room overlooking a production hall, glowing abstract dashboards",
    "car body assembly line with welding robots",
    "conveyor belts with packages in a distribution center",
    "steel mill with molten metal pouring",
    "lean production board with abstract charts in a factory office, nothing readable",
    "freight train yard at night",
    "aerial view of a cargo ship loaded with containers at sunset",
  ],
  chemical: [
    "chemical plant with pipes and distillation columns at dusk",
    "stainless steel bioreactors in a clean production hall",
    "refinery towers at night with steam and lights",
    "laboratory glassware with glowing liquid and a distillation apparatus",
    "macro of crystals growing in a solution",
    "pipe rack with valves and gauges in a process plant",
    "fume hood with flasks and a burner in a dark lab",
    "molecular model of a complex molecule on a dark desk",
    "drops of liquid in a petri dish, macro, glowing",
    "industrial reactor vessel with steam",
  ],
  environmental: [
    "wind turbines on rolling hills at dusk",
    "large solar farm at sunset",
    "water treatment plant basins at dusk",
    "hydroelectric dam spillway with mist",
    "dense rainforest canopy with morning light",
    "glacier edge with deep crevasses at golden hour",
    "offshore wind farm at sunset",
    "geothermal power plant with steam in a volcanic landscape",
    "river delta seen from above at sunset",
    "greenhouse of a vertical farm with grow lights",
  ],
  biomedical: [
    "MRI scanner in a modern dark hospital room",
    "robotic surgical system arms above an empty operating table",
    "bionic prosthetic hand prototype on a lab bench",
    "laboratory microscope next to a monitor showing glowing cell imagery",
    "3D bioprinter printing tissue scaffold",
    "cochlear implant and medical electronics, macro",
    "pacemaker on a dark surface, macro",
    "lab-on-a-chip microfluidic device with colored channels",
    "artificial heart valve prototype, macro",
    "empty biomedical lab, sterile surgical instruments neatly arranged on a steel tray, nobody in the room",
  ],
  informatics: [
    "screen with code in a dark editor, shallow depth of field",
    "server racks in a dark data center, strong perspective",
    "macro of a CPU die with intricate circuitry",
    "mechanical keyboard at night with a glowing screen behind",
    "fiber optic cables glowing at the ends",
    "quantum computer chandelier cryostat, gold plated",
    "network switch with blinking lights and patch cables",
    "old computer terminal next to a modern laptop in a dark room",
    "abstract visualization of a network graph floating in darkness",
    "motherboard macro with capacitors and traces",
  ],
  datascience: [
    "GPU computing cluster with lights and bundled cables",
    "abstract neural network visualization, glowing nodes and connections",
    "curved wall of glowing abstract graphs and point clouds, nothing readable",
    "data center corridor with lights",
    "3D scatter plot made of light particles in darkness",
    "abstract flowing data streams of light",
    "AI accelerator chip macro",
    "holographic globe made of data points",
    "abstract heatmap pattern of glowing tiles",
    "desk with multiple monitors showing abstract charts at night, nothing readable",
  ],
  mathematics: [
    "chalkboard covered in handwritten equations in a dark lecture hall",
    "three-dimensional fractal structure floating in darkness",
    "spiral galaxy crossed by faint geometric orbit lines",
    "minimal surface sculpture in a dark museum",
    "golden ratio spiral in a nautilus shell, macro",
    "compass, ruler and geometric drawings on paper",
    "abstract Klein bottle made of glass",
    "Voronoi pattern in nature, macro",
    "Penrose tiling floor in light and shadow",
    "old mathematics books and a brass astrolabe",
  ],
  physics: [
    "nebula in deep space",
    "Milky Way over a mountain observatory",
    "equations on a chalkboard",
    "particle accelerator tunnel with a beam pipe and magnets",
    "laser beam split by optics on an optical table",
    "cloud chamber particle tracks",
    "large radio telescope dish at night",
    "pendulum and physics apparatus in an old lab",
    "aurora borealis over a frozen lake",
    "glass lens focusing a thin beam of light onto a dark optical bench, precise and minimal",
  ],
  medicine: [
    "DNA double helix floating in darkness, scientific visualization",
    "modern operating room with surgical lights, empty",
    "brain MRI scans on a backlit light box in a dark radiology room",
    "doctor's coat hanging next to a stethoscope in a clinic",
    "microscope and test tubes in a medical research laboratory",
    "anatomical model of the human heart on a desk",
    "human skeleton model in an anatomy lecture hall",
    "pharmacy shelves with medicine bottles, shallow depth of field",
    "neurons glowing, microscopy style",
    "hospital corridor at night, empty",
  ],
  law: [
    "grand old library with tall shelves of leather-bound law books",
    "bronze statue of Lady Justice holding scales",
    "neoclassical courthouse facade with stone columns at dusk",
    "judge's gavel on a dark desk beside open law books",
    "historic library reading room with green desk lamps",
    "empty courtroom with wooden benches",
    "fountain pen signing an old document, nothing readable",
    "marble columns of a parliament hall",
    "stack of old legal files tied with ribbon",
    "scales of justice in brass, macro",
  ],
  economics: [
    "abstract candlestick charts on large screens in a trading room, nothing readable",
    "business district skyline at dusk",
    "empty stock exchange trading floor at night",
    "abstract line and bar charts floating in darkness",
    "stacks of coins and a fountain pen on a dark desk",
    "central bank building facade at night",
    "gold bars in a vault",
    "boardroom with a long table and city view at night",
    "container ship at sea at sunset, global trade",
    "abacus and old ledger on a desk, nothing readable",
  ],
  biology: [
    "macro of a leaf with water droplets",
    "cells under a microscope, glowing",
    "coral reef underwater with light rays",
    "butterfly wing scales, macro",
    "forest floor with mushrooms",
    "petri dishes with colonies in a lab",
    "tree of life sculpture in a natural history museum",
    "jellyfish glowing in dark water",
    "seed sprouting from soil, macro",
    "herbarium specimens and a magnifying glass",
  ],
  psychology: [
    "abstract visualization of the human brain with glowing neural pathways",
    "quiet therapy room with an armchair and a window at dusk",
    "labyrinth seen from above",
    "old psychology books and a desk lamp",
    "symmetrical black and gold ink blot pattern on cream paper, clearly visible, centered, soft light",
    "brain model made of glass on a desk",
    "rain on a window at night, reflective mood",
    "neurons firing, abstract",
    "chess pieces on a board, thoughtful mood",
    "path through a misty forest",
  ],
  philosophy: [
    "ancient Greek temple columns at dusk",
    "marble bust of a philosopher in a museum, rim light",
    "old books and a candle on a wooden desk",
    "starry sky over a lone tree on a hill",
    "stone amphitheater at sunset",
    "hourglass with sand on a desk",
    "library with a spiral staircase",
    "lighthouse on a cliff at night",
    "chess board and an old book",
    "monastery cloister with light and shadow",
  ],
  languages: [
    "old cast-iron printing press in a dark workshop, warm lamp light on the machine, no visible letters or words",
    "stacks of dictionaries and books in many colors",
    "globe and old maps on a desk",
    "fountain pen and ink bottle on paper, nothing readable",
    "ancient library with scrolls",
    "typewriter keys, macro, letters out of focus",
    "Rosetta-style carved stone tablet in a museum, symbols out of focus",
    "cozy bookshop interior at night with warm lights and tall shelves, no signs, no lettering",
    "world map made of lights",
    "calligraphy brushes and ink stone",
  ],
  history: [
    "ancient ruins at sunset",
    "medieval castle on a hill at dusk",
    "old map with a compass and a magnifying glass",
    "museum hall with ancient artifacts",
    "Roman aqueduct at golden hour",
    "old manuscripts in an archive, nothing readable",
    "knight armor in a museum",
    "pyramids under a starry sky",
    "vintage globe and quill pen",
    "archaeological dig site with tools",
  ],
};

const pad = (n) => String(n).padStart(2, "0");
const target = (cat, n) => join(ROOT, cat, `${cat}-u${pad(n)}.webp`);
const portrait = (file) => file.replace(/\.webp$/, "-p.webp");

/** Deux recadrages centrés depuis le carré 2048 : jamais d'agrandissement. */
async function writeVariants(raw, land, port) {
  // Écriture atomique : fichier temporaire puis renommage. Un processus
  // coupé au milieu ne laisse jamais une image tronquée sous le nom final.
  const tmp = (f) => `${f}.tmp`;
  const { width, height } = await sharp(raw).metadata();
  const side = Math.min(width, height);
  const short = Math.round((side * 9) / 16);
  const webp = { quality: QUALITY, effort: 6, smartSubsample: true };
  await sharp(raw)
    .extract({ left: Math.round((width - side) / 2), top: Math.round((height - short) / 2), width: side, height: short })
    .resize(1920, 1080, { fit: "cover" })
    .webp(webp)
    .toFile(tmp(land));
  await sharp(raw)
    .extract({ left: Math.round((width - short) / 2), top: Math.round((height - side) / 2), width: short, height: side })
    .resize(1080, 1920, { fit: "cover" })
    .webp(webp)
    .toFile(tmp(port));
  // Portrait d'abord, paysage en dernier : le paysage présent = l'image est complète.
  renameSync(tmp(port), port);
  renameSync(tmp(land), land);
}

/** universal-backgrounds.json : { filière: [images présentes avec leur variante portrait] }. */
function writeConfig() {
  const out = {};
  for (const cat of Object.keys(SUBJECTS)) {
    const dir = join(ROOT, cat);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir)
      .filter((f) => /^[a-z]+-u\d\d\.webp$/.test(f) && existsSync(join(dir, portrait(f))))
      .sort()
      .map((f) => `/backgrounds/${cat}/${f}`);
    if (files.length) out[cat] = files;
  }
  writeFileSync(CONFIG, JSON.stringify(out, null, 2) + "\n");
  console.log(`ok  config : ${Object.values(out).flat().length} image(s), ${Object.keys(out).length} filière(s)`);
}

const args = process.argv.slice(2);
if (args.includes("--config")) {
  writeConfig();
  process.exit(0);
}

const cats = args.includes("--all") ? Object.keys(SUBJECTS) : args.filter((a) => !a.startsWith("--"));
const unknown = cats.filter((c) => !(c in SUBJECTS));
if (cats.length === 0 || unknown.length) {
  console.error(`x  filière(s) : ${unknown.join(", ") || "aucune"}. Connues : ${Object.keys(SUBJECTS).join(", ")} (ou --all).`);
  process.exit(1);
}
if (!process.env.REPLICATE_API_TOKEN) {
  console.error("x  REPLICATE_API_TOKEN absent. Lance : bun --env-file=.env packages/web/scripts/generate-universal-backgrounds.mjs <filière>");
  process.exit(1);
}

let todo = cats.flatMap((cat) => SUBJECTS[cat].map((subject, i) => [cat, i + 1, subject])).filter(([cat, n]) => !(existsSync(target(cat, n)) && existsSync(portrait(target(cat, n)))));
// Restes d'un lancement coupé : paysage sans portrait, fichiers .tmp.
for (const [cat, n] of todo) for (const f of [target(cat, n), portrait(target(cat, n))]) for (const g of [f, `${f}.tmp`]) if (existsSync(g)) rmSync(g);
const budget = Number(args.find((a) => a.startsWith("--budget="))?.slice(9) ?? Infinity);
const total = todo.length;
/**
 * Budget plus petit que le total : on génère autant de filières COMPLÈTES
 * qu'il le permet, dans l'ordre de SUBJECTS (filières du sélecteur d'abord),
 * au lieu de tout refuser. Les suivantes : à la prochaine relance.
 */
if (total * COST_PER_IMAGE > budget) {
  const kept = [];
  for (const cat of cats) {
    const jobs = todo.filter(([c]) => c === cat);
    if ((kept.length + jobs.length) * COST_PER_IMAGE > budget + 1e-9) break;
    kept.push(...jobs);
  }
  todo = kept;
  const planned = [...new Set(todo.map(([c]) => c))];
  console.log(`budget ${budget} $ : ${todo.length}/${total} fond(s) — ${planned.join(", ") || "aucune filière"} ; le reste à la prochaine relance.`);
}
console.log(`${todo.length} fond(s) à générer avec ${MODEL} — ~${(todo.length * COST_PER_IMAGE).toFixed(2)} $`);
if (todo.length === 0 || args.includes("--dry-run")) process.exit(0);

const { default: Replicate } = await import("replicate");
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN, useFileOutput: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 429 (petit compte) → on attend et on réessaie ; 402 (crédit épuisé) → arrêt net. */
async function createWithRetry(input) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await replicate.predictions.create({ model: MODEL, input });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // 402 : on arrête net et on montre le message EXACT de Replicate.
      if (msg.includes("402")) throw new Error(`402 — Replicate : ${msg.slice(0, 300)}`);
      if (!msg.includes("429") || attempt >= 6) throw err;
      const wait = Number(/retry_after"?:\s*(\d+)/.exec(msg)?.[1] ?? 12) + 1;
      console.log(`   limite Replicate — nouvelle tentative dans ${wait} s`);
      await sleep(wait * 1000);
    }
  }
}

const firstUrl = (o) =>
  typeof o === "string" ? (o.startsWith("http") ? o : null) : Array.isArray(o) ? (o.map(firstUrl).find(Boolean) ?? null) : null;

let spent = 0;
let done = 0;
let failures = 0;
// Deux à la fois : assez rapide, sous la limite des petits comptes.
const CONCURRENCY = 2;
for (let i = 0; i < todo.length; i += CONCURRENCY) {
  try {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async ([cat, n, subject], k) => {
        const p = await replicate.wait(
          await createWithRetry({
            prompt: `${subject}, ${STYLE}`,
            aspect_ratio: "1:1",
            output_format: "png",
            // raw : rendu photographique naturel, moins « image d'IA » lisse.
            raw: true,
            safety_tolerance: 2,
            seed: 7000 + i + k,
          }),
        );
        const url = p.status === "succeeded" ? firstUrl(p.output) : null;
        if (!url) {
          failures++;
          console.error(`x  ${cat}-u${pad(n)} : ${p.status} ${p.error ?? ""}`.trim());
          return;
        }
        spent += COST_PER_IMAGE;
        const res = await fetch(url);
        if (!res.ok) {
          failures++;
          console.error(`x  ${cat}-u${pad(n)} : téléchargement ${res.status}`);
          return;
        }
        mkdirSync(join(ROOT, cat), { recursive: true });
        await writeVariants(Buffer.from(await res.arrayBuffer()), target(cat, n), portrait(target(cat, n)));
        done++;
        console.log(`ok  ${cat}-u${pad(n)}.webp + -p.webp  (${done}/${todo.length}, ~${spent.toFixed(2)} $)`);
      }),
    );
  } catch (err) {
    failures++;
    console.error(`x  ${err instanceof Error ? err.message.slice(0, 200) : err}`);
    if (String(err).includes("402")) break;
  }
}
writeConfig();
console.log(`dépense estimée : ${spent.toFixed(2)} $`);
if (failures) console.error(`x  ${failures} échec(s) — relance la même commande : le script reprend où il s'est arrêté.`);
process.exit(failures ? 1 : 0);
