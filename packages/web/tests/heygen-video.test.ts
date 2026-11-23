import { describe, expect, test } from "bun:test";
import { avatarVideoBody, createAvatarVideo, getAvatarVideo, HeygenError, heygenVideoConfigured, listAvatarLooks, renderAvatarVideo, uploadAudioAsset, waitForAvatarVideo } from "../src/api/lib/heygen-video";
import { compositeArgs, compositeFilter } from "../src/api/lib/avatar-composite";

type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };

/** Un faux HeyGen : il note les appels et répond ce qu'on lui donne, dans l'ordre. */
function fake(replies: Array<{ status?: number; json?: unknown; bytes?: Uint8Array }>) {
  const calls: Call[] = [];
  const fetchFake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const reply = replies[Math.min(calls.length, replies.length - 1)]!;
    calls.push({ url: String(input), method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), body: init?.body });
    return reply.bytes ? new Response(reply.bytes as BodyInit, { status: reply.status ?? 200 }) : new Response(JSON.stringify(reply.json ?? {}), { status: reply.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { calls, opts: { apiKey: "clé-de-test", fetch: fetchFake } };
}

describe("HeyGen vidéo (API v3)", () => {
  test("configuré seulement avec SES variables, pas celles de LiveAvatar", () => {
    expect(heygenVideoConfigured({ HEYGEN_VIDEO_API_KEY: "k", HEYGEN_VIDEO_AVATAR_ID: "a" })).toBe(true);
    expect(heygenVideoConfigured({ HEYGEN_API_KEY: "k", HEYGEN_AVATAR_ID: "a" })).toBe(false);
    expect(heygenVideoConfigured({ HEYGEN_VIDEO_API_KEY: " ", HEYGEN_VIDEO_AVATAR_ID: "a" })).toBe(false);
  });

  test("le corps de la requête : fond vert OU WebM transparent, jamais les deux, aucun champ v2", () => {
    const green = avatarVideoBody({ avatarId: "look_1", audioAssetId: "as_1", output: "green" });
    expect(green).toEqual({ type: "avatar", avatar_id: "look_1", audio_asset_id: "as_1", aspect_ratio: "1:1", resolution: "720p", background: { type: "color", value: "#00FF00" } });
    const alpha = avatarVideoBody({ avatarId: "look_1", audioAssetId: "as_1", output: "alpha", aspectRatio: "9:16", resolution: "1080p", title: "Test" });
    expect(alpha.output_format).toBe("webm");
    expect("background" in alpha).toBe(false);
    for (const body of [green, alpha]) for (const old of ["video_inputs", "avatar_style", "scale", "offset", "script", "voice_id"]) expect(old in body).toBe(false);
  });

  test("l'audio part en multipart, la clé dans l'en-tête, et l'identifiant revient", async () => {
    const { calls, opts } = fake([{ json: { data: { asset_id: "as_42", url: "https://x/y.mp3" } } }]);
    expect(await uploadAudioAsset(opts, new Uint8Array([1, 2, 3]))).toBe("as_42");
    expect(calls[0]!.url).toBe("https://api.heygen.com/v3/assets");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.headers["x-api-key"]).toBe("clé-de-test");
    expect(calls[0]!.body).toBeInstanceOf(FormData);
    expect(((calls[0]!.body as FormData).get("file") as File).size).toBe(3);
    await expect(uploadAudioAsset(opts, new Uint8Array())).rejects.toThrow("audio vide");
  });

  test("création : l'identifiant, et un refus net si le WebM transparent n'est pas retenu", async () => {
    const ok = fake([{ json: { data: { video_id: "v_1", status: "waiting", output_format: "mp4" } } }]);
    expect(await createAvatarVideo(ok.opts, { avatarId: "a", audioAssetId: "s", output: "green" })).toEqual({ videoId: "v_1", outputFormat: "mp4" });
    expect(JSON.parse(String(ok.calls[0]!.body)).background.value).toBe("#00FF00");
    const noAlpha = fake([{ json: { data: { video_id: "v_2", output_format: "mp4" } } }]);
    await expect(createAvatarVideo(noAlpha.opts, { avatarId: "a", audioAssetId: "s", output: "alpha" })).rejects.toThrow("WebM transparent");
  });

  test("une erreur de HeyGen garde le statut et le code, jamais la clé", async () => {
    const { opts } = fake([{ status: 401, json: { error: { code: "invalid_api_key", message: "Invalid API key" } } }]);
    const err = (await getAvatarVideo(opts, "v").catch((e) => e)) as HeygenError;
    expect(err).toBeInstanceOf(HeygenError);
    expect(err.status).toBe(401);
    expect(err.code).toBe("invalid_api_key");
    expect(err.message).not.toContain("clé-de-test");
  });

  test("l'attente : « waiting » et « processing » patientent, « completed » rend l'URL, « failed » lève", async () => {
    const done = fake([{ json: { data: { id: "v", status: "waiting" } } }, { json: { data: { id: "v", status: "processing" } } }, { json: { data: { id: "v", status: "completed", video_url: "https://files/v.mp4", duration: 13.8 } } }]);
    const naps: number[] = [];
    const state = await waitForAvatarVideo(done.opts, "v", { everyMs: 5000, sleep: async (ms) => void naps.push(ms) });
    expect(state.videoUrl).toBe("https://files/v.mp4");
    expect(state.durationS).toBe(13.8);
    expect(naps).toEqual([5000, 5000]);
    const failed = fake([{ json: { data: { status: "failed", failure_code: "x", failure_message: "avatar not found" } } }]);
    await expect(waitForAvatarVideo(failed.opts, "v", { sleep: async () => {} })).rejects.toThrow("avatar not found");
    const never = fake([{ json: { data: { status: "processing" } } }]);
    await expect(waitForAvatarVideo(never.opts, "v", { everyMs: 1000, maxMs: 3000, sleep: async () => {} })).rejects.toThrow("pas de vidéo");
  });

  test("les looks du compte, quelle que soit l'enveloppe de la liste", async () => {
    const { opts } = fake([{ json: { data: { looks: [{ id: "look_1", name: "Anna", supported_api_engines: ["avatar_iv"] }, { name: "sans id" }] } } }]);
    expect(await listAvatarLooks(opts)).toEqual([{ id: "look_1", name: "Anna", engines: ["avatar_iv"] }]);
  });

  test("la chaîne entière : audio → vidéo → attente → téléchargement sans la clé", async () => {
    const { calls, opts } = fake([{ json: { data: { asset_id: "as_1" } } }, { json: { data: { video_id: "v_9", output_format: "mp4" } } }, { json: { data: { status: "completed", video_url: "https://files.heygen.test/v_9.mp4", duration: 14 } } }, { bytes: new Uint8Array([9, 9, 9, 9]) }]);
    const out = await renderAvatarVideo(opts, { avatarId: "look_1", audio: new Uint8Array([1]), output: "green" }, { sleep: async () => {} });
    expect(out.video.byteLength).toBe(4);
    expect(out.format).toBe("mp4");
    expect(calls.map((c) => c.url.replace("https://api.heygen.com", ""))).toEqual(["/v3/assets", "/v3/videos", "/v3/videos/v_9", "https://files.heygen.test/v_9.mp4"]);
    expect(calls[3]!.headers["x-api-key"]).toBeUndefined();
  });
});

