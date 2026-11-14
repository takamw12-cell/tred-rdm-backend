import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RETRY, VIDEO_JOB_ID_RE, VIDEO_QUEUE, videoJobView } from "../src/api/lib/queue";

/**
 * « Als Video erklären » dans la file (2026-11-14) : même schéma que l'import.
 * Le clic dépose un travail « generate-video » ; le worker le traite et le
 * reprend 2 fois ; le navigateur suit l'état.
 */
const read = (p: string) => readFileSync(join(import.meta.dir, "..", p), "utf8");
const PIPELINE = read("src/api/video/pipeline.ts");
const ROUTES = read("src/api/video/routes.ts");
const WORKER = read("src/worker.ts");

describe("file « generate-video »", () => {
  test("le clic dépose un travail, et retombe sur le service web sans Redis", () => {
    expect(VIDEO_QUEUE).toBe("generate-video");
    const generate = ROUTES.slice(ROUTES.indexOf('app.post("/api/video/generate"'), ROUTES.indexOf('app.get("/api/video"'));
    expect(generate).toContain('videoQueue().add("generate-video", job, { jobId: id })');
    expect(generate).toContain("if (!queued) runPipelineInline(job)");
    expect(generate).toContain('return c.json({ id, status: "pending" }, 202)');
  });

  test("2 reprises avec attente exponentielle (5 s, puis 10 s)", () => {
    expect(RETRY.attempts).toBe(3);
    expect(RETRY.backoff).toEqual({ type: "exponential", delay: 5_000 });
  });

  test("un refus n'est pas rejoué : ni script non prouvé, ni plafond de voix", () => {
    expect(PIPELINE).toContain('new Set(["script_failed", "voice_failed", "storage_failed"])');
    expect(WORKER).toContain("if (err instanceof PipelineError && !err.retryable) throw new UnrecoverableError(err.code)");
  });

  test("la vidéo ne devient « failed » qu'après la dernière reprise", () => {
    // Le pipeline ne marque rien lui-même : l'appelant sait s'il reste un essai.
    const run = PIPELINE.slice(PIPELINE.indexOf("export async function runPipeline"), PIPELINE.indexOf("export function runPipelineInline"));
    expect(run).not.toContain("failVideo(");
    expect(WORKER).toContain("if (job && final) void failVideo(job.data.id, videoErrorCode(err.message))");
  });

  test("une reprise ne repaie ni le script ni le plafond de caractères", () => {
    expect(PIPELINE).toContain("(await readDraft(id)) ?? (await writeScript(job))");
    expect(PIPELINE).toContain("if (!draft.charsReserved)");
  });

  test("le worker charge le pipeline sans le service web", () => {
    expect(PIPELINE).not.toMatch(/from "\.\.\/auth"|from "\.\/routes"|from "\.\.\/index"/);
  });
});

describe("état public d'une vidéo (GET /api/jobs/gv_…)", () => {
  test.each([
    ["pending", "pending", 5],
    ["script", "processing", 35],
    ["voice", "processing", 70],
    ["done", "done", 100],
    ["failed", "failed", 0],
  ] as const)("%s → %s (%d %%)", (row, status, progress) => {
    expect(videoJobView(row)).toEqual({ status, progress });
  });

  test("identifiant de vidéo reconnu, rien d'autre", () => {
    expect("gv_0123456789abcdef0123").toMatch(VIDEO_JOB_ID_RE);
    expect("gv_../x").not.toMatch(VIDEO_JOB_ID_RE);
  });
});

describe("codes d'échec", async () => {
  // Le module du pipeline ouvre la base : une base en mémoire suffit pour le charger.
  process.env.DATABASE_URL ??= "file::memory:";
  const { PipelineError, videoErrorCode } = await import("../src/api/video/pipeline");

  test("pannes passagères reprises, décisions définitives", () => {
    for (const code of ["script_failed", "voice_failed", "storage_failed"] as const) expect(new PipelineError(code).retryable).toBe(true);
    for (const code of ["not_grounded", "daily_limit", "timeout"] as const) expect(new PipelineError(code).retryable).toBe(false);
  });

  test("un message quelconque devient un code que le navigateur sait traduire", () => {
    expect(videoErrorCode("voice_failed")).toBe("voice_failed");
    expect(videoErrorCode("not_grounded")).toBe("not_grounded");
    expect(videoErrorCode("job stalled more than allowable limit")).toBe("timeout");
    expect(videoErrorCode("ECONNRESET")).toBe("script_failed");
    expect(videoErrorCode(undefined)).toBe("script_failed");
  });
});
