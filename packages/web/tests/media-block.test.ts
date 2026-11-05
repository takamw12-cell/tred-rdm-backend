import { describe, expect, test } from "bun:test";
import { mediaBlockFromPart, parseMediaBlock, MEDIA_LANG } from "../src/web/lib/media-block";
import { buildTutorAgent } from "../src/api/agent/index";

const URL_OK = "/api/media/generated/user_123/0f8fad5b-d9cb-469f-a165-70867728950e.webp";

describe("bloc média généré (generiere_bild_oder_video)", () => {
  test("pendant la génération → bloc pending (spinner)", () => {
    const b = mediaBlockFromPart({
      type: "tool-generiere_bild_oder_video",
      state: "input-available",
      input: { type: "video" },
    });
    expect(b).toContain("```" + MEDIA_LANG);
    expect(parseMediaBlock(b!.split("\n")[3]!)).toEqual({ pending: true, type: "video" });
  });

  test("terminé → l'URL du serveur", () => {
    const b = mediaBlockFromPart({
      type: "tool-generiere_bild_oder_video",
      state: "output-available",
      output: { ok: true, type: "image", url: URL_OK },
    });
    expect(b).toContain(URL_OK);
  });

  test("échec ou autre outil → rien", () => {
    expect(
      mediaBlockFromPart({
        type: "tool-generiere_bild_oder_video",
        state: "output-available",
        output: { ok: false, fehler: "daily_limit_reached" },
      }),
    ).toBeNull();
    expect(mediaBlockFromPart({ type: "tool-rechnen", state: "output-available" })).toBeNull();
  });

  test("une URL externe ou une traversée de chemin est refusée", () => {
    for (const url of [
      "https://evil.example/x.webp",
      "/api/media/generated/u/../../secret.webp",
      "javascript:alert(1)",
    ]) {
      expect(parseMediaBlock(JSON.stringify({ type: "image", url }))).toBeNull();
      expect(
        mediaBlockFromPart({
          type: "tool-generiere_bild_oder_video",
          state: "output-available",
          output: { ok: true, type: "image", url },
        }),
      ).toBeNull();
    }
  });
});

describe("prompt NIVEAU 9e", () => {
  const prompt = (media: boolean) =>
    JSON.stringify(
      buildTutorAgent({
        sources: [],
        locale: "de",
        media: media ? async () => ({ ok: false }) : undefined,
      }),
    );

  test("sans Replicate : ni règle ni promesse", () => {
    expect(prompt(false)).not.toContain("NIVEAU 9e");
  });

  test("avec Replicate : la règle est là, et les schémas restent en SVG", () => {
    const p = prompt(true);
    expect(p).toContain("NIVEAU 9e");
    expect(p).toContain("generiere_bild_oder_video");
    expect(p).toContain("weiterhin SVG");
  });
});