describe("incrustation FFmpeg", () => {
  const input = { base: "base.mp4", avatar: "avatar.mp4", out: "final.mp4", width: 1920, height: 1080, source: "green" as const };

  test("pastille : le vert est retiré, l'avatar est masqué en rond et posé en bas à droite", () => {
    const f = compositeFilter(input);
    expect(f).toContain("chromakey=0x00FF00");
    expect(f).toContain("despill=type=green");
    expect(f).toContain("overlay=W-w-48:H-h-48");
    expect(f.endsWith("[v]")).toBe(true);
    // 17 % de 1920 = 326 px, anneau de 10 px.
    expect(f).toContain("s=326x326");
  });

  test("en pied : posé sur le bord bas, dans le coin demandé", () => {
    const f = compositeFilter({ ...input, layout: "standing", corner: "bottom-left", size: 0.3 });
    expect(f).toContain("scale=576:-2");
    expect(f).toContain("overlay=48:H-h-0");
  });

  test("WebM transparent : pas de chromakey, décodeur VP9 devant l'avatar", () => {
    const args = compositeArgs({ ...input, source: "alpha", avatar: "avatar.webm" });
    expect(args.join(" ")).not.toContain("chromakey");
    expect(args.slice(args.indexOf("avatar.webm") - 3, args.indexOf("avatar.webm") + 1)).toEqual(["-c:v", "libvpx-vp9", "-i", "avatar.webm"]);
  });

  test("le son gardé est celui du fond, copié tel quel", () => {
    const args = compositeArgs(input);
    expect(args.slice(args.indexOf("-map"), args.indexOf("-map") + 4)).toEqual(["-map", "[v]", "-map", "0:a?"]);
    expect(args[args.indexOf("-c:a") + 1]).toBe("copy");
    expect(args.at(-1)).toBe("final.mp4");
  });

  test("une couleur mal écrite retombe sur la valeur sûre ; la taille est bornée", () => {
    expect(compositeFilter({ ...input, keyColor: "vert; rm -rf" })).toContain("chromakey=0x00FF00");
    expect(compositeFilter({ ...input, size: 9 })).toContain("s=960x960");
  });
});
