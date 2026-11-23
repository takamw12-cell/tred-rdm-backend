import { describe, expect, test } from "bun:test";
import { dispatchRender, listRenders, renderFarmConfigured } from "../src/api/lib/render-farm";

const env = { GITHUB_TOKEN: "jeton-de-test", GITHUB_RENDER_REPO: "acme/tred" };
function fake(status: number, json?: unknown) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const f = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(json === undefined ? null : JSON.stringify(json), { status });
  }) as unknown as typeof fetch;
  return { calls, f };
}

describe("ferme de rendu (GitHub Actions)", () => {
  test("configurée seulement avec un jeton et un dépôt bien écrit", () => {
    expect(renderFarmConfigured(env)).toBe(true);
    expect(renderFarmConfigured({ GITHUB_TOKEN: "x" })).toBe(false);
    expect(renderFarmConfigured({ GITHUB_TOKEN: " ", GITHUB_RENDER_REPO: "acme/tred" })).toBe(false);
    expect(renderFarmConfigured({ GITHUB_TOKEN: "x", GITHUB_RENDER_REPO: "acme/tred/../../evil" })).toBe(false);
  });

  test("le déclenchement vise le bon workflow, avec des entrées en chaînes et le jeton en en-tête", async () => {
    const { calls, f } = fake(204);
    expect(await dispatchRender({ brief: "en1" }, env, f)).toEqual({ ok: true });
    expect(calls[0]!.url).toBe("https://api.github.com/repos/acme/tred/actions/workflows/render-video.yml/dispatches");
    expect(new Headers(calls[0]!.init!.headers).get("authorization")).toBe("Bearer jeton-de-test");
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ ref: "master", inputs: { brief: "en1", avatar: "heygen", layout: "bubble" } });
  });

  test("un nom de brief étrange ne part jamais chez GitHub ; sans jeton non plus", async () => {
    const { calls, f } = fake(204);
    for (const brief of ["../../etc", "en1; rm -rf", "", "EN 1", "a".repeat(60)]) expect(await dispatchRender({ brief }, env, f)).toEqual({ ok: false, reason: "bad_request" });
    expect(await dispatchRender({ brief: "en1" }, {}, f)).toEqual({ ok: false, reason: "not_configured" });
    expect(calls.length).toBe(0);
  });

  test("un refus de GitHub est rendu avec son statut, sans le jeton", async () => {
    const { f } = fake(403, { message: "Resource not accessible" });
    const out = await dispatchRender({ brief: "en1" }, env, f);
    expect(out).toEqual({ ok: false, reason: "github_error", status: 403 });
    expect(JSON.stringify(out)).not.toContain("jeton-de-test");
  });

  test("la liste des rendus", async () => {
    const { f } = fake(200, { workflow_runs: [{ id: 7, status: "in_progress", conclusion: null, display_title: "en1", created_at: "2026-11-24T00:10:00Z", html_url: "https://github.com/acme/tred/actions/runs/7" }, { status: "sans id" }] });
    expect(await listRenders(env, f)).toEqual([{ id: 7, status: "in_progress", conclusion: null, title: "en1", createdAt: "2026-11-24T00:10:00Z", url: "https://github.com/acme/tred/actions/runs/7" }]);
    expect(await listRenders({}, f)).toEqual([]);
    expect(await listRenders(env, fake(500).f)).toEqual([]);
  });
});
