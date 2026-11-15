import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { CONTENT_LOCALES, DISCIPLINES, EXPLORER_MODELS, MODEL_IDS, modelsOf } from "../src/web/lib/explorer-models";

/**
 * Les gardes de TRED (2026-11-16) : les règles du fondateur qui ne doivent pas
 * dépendre de la bonne volonté de quiconque. Elles tournent à chaque commit
 * (.githooks/pre-commit) et dans la CI ; un commit qui en casse une échoue.
 *
 *  1. Modèles 3D : des fichiers .glb optimisés, chacun avec sa licence écrite.
 *  2. Repères : une explication pré-écrite, complète dans les quatre langues.
 *  3. Universalité : aucune filière sans modèle.
 */
const MODELS_DIR = join(import.meta.dir, "../public/models");
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]));
const files = walk(MODELS_DIR).map((f) => relative(MODELS_DIR, f).replaceAll("\\", "/"));

function glbJson(path: string) {
  const b = readFileSync(path);
  if (b.toString("latin1", 0, 4) !== "glTF") throw new Error(`${path} n'est pas un fichier glTF binaire`);
  return JSON.parse(b.toString("utf8", 20, 20 + b.readUInt32LE(12))) as { extensionsUsed?: string[]; extensionsRequired?: string[] };
}

describe("garde 1 — modèles 3D : .glb optimisés, licence écrite", () => {
  const models = files.filter((f) => !f.endsWith(".md"));

  test("dans public/models/, rien d'autre que des .glb et leurs fiches (.md)", () => {
    expect(models.filter((f) => !f.endsWith(".glb"))).toEqual([]);
    expect(models.length).toBeGreaterThanOrEqual(2);
  });

  test("chaque .glb : moins de 5 Mo, compression meshopt, pas de Draco (décodeur chargé chez un tiers)", () => {
    for (const f of models) {
      const path = join(MODELS_DIR, f);
      expect({ f, tooBig: statSync(path).size >= 5_000_000 }).toEqual({ f, tooBig: false });
      const j = glbJson(path);
      expect({ f, meshopt: (j.extensionsUsed ?? []).includes("EXT_meshopt_compression") }).toEqual({ f, meshopt: true });
      expect({ f, draco: (j.extensionsUsed ?? []).includes("KHR_draco_mesh_compression") }).toEqual({ f, draco: false });
    }
  });

  test("chaque .glb est cité dans public/models/CREDITS.md, avec une licence qui permet l'usage commercial", () => {
    const credits = readFileSync(join(MODELS_DIR, "CREDITS.md"), "utf8");
    for (const f of models) {
      const at = credits.indexOf(`## ${f}`);
      expect({ f, listed: at >= 0 }).toEqual({ f, listed: true });
      const entry = credits.slice(at, credits.indexOf("\n## ", at + 1) === -1 ? undefined : credits.indexOf("\n## ", at + 1));
      expect({ f, licence: /CC0|CC BY 4\.0|CC Attribution 4\.0/.test(entry) }).toEqual({ f, licence: true });
      expect({ f, forbidden: /\bNC\b|NonCommercial|non.commercial/i.test(entry) }).toEqual({ f, forbidden: false });
    }
  });

  test("le code ne charge que des modèles de NOTRE dossier : aucune adresse externe dans les scènes", () => {
    for (const src of ["Explorer3D.tsx", "explorer-scenes.tsx", "explorer-kit.tsx"]) expect(readFileSync(join(import.meta.dir, "../src/web/components", src), "utf8")).not.toMatch(/https?:\/\//);
  });
});

describe("garde 2 — repères : explication pré-écrite, dans les quatre langues", () => {
  test("titre, explication, fait à retenir et question : aucun champ vide, aucune langue manquante", () => {
    for (const id of MODEL_IDS) {
      for (const h of EXPLORER_MODELS[id].hotspots) {
        for (const l of CONTENT_LOCALES) {
          expect({ where: `${id}/${h.id}/${l}`, title: h.title[l].trim().length >= 2 }).toEqual({ where: `${id}/${h.id}/${l}`, title: true });
          expect({ where: `${id}/${h.id}/${l}`, text: h.text[l].trim().length >= 40 }).toEqual({ where: `${id}/${h.id}/${l}`, text: true });
          expect({ where: `${id}/${h.id}/${l}`, fact: h.fact[l].trim().length >= 10 }).toEqual({ where: `${id}/${h.id}/${l}`, fact: true });
          expect({ where: `${id}/${h.id}/${l}`, quiz: h.quiz[l].trim().endsWith("?") }).toEqual({ where: `${id}/${h.id}/${l}`, quiz: true });
        }
      }
    }
  });

  test("un modèle repris d'un tiers affiche sa provenance (champ credit, quatre langues)", () => {
    for (const id of ["heart", "turbofan"] as const) for (const l of CONTENT_LOCALES) expect((EXPLORER_MODELS[id].credit?.[l] ?? "").length).toBeGreaterThan(20);
  });
});

describe("garde 3 — universalité : aucune filière sans contenu", () => {
  test("chaque filière a au moins un modèle avec des repères", () => {
    for (const d of DISCIPLINES) {
      const models = modelsOf(d.id);
      expect({ discipline: d.id, hasModel: models.length >= 1 && models.every((m) => m.hotspots.length >= 3) }).toEqual({ discipline: d.id, hasModel: true });
    }
  });

  test("le Fall-Check (jeu tiré des documents) existe pour toutes les filières", () => {
    expect(existsSync(join(import.meta.dir, "../src/web/pages/fall-check.tsx"))).toBe(true);
  });
});
