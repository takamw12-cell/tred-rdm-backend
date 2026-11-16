import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Le rendu « studio » de l'Explorateur (2026-11-16) : effets, matières, coupe, cube de vues, zoom. */
const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8");
const FX = read("../src/web/components/explorer-effects.tsx");
const SCENE = read("../src/web/components/Explorer3D.tsx");
const KIT = read("../src/web/components/explorer-kit.tsx");
const PAGE = read("../src/web/pages/explorer.tsx");
const PKG = JSON.parse(read("../package.json")) as { dependencies: Record<string, string> };
const ROOT = JSON.parse(read("../../../package.json")) as { overrides: Record<string, string> };

describe("post-traitement", () => {
  test("occlusion ambiante (N8AO), bloom, puis courbe de tons ACES en dernier", () => {
    const order = ["<N8AO", "<Bloom", "<ToneMapping mode={ToneMappingMode.ACES_FILMIC}"].map((s) => FX.indexOf(s));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // La courbe de tons n'est appliquée qu'une fois : le canevas n'en met pas.
    expect(SCENE).toMatch(/\n\s+flat\n/);
  });

  test("téléphone : effets allégés ; passe en échec : la scène s'affiche sans effets", () => {
    expect(FX).toContain('quality={light ? "performance" : "medium"} halfRes={light}');
    expect(FX).toContain("return this.state.failed ? null : this.props.children;");
    expect(SCENE).toContain("<StudioEffects light={compact} />");
  });

  test("versions exactes, et n8ao figé sur une version de plus de 14 jours", () => {
    expect(PKG.dependencies["@react-three/postprocessing"]).toBe("3.2.2");
    expect(PKG.dependencies.postprocessing).toBe("6.39.6");
    expect(ROOT.overrides.n8ao).toBe("2.0.1");
  });
});

describe("matières", () => {
  test("tissu et métal : du GLSL greffé sur la matière physique, sans image ni adresse externe", () => {
    expect(FX).toContain("export function tissueShader");
    expect(FX).toContain("export function machinedMetalShader");
    expect(FX).not.toMatch(/https?:\/\/|useTexture|TextureLoader/);
    expect(KIT).toContain("onBeforeCompile={tissue ? tissueShader : undefined}");
  });
});

describe("outils de CAO", () => {
  test("mode coupe : un plan tranche les pièces, réglable, pour le cœur", () => {
    expect(SCENE).toContain("new THREE.Plane(new THREE.Vector3(0, 0, -1), section)");
    expect(SCENE).toContain("gl.localClippingEnabled = true;");
    expect(KIT).toContain("clippingPlanes={planes}");
    expect(PAGE).toContain('const canSection = !modelUrl && modelId === "heart";');
    expect(PAGE).toContain('data-testid="explorer-section-depth"');
  });

  test("cube de vues, et zoom de la caméra sur la pièce choisie", () => {
    expect(SCENE).toContain("<GizmoViewcube");
    expect(SCENE).toContain("zoomGoal.current = focus ? Math.max(3.4, start * ZOOM_ON_PART) : start;");
  });

  test("textes du mode coupe dans les quatre langues", () => {
    for (const l of ["de", "en", "fr", "es"]) expect(read(`../src/web/i18n/messages/${l}.ts`)).toMatch(/\n {4}section: ".+",\n {4}sectionDepth: ".+",/);
  });
});
