import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { clearLogoCache, fetchInstitutionLogo, isAllowedLogoDomain, pngWidth } from "../src/api/lib/institution-logo";

/** Un PNG minimal de largeur w (seul l'en-tête compte ici). */
function png(w: number): Uint8Array {
  const b = new Uint8Array(64);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  b.set([(w >>> 24) & 255, (w >>> 16) & 255, (w >>> 8) & 255, w & 255], 16);
  return b;
}
const reply = (body: Uint8Array | null, status = 200, type = "image/png") =>
  new Response(body, { status, headers: { "content-type": type } });

describe("logos : relais serveur, liste fermée", () => {
  beforeEach(() => clearLogoCache());

  test("seuls les domaines de la liste — pas de relais ouvert (SSRF)", () => {
    expect(isAllowedLogoDomain("rwth-aachen.de")).toBe(true);
    for (const d of ["evil.com", "localhost", "169.254.169.254", "rwth-aachen.de/../x", "RWTH-AACHEN.DE"]) {
      expect(isAllowedLogoDomain(d)).toBe(false);
    }
  });

  test("RWTH : logo net (128 px) → servi ; une seule requête grâce au cache", async () => {
    let calls = 0;
    const f = (async () => {
      calls++;
      return reply(png(128));
    }) as unknown as typeof fetch;
    const r = await fetchInstitutionLogo("rwth-aachen.de", f);
    expect(r.ok).toBe(true);
    await fetchInstitutionLogo("rwth-aachen.de", f);
    expect(calls).toBe(1);
  });

  test("icône 16 px (floue) ou 404 → on essaie www., puis l'icône du site, puis on abandonne", async () => {
    const asked: string[] = [];
    const f = (async (url: string) => {
      const u = new URL(url);
      asked.push(u.searchParams.get("domain") ?? `${u.host}${u.pathname}`);
      return asked.length === 1 ? reply(png(16)) : reply(null, 404);
    }) as unknown as typeof fetch;
    expect((await fetchInstitutionLogo("fh-aachen.de", f)).ok).toBe(false);
    expect(asked).toEqual([
      "fh-aachen.de",
      "www.fh-aachen.de",
      "fh-aachen.de/apple-touch-icon.png",
      "www.fh-aachen.de/apple-touch-icon.png",
    ]);
  });

  test("jamais de SVG (il peut contenir du script), ni de fichier énorme", async () => {
    const svg = (async () => reply(new TextEncoder().encode("<svg onload=alert(1)>"), 200, "image/svg+xml")) as unknown as typeof fetch;
    expect((await fetchInstitutionLogo("tum.de", svg)).ok).toBe(false);
    clearLogoCache();
    const big = (async () => reply(new Uint8Array(300 * 1024))) as unknown as typeof fetch;
    expect((await fetchInstitutionLogo("tum.de", big)).ok).toBe(false);
  });

  test("lecture de la largeur PNG", () => {
    expect(pngWidth(png(128))).toBe(128);
    expect(pngWidth(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  test("route : liste fermée, limite de débit, en-têtes sûrs ; le navigateur ne voit que /api/logo", () => {
    const api = readFileSync(join(import.meta.dir, "..", "src/api/index.ts"), "utf8");
    expect(api).toContain('app.get("/api/logo/:domain"');
    expect(api).toContain('rateLimitMiddleware({ limit: 120, scope: "logo", by: "ip" })');
    expect(api).toContain('"X-Content-Type-Options": "nosniff"');
    const ui = readFileSync(join(import.meta.dir, "..", "src/web/components/institution-logo.tsx"), "utf8");
    expect(ui).toContain("src={`/api/logo/${domain}`}");
    expect(ui).not.toMatch(/google\.com|gstatic|clearbit/);
  });
});
