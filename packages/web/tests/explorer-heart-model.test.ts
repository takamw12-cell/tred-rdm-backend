import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { EXPLORER_MODELS } from "../src/web/lib/explorer-models";
import { HEART_GLB, HEART_PART_OF } from "../src/web/lib/explorer-more";

/**
 * Le cœur anatomique (BodyParts3D, CC BY 4.0) : le fichier livré doit rester
 * léger, porter sa mention de licence, et chaque repère du modèle doit
 * retrouver SA pièce dans le fichier — sinon la surbrillance ne dit plus rien.
 */
const pub = join(import.meta.dir, "../public");
const file = join(pub, HEART_GLB);

/** Le bloc JSON d'un fichier .glb (en-tête de 12 octets, puis un bloc « JSON »). */
function glbJson(path: string) {
  const b = readFileSync(path);
  expect(b.toString("latin1", 0, 4)).toBe("glTF");
  const length = b.readUInt32LE(12);
  expect(b.toString("latin1", 16, 20)).toBe("JSON");
  return JSON.parse(b.toString("utf8", 20, 20 + length)) as { asset: { copyright?: string }; nodes: { name?: string; mesh?: number }[]; extensionsRequired?: string[]; images?: unknown[] };
}

describe("cœur anatomique de l'Explorateur", () => {
  test("le fichier est servi depuis le dossier de sa filière et pèse moins de 1 Mo", () => {
    expect(HEART_GLB).toBe("/models/medicine/heart.glb");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file).byteLength).toBeLessThan(1_000_000);
  });

  test("la mention BodyParts3D (CC BY 4.0) est dans le fichier et dans CREDITS.md", () => {
    expect(glbJson(file).asset.copyright).toContain("BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International");
    const credits = readFileSync(join(pub, "models/CREDITS.md"), "utf8");
    expect(credits).toContain("BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International");
    expect(credits).toContain("medicine/heart.glb");
  });

  test("chaque repère du cœur a sa pièce nommée dans le fichier", () => {
    const names = glbJson(file).nodes.filter((n) => n.mesh !== undefined).map((n) => n.name);
    for (const h of EXPLORER_MODELS.heart.hotspots) {
      expect(names).toContain(h.id);
      expect(HEART_PART_OF[h.id]).toBe(h.id);
    }
    // Toute pièce du fichier est connue du code : rien n'est dessiné sans qu'on sache quoi.
    for (const n of names) expect(Object.keys(HEART_PART_OF)).toContain(n as string);
  });

  test("le fichier ne demande que le décodeur embarqué (meshopt), ni Draco ni image distante", () => {
    const j = glbJson(file);
    expect(j.extensionsRequired ?? []).not.toContain("KHR_draco_mesh_compression");
    expect(j.images ?? []).toHaveLength(0);
  });

  test("les repères sont posés à l'intérieur du cadre du modèle", () => {
    const { min, max } = EXPLORER_MODELS.heart.bounds;
    for (const h of EXPLORER_MODELS.heart.hotspots) for (let a = 0; a < 3; a++) {
      expect(h.position[a]).toBeGreaterThanOrEqual(min[a]);
      expect(h.position[a]).toBeLessThanOrEqual(max[a]);
    }
  });
});
