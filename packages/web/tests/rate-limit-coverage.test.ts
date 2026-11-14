import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Garde-fou (2026-11-14) : une route d'IMPORT ou de GÉNÉRATION VIDÉO sans
 * limite de débit fait échouer ce test.
 *
 * Ces routes sont celles qui coûtent : un import occupe le stockage et le
 * worker, une vidéo paie Claude et ElevenLabs. Chacune doit avoir :
 *   1. une limite de RAFALE, montée en middleware dans api/index.ts ;
 *   2. une limite par COMPTE (`userRateLimit`) dans la route — sauf les routes
 *      réservées à l'administrateur, listées ci-dessous.
 *
 * Le test lit le code : il n'a besoin ni de base ni de serveur, et une route
 * ajoutée demain dans n'importe quel fichier de src/api est vue.
 */
const API = join(import.meta.dir, "../src/api");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return name.endsWith(".ts") ? [p] : [];
  });
}

interface Route {
  method: string;
  path: string;
  /** Le code de la route, jusqu'à la déclaration suivante. */
  body: string;
  file: string;
}

/** Toutes les routes HTTP déclarées (`app.post("/api/…"`), avec leur code. */
export function findRoutes(source: string, file = ""): Route[] {
  const marks = [...source.matchAll(/\bapp\.(get|post|put|patch|delete|on|use)\(\s*(?:\[[^\]]*\],\s*)?["'`]([^"'`]+)["'`]/g)];
  return marks
    .map((m, i) => ({ method: m[1]!.toUpperCase(), path: m[2]!, body: source.slice(m.index, marks[i + 1]?.index ?? source.length), file }))
    .filter((r) => ["POST", "PUT", "PATCH"].includes(r.method));
}

/** Import de fichier, ou génération de vidéo. `/:id/` désigne une vidéo existante (sauvegarde), pas une génération. */
export function isCostly(path: string): boolean {
  // « upload-batch » : l'import de plusieurs fichiers en un envoi.
  if (/\/(upload|import)(-batch)?(\/|$)/.test(path)) return true;
  return /\/video(\/|$)/.test(path) && !path.includes("/:id");
}

/** Les chemins couverts par un `app.use("…", rateLimitMiddleware(` d'api/index.ts. */
export function burstLimited(indexSource: string): string[] {
  return [...indexSource.matchAll(/app\.use\(\s*["'`]([^"'`]+)["'`],\s*rateLimitMiddleware\(/g)].map((m) => m[1]!);
}

const covers = (pattern: string, path: string) => (pattern.endsWith("/*") ? path.startsWith(pattern.slice(0, -1)) : pattern === path);

/** Réservées à l'administrateur (requireAdmin) : pas de compteur par compte, la rafale suffit. */
const ADMIN_ONLY = new Set(["/api/storage/upload"]);

const files = sourceFiles(API);
const INDEX = readFileSync(join(API, "index.ts"), "utf8");
const routes = files.flatMap((f) => findRoutes(readFileSync(f, "utf8"), f.slice(API.length + 1)));
const costly = routes.filter((r) => isCostly(r.path));
const burst = burstLimited(INDEX);

describe("routes d'import et de génération vidéo : toutes limitées", () => {
  test("le test voit bien les routes concernées", () => {
    expect(costly.map((r) => r.path).sort()).toEqual(["/api/agent/video", "/api/documents/upload", "/api/documents/upload-batch", "/api/storage/upload", "/api/video/generate"]);
  });

  test.each(costly.map((r) => [r.path, r] as const))("%s : limite de rafale (middleware)", (path) => {
    expect(burst.some((p) => covers(p, path))).toBe(true);
  });

  test.each(costly.filter((r) => !ADMIN_ONLY.has(r.path)).map((r) => [r.path, r] as const))("%s : limite par compte (userRateLimit)", (_path, route) => {
    // Le lot compte UNE unité par fichier accepté (`userRateBump`) : celui qui dépasse est refusé seul.
    expect(route.body).toMatch(/await userRateLimit\(c, [^,]+, USER_LIMITS\.(import|video)\(\)\)|await userRateBump\([^,]+, USER_LIMITS\.import\(\)\)/);
  });

  test("une route d'administration exemptée est bien gardée par requireAdmin", () => {
    for (const r of costly.filter((x) => ADMIN_ONLY.has(x.path))) expect(r.body).toContain("requireAdmin(c)");
  });
});

describe("le détecteur lui-même", () => {
  test("une route d'import sans limite est repérée", () => {
    const src = `app.post("/api/notes/import", async (c) => c.json({}));\napp.post("/api/video/render", async (c) => c.json({}));\napp.post("/api/video/:id/save", async (c) => c.json({}));`;
    const found = findRoutes(src).filter((r) => isCostly(r.path));
    expect(found.map((r) => r.path)).toEqual(["/api/notes/import", "/api/video/render"]);
    expect(burstLimited(src)).toEqual([]);
    expect(found.every((r) => !/userRateLimit\(/.test(r.body))).toBe(true);
  });

  test("un joker couvre ses sous-chemins, pas ses voisins", () => {
    expect(covers("/api/agent/*", "/api/agent/video")).toBe(true);
    expect(covers("/api/agent/*", "/api/agents")).toBe(false);
    expect(covers("/api/video/generate", "/api/video/generate")).toBe(true);
  });
});

describe("valeurs des limites par compte", async () => {
  process.env.DATABASE_URL ??= "file::memory:";
  const { DAY_MS, HOUR_MS, USER_LIMITS } = await import("../src/api/middleware/rate-limit");

  test("10 imports par heure, 5 vidéos par jour", () => {
    const saved = { i: process.env.IMPORT_RATE_PER_HOUR, v: process.env.VIDEO_RATE_PER_DAY };
    delete process.env.IMPORT_RATE_PER_HOUR;
    delete process.env.VIDEO_RATE_PER_DAY;
    try {
      expect(USER_LIMITS.import()).toEqual({ scope: "user-import", limit: 10, windowMs: HOUR_MS });
      expect(USER_LIMITS.video()).toEqual({ scope: "user-video", limit: 5, windowMs: DAY_MS });
      process.env.IMPORT_RATE_PER_HOUR = "25";
      expect(USER_LIMITS.import().limit).toBe(25);
      process.env.IMPORT_RATE_PER_HOUR = "abc"; // valeur illisible : on garde la limite par défaut
      expect(USER_LIMITS.import().limit).toBe(10);
    } finally {
      if (saved.i === undefined) delete process.env.IMPORT_RATE_PER_HOUR;
      else process.env.IMPORT_RATE_PER_HOUR = saved.i;
      if (saved.v !== undefined) process.env.VIDEO_RATE_PER_DAY = saved.v;
    }
  });

  test("le ménage ne supprime pas le compteur du jour en cours", () => {
    const src = readFileSync(join(API, "middleware/rate-limit.ts"), "utf8");
    expect(src).toContain("const SWEEP_AFTER_MS = 25 * 60 * 60 * 1000");
    expect(src).toContain("sweep(now - SWEEP_AFTER_MS)");
  });
});
