import { afterEach, describe, expect, test } from "bun:test";
import { extractDocument } from "../src/api/lib/extract";

/**
 * Import d'une photo : Mathpix d'abord (LaTeX exact), sans jamais casser
 * l'import s'il manque, échoue ou ne trouve rien. On simule l'API : aucun
 * appel réseau, aucune clé réelle.
 */
const realFetch = globalThis.fetch;
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
const FORMULA =
  "Knotenregel: $I_1 = I_2 + I_3$\n$$\nU = R \\cdot I = 12\\,\\mathrm{V}\n$$\nGesucht: Strom durch R2.";

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.MATHPIX_APP_ID;
  delete process.env.MATHPIX_APP_KEY;
});

describe("import de photo → Mathpix", () => {
  test("avec clés : le texte LaTeX de Mathpix devient le document", async () => {
    process.env.MATHPIX_APP_ID = "test-id";
    process.env.MATHPIX_APP_KEY = "test-key";
    const calls: { url: string; headers: Record<string, string>; body: { src: string } }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ text: FORMULA, confidence: 0.98 }), { status: 200 });
    }) as typeof fetch;

    const doc = await extractDocument(PNG, "aufgabe.png");

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.mathpix.com/v3/text");
    expect(calls[0]!.headers.app_id).toBe("test-id");
    expect(calls[0]!.body.src.startsWith("data:image/png;base64,")).toBe(true);
    expect(doc.text).toContain("[[SEITE 1]]");
    expect(doc.text).toContain("$I_1 = I_2 + I_3$");
    expect(doc.ocr).toBe(true);
  });

  test("Mathpix en erreur : on retombe sur la vision (pas d'échec d'import)", async () => {
    process.env.MATHPIX_APP_ID = "test-id";
    process.env.MATHPIX_APP_KEY = "test-key";
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(String(url));
      if (String(url).includes("mathpix")) return new Response("boom", { status: 500 });
      throw new Error("vision appelée");
    }) as typeof fetch;

    // Sans clé Anthropic en test, la vision échoue à son tour : ce qui compte,
    // c'est que l'erreur finale vienne d'ELLE et non de Mathpix — preuve que
    // l'échec de Mathpix a été absorbé et le repli tenté.
    const err = await extractDocument(PNG, "aufgabe.png").then(
      () => null,
      (e: unknown) => e as Error,
    );
    expect(urls[0]).toContain("mathpix");
    expect(err).not.toBeNull();
    expect(String(err?.message)).not.toContain("Mathpix");
  });

  test("format non lu par Mathpix (HEIC) : Mathpix n'est pas appelé", async () => {
    process.env.MATHPIX_APP_ID = "test-id";
    process.env.MATHPIX_APP_KEY = "test-key";
    const urls: string[] = [];
    globalThis.fetch = (async (url: string) => {
      urls.push(String(url));
      throw new Error("stop");
    }) as typeof fetch;
    await expect(extractDocument(PNG, "foto.heic")).rejects.toThrow();
    expect(urls.some((u) => u.includes("mathpix"))).toBe(false);
  });
});
