import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAX_FRAME_BYTES, dataUrlBytes, visionFrameSchema } from "../src/api/lib/vision-copilot";

const tinyJpeg = "data:image/jpeg;base64," + Buffer.from("fake-jpeg-bytes").toString("base64");

describe("Co-pilote vision — fondations", () => {
  test("accepte une image data URL, refuse le reste", () => {
    expect(visionFrameSchema.safeParse({ image: tinyJpeg, mode: "screen" }).success).toBe(true);
    expect(visionFrameSchema.safeParse({ image: "https://evil.example/x.jpg", mode: "screen" }).success).toBe(false);
    expect(visionFrameSchema.safeParse({ image: "data:image/svg+xml;base64,PHN2Zz4=", mode: "screen" }).success).toBe(false);
    expect(visionFrameSchema.safeParse({ image: tinyJpeg, mode: "microphone" }).success).toBe(false);
  });

  test("taille réelle d'une data URL", () => {
    expect(dataUrlBytes(tinyJpeg)).toBe(Buffer.from("fake-jpeg-bytes").length);
    const big = "data:image/png;base64," + "A".repeat(Math.ceil((MAX_FRAME_BYTES * 4) / 3) + 400);
    expect(visionFrameSchema.safeParse({ image: big, mode: "camera" }).success).toBe(false);
  });

  test("route : session, clé, cadence, aucune écriture de l'image", () => {
    const route = readFileSync(join(import.meta.dir, "../src/api/vision/routes.ts"), "utf8");
    expect(route).toContain('{ error: "UNAUTHORIZED" }, 401');
    expect(route).toContain('{ error: "not_configured" }, 503');
    expect(route).toContain('"too_fast" }, 429');
    expect(route).not.toMatch(/PutObjectCommand|db\.insert|writeFile/);
    expect(readFileSync(join(import.meta.dir, "../src/api/index.ts"), "utf8")).toContain("registerVisionRoutes(app)");
  });
});
