import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IMPORT_JOB_ID_RE, RETRY, importErrorCode, newImportJobId, publicStatus, queueConfigured } from "../src/api/lib/queue";
import { shownProgress } from "../src/web/lib/import-job";

/**
 * Import asynchrone (2026-11-14) : la route dépose un travail et répond tout
 * de suite ; le worker traite ; le navigateur suit GET /api/jobs/:jobId.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");

describe("file d'import : inerte sans Redis", () => {
  const keys = ["REDIS_URL", "S3_BUCKET", "S3_ACCESS_KEY_ID"] as const;
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const set = (v: Partial<Record<(typeof keys)[number], string>>) => {
    for (const k of keys) {
      if (v[k] === undefined) delete process.env[k];
      else process.env[k] = v[k];
    }
  };

  test("il faut REDIS_URL ET le stockage objet", () => {
    try {
      set({});
      expect(queueConfigured()).toBe(false);
      set({ REDIS_URL: "redis://localhost:6379" });
      expect(queueConfigured()).toBe(false);
      set({ S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k" });
      expect(queueConfigured()).toBe(false);
      set({ REDIS_URL: "redis://localhost:6379", S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k" });
      expect(queueConfigured()).toBe(true);
    } finally {
      set(saved as Record<string, string>);
    }
  });

  test("la route garde l'extraction dans la requête comme repli", () => {
    const api = read("src/api/index.ts");
    const upload = api.slice(api.indexOf('app.post("/api/documents/upload"'));
    expect(upload).toContain("if (queueReady())");
    expect(upload).toContain("return c.json({ jobId, status: \"pending\" }, 202)");
    expect(upload.indexOf("if (queueReady())")).toBeLessThan(upload.indexOf("extractInBackground(bytes, file.name)"));
  });
});

describe("état public d'un travail", () => {
  test.each([
    ["waiting", 0, "pending"],
    ["prioritized", 0, "pending"],
    ["delayed", 0, "pending"],
    ["active", 0, "processing"],
    ["delayed", 1, "processing"], // une reprise attend son tour : le travail a commencé
    ["completed", 1, "done"],
    ["failed", 3, "failed"],
    ["unknown", 0, "pending"],
  ] as const)("%s (essais : %d) → %s", (state, attempts, expected) => {
    expect(publicStatus(state, attempts)).toBe(expected);
  });

  test("un échec devient un code connu du navigateur, jamais un message brut", () => {
    expect(importErrorCode("no_text")).toBe("no_text");
    expect(importErrorCode("scan_unreadable")).toBe("scan_unreadable");
    expect(importErrorCode("connect ECONNREFUSED 10.0.0.1:443")).toBe("extraction_failed");
    expect(importErrorCode(undefined)).toBe("extraction_failed");
  });

  test("identifiant imprévisible, accepté par la route", () => {
    const a = newImportJobId();
    expect(a).toMatch(IMPORT_JOB_ID_RE);
    expect(a).not.toContain(":");
    expect(newImportJobId()).not.toBe(a);
    expect("imp_../../x").not.toMatch(IMPORT_JOB_ID_RE);
  });

  test("2 reprises, attente exponentielle", () => {
    expect(RETRY).toEqual({ attempts: 3, backoff: { type: "exponential", delay: 5_000 } });
  });
});

describe("barre de progression", () => {
  test("jamais vide, jamais en arrière, pleine à la fin", () => {
    expect(shownProgress("pending", 0)).toBe(8);
    expect(shownProgress("processing", 0)).toBe(20);
    expect(shownProgress("processing", 80)).toBe(80);
    expect(shownProgress("processing", 15, 80)).toBe(80); // une reprise repart de 15 : la barre ne recule pas
    expect(shownProgress("done", 0)).toBe(100);
    expect(shownProgress("processing", 250)).toBe(100);
  });
});

describe("worker", () => {
  test("n'importe pas le service web (rappels du soir, battement de rétention)", () => {
    const worker = read("src/worker.ts");
    expect(worker).not.toMatch(/from "\.\/api"|from "\.\/api\/index"|__server/);
  });

  test("le service worker de Railway démarre le bon point d'entrée", () => {
    const cfg = JSON.parse(read("../../railway.worker.json")) as { deploy: { startCommand: string } };
    expect(cfg.deploy.startCommand).toBe("bun packages/web/src/worker.ts");
  });
});
