/**
 * Le résultat de l'outil `generiere_bild_oder_video` devient un bloc
 * ```tredmedia à l'endroit de l'appel — comme ```balkendiagramm pour la
 * poutre. Écrit par le CODE, jamais par le modèle : l'URL affichée est celle
 * que le serveur a produite, pas une URL inventée.
 *
 *   en cours   → {"pending":true,"type":"video"}   (spinner)
 *   terminé    → {"type":"image","url":"/api/media/generated/…"}
 *   échec      → rien (le tuteur explique lui-même)
 */
export const MEDIA_LANG = "tredmedia";

/** Seules nos propres URL sont affichées — jamais un lien externe arbitraire. */
export const MEDIA_URL_RE = /^\/api\/media\/generated\/[A-Za-z0-9_-]+\/[0-9a-f-]{36}\.(webp|png|jpg|mp4|webm)$/;

export type MediaBlock =
  | { pending: true; type: "image" | "video" }
  | { pending?: false; type: "image" | "video"; url: string };

export function mediaBlockFromPart(part: unknown): string | null {
  const p = part as {
    type?: string;
    toolName?: string;
    state?: string;
    input?: { type?: unknown };
    output?: { ok?: boolean; type?: unknown; url?: unknown };
  };
  const isMediaTool =
    p?.type === "tool-generiere_bild_oder_video" ||
    (p?.type === "dynamic-tool" && p.toolName === "generiere_bild_oder_video");
  if (!isMediaTool) return null;

  const kind = (v: unknown): "image" | "video" => (v === "video" ? "video" : "image");
  let block: MediaBlock | null = null;
  if (p.state === "input-streaming" || p.state === "input-available") {
    block = { pending: true, type: kind(p.input?.type) };
  } else if (p.state === "output-available" && p.output?.ok && typeof p.output.url === "string") {
    if (MEDIA_URL_RE.test(p.output.url)) block = { type: kind(p.output.type), url: p.output.url };
  }
  return block ? `\n\n\`\`\`${MEDIA_LANG}\n${JSON.stringify(block)}\n\`\`\`\n\n` : null;
}

export function parseMediaBlock(raw: string): MediaBlock | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const type = v.type === "video" ? "video" : v.type === "image" ? "image" : null;
    if (!type) return null;
    if (v.pending === true) return { pending: true, type };
    if (typeof v.url === "string" && MEDIA_URL_RE.test(v.url)) return { type, url: v.url };
    return null;
  } catch {
    return null;
  }
}
