// Phone cameras produce 3–12 MB photos. Sent as-is (base64) they exceed the
// vision API's per-image limit, which aborts the whole chat request — and they
// cost far more tokens than needed. Handwriting stays perfectly readable at
// ~1600 px, so we downscale before attaching.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * A usable data URL must carry actual base64 payload. On mobile, canvas
 * encoding can fail silently and return something like "data:," — which the
 * vision API then rejects with "Input should be a valid string". We check the
 * result instead of trusting it.
 */
export function isUsableDataUrl(url: unknown): url is string {
  return (
    typeof url === "string" &&
    url.startsWith("data:") &&
    url.includes(";base64,") &&
    url.length > 200
  );
}

/**
 * Returns a JPEG data URL no larger than MAX_DIMENSION on its longest side.
 * Falls back to the untouched file if the browser can't decode it, and returns
 * null when no valid encoding could be produced at all.
 */
export async function downscaleImageToDataUrl(file: File): Promise<string | null> {
  const raw = async (): Promise<string | null> => {
    const url = await readAsDataUrl(file).catch(() => null);
    return isUsableDataUrl(url) ? url : null;
  };
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));

    // Small enough already: keep the original bytes (no re-encoding artefacts).
    if (scale === 1 && file.size <= 1_500_000) {
      bitmap.close();
      return raw();
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return raw();
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const encoded = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    // Canvas encoding failed (memory limits on mobile) → use the original.
    return isUsableDataUrl(encoded) ? encoded : raw();
  } catch {
    return raw();
  }
}

/** Caps an already-encoded data URL (e.g. a camera capture) the same way. */
export async function downscaleDataUrl(dataUrl: string): Promise<string | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const out = await downscaleImageToDataUrl(
      new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }),
    );
    if (out) return out;
  } catch {
    // fall through
  }
  return isUsableDataUrl(dataUrl) ? dataUrl : null;
}
