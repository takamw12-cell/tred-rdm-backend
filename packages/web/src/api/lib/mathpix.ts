/**
 * Mathpix Convert API — OCR des formules (photo d'un exercice → LaTeX/Markdown).
 * Branchée sur l'import de documents (lib/extract.ts, photos PNG/JPEG). Sans clés, lève NotConfigured.
 *
 * Doc : https://docs.mathpix.com  ·  Prix : https://mathpix.com/pricing/api
 * Coût indicatif : 19,99 $ de frais d'activation (une fois), puis ~0,002 $/image.
 */

const MATHPIX_URL = "https://api.mathpix.com/v3/text";

export class MathpixNotConfiguredError extends Error {
  constructor() {
    super("Mathpix: MATHPIX_APP_ID / MATHPIX_APP_KEY manquants (voir GUIDE_FOUNDER.md)");
    this.name = "MathpixNotConfiguredError";
  }
}

export const mathpixConfigured = (): boolean =>
  Boolean(process.env.MATHPIX_APP_ID && process.env.MATHPIX_APP_KEY);

export interface MathpixResult {
  /** Texte en Mathpix Markdown : le LaTeX est entre \( \) et \[ \]. */
  text: string;
  /** Confiance globale 0–1 renvoyée par Mathpix. */
  confidence: number | null;
}

/** Image (PNG/JPEG en base64 data-URL ou URL publique) → texte + LaTeX. */
export async function mathpixOcr(image: string): Promise<MathpixResult> {
  if (!mathpixConfigured()) throw new MathpixNotConfiguredError();

  const res = await fetch(MATHPIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      app_id: process.env.MATHPIX_APP_ID!,
      app_key: process.env.MATHPIX_APP_KEY!,
    },
    body: JSON.stringify({
      src: image,
      formats: ["text"],
      math_inline_delimiters: ["$", "$"],
      math_display_delimiters: ["$$", "$$"],
      rm_spaces: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) throw new Error(`Mathpix ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { text?: string; confidence?: number; error?: string };
  if (body.error) throw new Error(`Mathpix: ${body.error}`);
  return { text: body.text ?? "", confidence: body.confidence ?? null };
}
