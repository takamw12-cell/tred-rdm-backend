import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderSettings, tierOf } from "../src/web/lib/device-tier";
import { resilientImport } from "../src/web/lib/lazy-import";

const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("plantage /explorer du 15-16 nov. : module vide après un échec de chargement", () => {
  test("un module vide n'est plus lu (« reading 'default' ») : on attend le rechargement, puis une vraie erreur", async () => {
    const empty = resilientImport(async () => undefined as unknown as { default: () => null }, 20);
    await expect(empty()).rejects.toThrow("Failed to fetch dynamically imported module");
    const ok = resilientImport(async () => ({ default: () => null }), 20);
    expect(typeof (await ok()).default).toBe("function");
  });

  test("toutes les pages et composants chargés à la demande passent par safeLazy", () => {
    for (const f of ["src/web/app.tsx", "src/web/pages/explorer.tsx", "src/web/pages/minigame.tsx", "src/web/pages/chat.tsx", "src/web/components/code-block.tsx", "src/web/components/explainer-video.tsx", "src/web/components/model3d-block.tsx"]) {
      const src = read(f);
      expect(src).toContain("safeLazy(");
      expect(src).not.toMatch(/\blazy\(\s*\(\)\s*=>\s*import/);
    }
  });
});

describe("3D adaptée à l'appareil", () => {
  test("niveaux", () => {
    expect(tierOf({ webgl2: false, coarsePointer: true })).toBe("none");
    expect(tierOf({ webgl2: true, coarsePointer: false, memory: 16, cores: 12 })).toBe("high");
    expect(tierOf({ webgl2: true, coarsePointer: true, memory: 8, cores: 8 })).toBe("mobile");
    expect(tierOf({ webgl2: true, coarsePointer: true, memory: 2, cores: 8 })).toBe("low");
    expect(tierOf({ webgl2: true, coarsePointer: true, cores: 4 })).toBe("low");
    expect(tierOf({ webgl2: true, coarsePointer: false, saveData: true })).toBe("low");
    // Safari ne donne ni mémoire ni (toujours) les cœurs : un iPhone récent reste « mobile ».
    expect(tierOf({ webgl2: true, coarsePointer: true, cores: 6 })).toBe("mobile");
  });

  test("téléphone : pas de post-traitement, ombre réduite, définition plafonnée", () => {
    expect(renderSettings("high")).toMatchObject({ effects: true, contactShadowResolution: 512, dpr: [1, 2] });
    expect(renderSettings("mobile")).toMatchObject({ effects: false, contactShadowResolution: 256, dpr: [1, 1.5], powerPreference: "default" });
    expect(renderSettings("low")).toMatchObject({ effects: false, contactShadowResolution: 0, environment: false, dpr: [1, 1] });
  });

  test("la scène plante seule : garde-fou de l'Explorateur, perte de contexte WebGL gérée", () => {
    const page = read("src/web/pages/explorer.tsx");
    expect(page).toContain("<ExplorerCrashBoundary");
    expect(page).toContain('message={t("explorer.crashed")}');
    const scene = read("src/web/components/Explorer3D.tsx");
    expect(scene).toContain('gl.domElement.addEventListener("webglcontextlost"');
    expect(scene).toContain("{settings.effects && <StudioEffects light={compact} />}");
    expect(read("src/web/i18n/messages/de.ts")).toContain('crashed: "3D-Modell konnte nicht geladen werden. Bitte lade die Seite neu."');
  });
});
