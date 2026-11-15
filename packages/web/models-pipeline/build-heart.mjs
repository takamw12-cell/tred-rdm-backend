/**
 * Construit `public/models/medicine/heart.glb` à partir de BodyParts3D 4.0.
 *
 *   BP3D_DIR=<dossier où l'archive officielle est décompressée> node models-pipeline/build-heart.mjs
 *
 * Source : https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/
 *   partof_BP3D_4.0_obj_99.zip  +  partof_element_parts.txt
 * Licence : CC BY 4.0 — « BodyParts3D, © The Database Center for Life Science
 * licensed under CC Attribution 4.0 International » (README de la version 4.0
 * et https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html, lus le
 * 2026-11-15). Les fichiers d'origine ne sont PAS dans le dépôt : seul le
 * modèle converti y est, avec sa mention (public/models/CREDITS.md).
 *
 * Ce que fait la conversion : les maillages du cœur sont regroupés en pièces
 * nommées (une par repère de l'Explorateur), passés de millimètres / Z vers le
 * haut à des unités de scène / Y vers le haut, centrés, et reçoivent une
 * matière. La géométrie elle-même n'est pas retouchée. Le fichier est ensuite
 * compressé par gltf-transform (voir models-pipeline/README.md).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";

const here = dirname(fileURLToPath(import.meta.url));
const SRC = process.env.BP3D_DIR;
if (!SRC) throw new Error("BP3D_DIR manquant : le dossier de l'archive BodyParts3D décompressée");
const OUT = join(here, ".tmp/heart.raw.glb");

/** Pièce du modèle → concepts FMA, couleur sRGB (tissu réel : jamais métallique). L'ordre fait foi : un maillage va à la première pièce qui le réclame. */
const PARTS = [
  { id: "right-atrium", fma: ["FMA7096"], color: "#9A3A36" },
  { id: "left-atrium", fma: ["FMA7097"], color: "#A2403A" },
  { id: "right-ventricle", fma: ["FMA7098"], color: "#8A2A2A" },
  { id: "left-ventricle", fma: ["FMA7101"], color: "#962B27" },
  { id: "aorta", fma: ["FMA3736", "FMA3768"], color: "#C4382E" },
  { id: "pulmonary-trunk", fma: ["FMA8612"], color: "#3E5F9E" },
  { id: "venae-cavae", fma: ["FMA4720"], color: "#34508C" },
  { id: "heart-other", fma: ["FMA7088"], color: "#8E2B2A" },
];

/** « #RRGGBB » (sRGB, ce que l'œil voit) → composantes linéaires, comme glTF les attend. */
const linear = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));

const table = readFileSync(join(SRC, "partof_element_parts.txt"), "utf8").split(/\r?\n/).slice(1).map((l) => l.split("\t"));
const filesOf = (fma) => table.filter((r) => r[0] === fma).map((r) => r[2]);

function readObj(id) {
  const pos = [];
  const tri = [];
  for (const line of readFileSync(join(SRC, "partof_BP3D_4.0_obj_99", `${id}.obj`), "utf8").split("\n")) {
    if (line.startsWith("v ")) {
      const [, x, y, z] = line.trim().split(/\s+/).map(Number);
      // BodyParts3D : millimètres, Z vers le haut, Y vers l'arrière → scène : Y vers le haut, Z vers l'observateur.
      pos.push(x, z, -y);
    } else if (line.startsWith("f ")) {
      const idx = line.trim().split(/\s+/).slice(1).map((t) => Number(t.split("/")[0]) - 1);
      for (let k = 1; k + 1 < idx.length; k++) tri.push(idx[0], idx[k], idx[k + 1]);
    }
  }
  return { pos, tri };
}

