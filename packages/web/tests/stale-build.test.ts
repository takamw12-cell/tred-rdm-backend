import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isStaleBuildError, reloadForNewBuild } from "../src/web/lib/stale-build";

describe("Ancienne version après un déploiement", () => {
  test("reconnaît les erreurs de fichier disparu (Chrome, Safari, Firefox)", () => {
    expect(isStaleBuildError(new TypeError("'text/html' is not a valid JavaScript MIME type."))).toBe(true); // l'erreur du 7 nov.
    expect(isStaleBuildError(new TypeError("Failed to fetch dynamically imported module: https://www.tred-tutor.de/assets/chat-BkBOnR7-.js"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleBuildError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isStaleBuildError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
  });

  test("recharge une fois, puis n'insiste pas pendant une minute", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    let reloads = 0;
    const reload = () => void reloads++;
    expect(reloadForNewBuild(storage, reload, 1_000_000)).toBe(true);
    expect(reloadForNewBuild(storage, reload, 1_030_000)).toBe(false);
    expect(reloadForNewBuild(storage, reload, 1_070_000)).toBe(true);
    expect(reloads).toBe(2);
  });

  test("câblé dans la barrière d'erreur et sur vite:preloadError", () => {
    const eb = readFileSync(join(import.meta.dir, "../src/web/components/error-boundary.tsx"), "utf8");
    expect(eb).toContain('window.addEventListener("vite:preloadError"');
    expect(eb).toContain("if (isStaleBuildError(error) && reloadForNewBuild()) return;");
  });
});
