import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HEARTBEAT_EVERY_MS, HEARTBEAT_TTL_S, IMPORT_JOB_ID_RE, RETRY, heartbeatFresh, importErrorCode, newImportJobId, publicStatus, queueConfigured } from "../src/api/lib/queue";
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

  test("pose un battement, et le retire à l'arrêt", () => {
    const worker = read("src/worker.ts");
    expect(worker).toContain('beat.set(WORKER_HEARTBEAT_KEY, String(Date.now()), "EX", HEARTBEAT_TTL_S)');
    expect(worker).toContain("setInterval(pulse, HEARTBEAT_EVERY_MS)");
    expect(worker).toContain("await beat.del(WORKER_HEARTBEAT_KEY)");
    // Le battement survit à trois pulsations manquées, pas plus.
    expect(HEARTBEAT_TTL_S * 1000).toBeGreaterThan(3 * HEARTBEAT_EVERY_MS);
  });
});

describe("pas de worker, pas de file", () => {
  test("le service web ne dépose un travail que si un worker a été vu récemment", () => {
    const now = 1_000_000;
    expect(heartbeatFresh(0, now)).toBe(false); // jamais vu
    expect(heartbeatFresh(now - 4_000, now)).toBe(true);
    expect(heartbeatFresh(now - 19_000, now)).toBe(true);
    expect(heartbeatFresh(now - 21_000, now)).toBe(false); // Redis muet depuis trop longtemps : on ne s'y fie plus
  });

  test("queueReady exige Redis prêt ET un worker", () => {
    const queue = read("src/api/lib/queue/index.ts");
    expect(queue).toContain('return queueConfigured() && producerConnection().status === "ready" && heartbeatFresh(workerSeenAt);');
    expect(queue).toContain("workerSeenAt = (await redis.exists(WORKER_HEARTBEAT_KEY)) === 1 ? Date.now() : 0;");
  });
});