const taken = new Set();
const built = [];
for (const part of PARTS) {
  const pos = [];
  const tri = [];
  for (const id of part.fma.flatMap(filesOf)) {
    if (taken.has(id)) continue;
    taken.add(id);
    const o = readObj(id);
    const base = pos.length / 3;
    pos.push(...o.pos);
    for (const i of o.tri) tri.push(base + i);
  }
  if (tri.length) built.push({ ...part, pos, tri });
}

// Centrage et mise à l'échelle sur l'ensemble : le plus grand côté fait 3,4 unités.
let min = [Infinity, Infinity, Infinity];
let max = [-Infinity, -Infinity, -Infinity];
for (const b of built) for (let i = 0; i < b.pos.length; i += 3) for (let a = 0; a < 3; a++) {
  min[a] = Math.min(min[a], b.pos[i + a]);
  max[a] = Math.max(max[a], b.pos[i + a]);
}
const centre = min.map((m, a) => (m + max[a]) / 2);
const k = 3.4 / Math.max(...max.map((m, a) => m - min[a]));

const doc = new Document();
const buffer = doc.createBuffer();
const scene = doc.createScene("heart");
const report = {};
for (const b of built) {
  const position = new Float32Array(b.pos.length);
  for (let i = 0; i < b.pos.length; i += 3) for (let a = 0; a < 3; a++) position[i + a] = (b.pos[i + a] - centre[a]) * k;
  // Normales lissées : somme des normales des faces autour de chaque sommet.
  const normal = new Float32Array(position.length);
  for (let i = 0; i < b.tri.length; i += 3) {
    const [p, q, r] = [b.tri[i] * 3, b.tri[i + 1] * 3, b.tri[i + 2] * 3];
    const u = [position[q] - position[p], position[q + 1] - position[p + 1], position[q + 2] - position[p + 2]];
    const v = [position[r] - position[p], position[r + 1] - position[p + 1], position[r + 2] - position[p + 2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    for (const s of [p, q, r]) for (let a = 0; a < 3; a++) normal[s + a] += n[a];
  }
  for (let i = 0; i < normal.length; i += 3) {
    const l = Math.hypot(normal[i], normal[i + 1], normal[i + 2]) || 1;
    for (let a = 0; a < 3; a++) normal[i + a] /= l;
  }
  const material = doc.createMaterial(b.id).setBaseColorFactor([...linear(b.color), 1]).setRoughnessFactor(0.48).setMetallicFactor(0);
  const prim = doc
    .createPrimitive()
    .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(position).setBuffer(buffer))
    .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(normal).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType("SCALAR").setArray(new Uint32Array(b.tri)).setBuffer(buffer))
    .setMaterial(material);
  scene.addChild(doc.createNode(b.id).setMesh(doc.createMesh(b.id).addPrimitive(prim)));

  // Où poser le repère : le sommet de la pièce le plus en avant, côté extérieur du cœur.
  let c = [0, 0, 0];
  for (let i = 0; i < position.length; i += 3) for (let a = 0; a < 3; a++) c[a] += position[i + a] / (position.length / 3);
  const dir = [c[0] * 0.6, c[1] * 0.6, 1];
  let best = -Infinity;
  let spot = c;
  for (let i = 0; i < position.length; i += 3) {
    const d = position[i] * dir[0] + position[i + 1] * dir[1] + position[i + 2] * dir[2];
    if (d > best) {
      best = d;
      spot = [position[i], position[i + 1], position[i + 2]];
    }
  }
  report[b.id] = { triangles: b.tri.length / 3, spot: spot.map((v) => Math.round(v * 100) / 100) };
}
doc.getRoot().getAsset().copyright = "BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International";
doc.getRoot().getAsset().generator = "TRED models-pipeline/build-heart.mjs";

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, await new NodeIO().writeBinary(doc));
console.log(JSON.stringify({ fichier: OUT, boite: { min: min.map((m, a) => Math.round((m - centre[a]) * k * 100) / 100), max: max.map((m, a) => Math.round((m - centre[a]) * k * 100) / 100) }, pieces: report }, null, 1));
