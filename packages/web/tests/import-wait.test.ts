import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Écran d'attente de l'import (2026-11-14) : film TRED en boucle + barre de progression. */
const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const OVERLAY = read("src/web/components/import-wait-overlay.tsx");
const LIBRARY = read("src/web/components/document-library.tsx");

describe("film d'attente", () => {
  test("léger : moins de 5 Mo, avec une image d'attente", () => {
    expect(statSync(join(ROOT, "public/videos/import-wait-v2.mp4")).size).toBeLessThan(5 * 1024 * 1024);
    expect(statSync(join(ROOT, "public/videos/import-wait-v2.webp")).size).toBeLessThan(100 * 1024);
    expect(OVERLAY).toContain('WAIT_VIDEO = "/videos/import-wait-v2.mp4"');
  });

  test("vertical, comme sur le téléphone (9:16), sans dépasser l'écran", () => {
    expect(OVERLAY).toContain('aspectRatio: "9 / 16"');
    expect(OVERLAY).toContain('height: "min(62dvh, 640px)"');
  });

  test("en boucle, muet, lisible sur iPhone sans plein écran", () => {
    for (const attr of ["loop", "muted", "playsInline"]) expect(OVERLAY).toMatch(new RegExp(`\\n\\s+${attr}\\n`));
    expect(OVERLAY).toContain("autoPlay={!reduced}"); // mouvement réduit : pas de lecture automatique
    expect(OVERLAY).toContain("<progress");
  });

  test("le serveur répond aux plages d'octets (Safari) et met le film en cache long", () => {
    const server = read("src/__server.ts");
    expect(server).toContain('headers.set("Accept-Ranges", "bytes")');
    expect(server).toContain("status: 206");
    expect("/videos/import-wait-v2.mp4").toMatch(/^\/videos\/[a-z0-9-]+-v\d+\.(mp4|webp)$/);
  });

  test("l'écran disparaît dès la fin de l'import, réussi ou non", () => {
    const tail = LIBRARY.slice(LIBRARY.indexOf("} finally {"));
    expect(tail.slice(0, 120)).toContain("setWait(null)");
    expect(LIBRARY).toContain("followImportJob(body.jobId, (p) => setWait({ ...p, title: cleanTitle }))");
  });
});
