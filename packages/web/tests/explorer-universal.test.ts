import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_LOCALES, customModel, DISCIPLINES, EXPLORER_MODELS, explorerModelFor, glbUrl, hotspotOf, MODEL_IDS, modelsOf } from "../src/web/lib/explorer-models";
import { ATOM_SHELLS, NORM_LEVELS, surfaceHeight, surfacePoint } from "../src/web/lib/explorer-more";

/**
 * L'Explorateur universel (2026-11-15) : cinq filières, sept modèles, un
 * chargeur de fichiers .glb, et le bouton « In 3D ansehen » du Hörsaal.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");

describe("cinq filières, chacune avec au moins un modèle", () => {
  test("ingénierie, médecine, mathématiques, physique, droit — dans cet ordre", () => {
    expect(DISCIPLINES.map((d) => d.id)).toEqual(["engineering", "medicine", "mathematics", "physics", "law"]);
    expect(DISCIPLINES.map((d) => d.name.fr)).toEqual(["Ingénierie", "Médecine", "Mathématiques", "Physique", "Droit"]);
    for (const d of DISCIPLINES) for (const l of CONTENT_LOCALES) expect(d.name[l].length).toBeGreaterThan(2);
  });

  test("quel modèle dans quelle filière", () => {
    const ids = (d: Parameters<typeof modelsOf>[0]) => modelsOf(d).map((m) => m.id);
    expect(ids("engineering")).toEqual(["turbofan", "gearbox"]);
    expect(ids("medicine")).toEqual(["cell", "heart"]);
    expect(ids("mathematics")).toEqual(["surface"]);
    expect(ids("physics")).toEqual(["atom"]);
    expect(ids("law")).toEqual(["norms"]);
    expect(MODEL_IDS).toHaveLength(7);
  });

  test("tous les modèles tiennent les mêmes règles : repères dans la boîte, textes dans les quatre langues, questions qui finissent par « ? »", () => {
    for (const id of MODEL_IDS) {
      const m = EXPLORER_MODELS[id];
      expect(m.hotspots.length).toBeGreaterThanOrEqual(4);
      for (const h of m.hotspots) {
        h.position.forEach((v, axis) => {
          expect(v).toBeGreaterThanOrEqual(m.bounds.min[axis]);
          expect(v).toBeLessThanOrEqual(m.bounds.max[axis]);
        });
        for (const l of CONTENT_LOCALES) {
          expect(h.text[l].length).toBeGreaterThan(60);
          expect(h.text[l].length).toBeLessThan(330);
          expect(h.fact[l].length).toBeGreaterThan(10);
          expect(h.quiz[l].trim().endsWith("?")).toBe(true);
        }
        expect(new Set(CONTENT_LOCALES.map((l) => h.text[l])).size).toBe(4);
      }
    }
  });
});

describe("les contenus disent juste", () => {
  test("mathématiques : chaque repère est SUR la surface z = sin x + cos y, et porte la valeur annoncée", () => {
    const s = EXPLORER_MODELS.surface;
    const at = (id: string) => hotspotOf(s, id)!;
    expect(surfaceHeight(Math.PI / 2, 0)).toBeCloseTo(2, 10);
    expect(surfaceHeight(-Math.PI / 2, Math.PI)).toBeCloseTo(-2, 10);
    expect(surfaceHeight(Math.PI / 2, Math.PI)).toBeCloseTo(0, 10);
    expect(at("maximum").position).toEqual(surfacePoint(Math.PI / 2, 0));
    expect(at("maximum").fact.de).toContain("z = 2");
    expect(at("minimum").fact.de).toContain("z = −2");
    expect(at("saddle").fact.de).toContain("det H = −1");
  });

  test("mathématiques : au col le gradient est nul et la hessienne a deux signes ; au versant le gradient vaut (1, −1)", () => {
    const grad = (x: number, y: number) => [Math.cos(x), -Math.sin(y)];
    const [gx, gy] = grad(Math.PI / 2, Math.PI);
    expect(Math.abs(gx)).toBeLessThan(1e-12);
    expect(Math.abs(gy)).toBeLessThan(1e-12);
    // H = diag(−sin x, −cos y) en (π/2, π) = diag(−1, 1) : déterminant −1.
    expect(-Math.sin(Math.PI / 2) * -Math.cos(Math.PI)).toBeCloseTo(-1, 10);
    expect(grad(0, Math.PI / 2)).toEqual([1, -1]);
  });

  test("physique : carbone, 2 + 4 électrons, au plus 2n² par couche", () => {
    expect(ATOM_SHELLS.k.electrons + ATOM_SHELLS.l.electrons).toBe(6);
    expect(ATOM_SHELLS.k.electrons).toBeLessThanOrEqual(2 * 1 * 1);
    expect(ATOM_SHELLS.l.electrons).toBeLessThanOrEqual(2 * 2 * 2);
    expect(hotspotOf(EXPLORER_MODELS.atom, "valence")!.fact.de).toContain("1s² 2s² 2p²");
    // Bohr : E₂ − E₁ = 13,6 eV · (1 − 1/4) = 10,2 eV.
    expect(13.6 * (1 - 1 / 4)).toBeCloseTo(10.2, 10);
  });

  test("médecine : débit cardiaque 70 /min × 70 ml ≈ 5 l/min ; le cœur a ses quatre cavités et l'aorte", () => {
    expect((70 * 70) / 1000).toBeCloseTo(4.9, 10);
    expect(EXPLORER_MODELS.heart.hotspots.map((h) => h.id)).toEqual(["right-atrium", "right-ventricle", "left-atrium", "left-ventricle", "aorta"]);
  });

  test("droit : quatre étages, du Grundgesetz à la Satzung, de plus en plus larges vers le bas", () => {
    expect(NORM_LEVELS.map((l) => l.id)).toEqual(["constitution", "statute", "ordinance", "bylaw"]);
    for (let i = 1; i < NORM_LEVELS.length; i++) {
      expect(NORM_LEVELS[i].y).toBeLessThan(NORM_LEVELS[i - 1].y);
      expect(NORM_LEVELS[i].half).toBeGreaterThan(NORM_LEVELS[i - 1].half);
    }
    const n = EXPLORER_MODELS.norms;
    expect(hotspotOf(n, "statute")!.fact.de).toContain("Art. 31 GG");
    expect(hotspotOf(n, "ordinance")!.fact.de).toContain("Art. 80 Abs. 1 GG");
  });
});

describe("« In 3D ansehen » : la question annonce-t-elle un modèle ?", () => {
  test("le cœur, dans les quatre langues", () => {
    for (const q of ["Erkläre mir das Herz", "Explain the heart to me", "Explique-moi le cœur", "Explícame el corazón", "Wie arbeitet die linke Herzkammer?"]) expect(explorerModelFor(q)).toBe("heart");
  });

  test("chaque modèle a sa question", () => {
    expect(explorerModelFor("Wie funktioniert ein Turbofan-Triebwerk?")).toBe("turbofan");
    expect(explorerModelFor("Was ist das Übersetzungsverhältnis bei einem Zahnrad?")).toBe("gearbox");
    expect(explorerModelFor("Was macht ein Mitochondrium in der Zelle?")).toBe("cell");
    expect(explorerModelFor("Was ist ein Sattelpunkt?")).toBe("surface");
    expect(explorerModelFor("Wie ist ein Atom aufgebaut?")).toBe("atom");
    expect(explorerModelFor("Erkläre die Normenhierarchie")).toBe("norms");
  });

  test("pas de bouton pour une question sans rapport — ni pour un faux ami", () => {
    for (const q of ["", "Was besagt die Knotenregel?", "Wie berechne ich die Biegelinie?", "Wie funktioniert eine Solarzelle?", "Herzlichen Dank!", "Was ist eine Brennstoffzelle?"]) expect(explorerModelFor(q)).toBeNull();
  });

  test("branchement : le Hörsaal lit la QUESTION de la page et mène à /explorer?model=…", () => {
    const CHAT = read("../src/web/pages/chat.tsx");
    expect(CHAT).toContain('explorerModel={explorerModelFor(activePage.question ?? "")}');
    expect(CHAT).toContain("to={`/explorer?model=${explorerModel}`}");
    expect(CHAT).toContain('data-testid="view-3d"');
    for (const lang of ["ar", "bn", "de", "en", "es", "fr", "hi", "it", "ja", "pt", "ru", "zh"]) expect(read(`../src/web/i18n/messages/${lang}.ts`)).toMatch(/\n {4}view3d: ".+",\n/);
  });
});

describe("le chargeur de fichiers .glb", () => {
  test("un nom simple → un fichier de public/models/", () => {
    expect(glbUrl("herz-anatomie")).toBe("/models/herz-anatomie.glb");
    expect(glbUrl("zelle2")).toBe("/models/zelle2.glb");
  });

  test("un dossier de filière est permis, et lui seul", () => {
    expect(glbUrl("engineering/pumpe")).toBe("/models/engineering/pumpe.glb");
    expect(glbUrl("medicine/heart")).toBe("/models/medicine/heart.glb");
    for (const bad of ["secret/pumpe", "engineering/../x", "engineering/a/b", "engineering/"]) expect(glbUrl(bad)).toBeNull();
  });

  test("tout le reste est refusé : autre dossier, autre site, majuscules, vide", () => {
    for (const bad of ["../secret", "a/b", "https://evil.example/x", "//evil.example/x", "Herz", "x.glb", "", null, undefined, "a".repeat(80)]) expect(glbUrl(bad as string)).toBeNull();
  });

  test("un modèle déposé n'a pas de repères, mais un cadre et un texte dans les quatre langues", () => {
    const m = customModel("herz-anatomie");
    expect(m.id).toBe("custom");
    expect(m.hotspots).toEqual([]);
    for (const l of CONTENT_LOCALES) expect(m.intro[l].length).toBeGreaterThan(20);
  });

  test("branchement : prop modelUrl, useGLTF sans décodeur tiers, dossier documenté", () => {
    const SCENE = read("../src/web/components/Explorer3D.tsx");
    const SCENES = read("../src/web/components/explorer-scenes.tsx");
    expect(SCENE).toContain("modelUrl?: string | null;");
    expect(SCENE).toContain("<GltfModel url={modelUrl} />");
    expect(SCENES).toContain("useGLTF(url, false)");
    expect(SCENE + SCENES).not.toMatch(/https?:\/\//);
    expect(read("../public/models/README.md")).toContain("/explorer?glb=");
    expect(read("../src/web/pages/explorer.tsx")).toContain('glbUrl(customName)');
  });
});

describe("le sélecteur de filière", () => {
  test("des onglets, un par filière ; en changer ouvre le premier modèle de la filière", () => {
    const PAGE = read("../src/web/pages/explorer.tsx");
    expect(PAGE).toContain('role="tablist"');
    expect(PAGE).toContain("data-testid={`discipline-${d.id}`}");
    expect(PAGE).toContain("const first = modelsOf(next)[0];");
    expect(PAGE).toContain("modelsOf(discipline)");
  });
});

describe("les formules se composent", () => {
  test("aucune matrice ni double barre oblique : le rendu Markdown les abîme avant KaTeX", () => {
    for (const id of MODEL_IDS) for (const h of EXPLORER_MODELS[id].hotspots) for (const s of h.steps ?? []) expect(s.tex).not.toMatch(/\\\\\\\\|begin\{/);
  });
});
