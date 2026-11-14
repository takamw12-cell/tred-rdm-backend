/**
 * L'original d'un document, servi à SON propriétaire (2026-11-14).
 *
 *   GET /api/documents/:id/stream
 *
 * Le lecteur PDF de l'app (pdf.js) lit le fichier par cette route, sur notre
 * propre origine : pas d'adresse publique, pas d'adresse signée à faire
 * circuler, pas de réglage CORS à poser sur le stockage. La session décide.
 *
 * ── Les règles ────────────────────────────────────────────────────────────
 *
 *   - Sans session : 401.
 *   - Un document qui n'existe pas et un document qui appartient à quelqu'un
 *     d'autre reçoivent LA MÊME réponse, 404 : on ne confirme pas à un curieux
 *     qu'un identifiant existe.
 *   - Les plages d'octets (Range → 206) sont transmises au stockage : pdf.js
 *     ne télécharge que les pages qu'il affiche, même pour un Skript de 300 pages.
 *   - La réponse ne peut pas devenir une page de notre site : type MIME tiré de
 *     l'extension stockée, `nosniff`, bac à sable CSP, et `attachment` pour une
 *     navigation directe. Un fichier déposé par un étudiant ne s'exécute jamais
 *     sur l'origine de TRED.
 *
 * Module sans base ni réseau : la route fournit `findOwned` et `getObject`.
 */

export interface OwnedFile {
  /** Clé de l'original dans le stockage ; `null` pour un document importé avant qu'on garde les originaux. */
  fileKey: string | null;
  title: string;
}

export interface StoredObject {
  body: ReadableStream<Uint8Array> | Uint8Array;
  contentLength?: number;
  /** Présent quand le stockage a servi une plage (« bytes 0-65535/1048576 »). */
  contentRange?: string;
}

export interface StreamDeps {
  /** Le document de CE compte. `null` s'il n'existe pas — ou s'il est à quelqu'un d'autre. */
  findOwned: (documentId: string, userId: string) => Promise<OwnedFile | null>;
  getObject: (fileKey: string, range: string | null) => Promise<StoredObject>;
  mime: (ext: string) => string;
}

/** Une seule plage, bien formée : « bytes=0-65535 », « bytes=1024- », « bytes=-500 ». Tout le reste est ignoré. */
export function safeRange(header: string | null | undefined): string | null {
  const value = (header ?? "").trim();
  return /^bytes=(\d+-\d*|-\d+)$/.test(value) ? value : null;
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Nom de fichier pour `Content-Disposition`, sans rien qui puisse casser l'en-tête. */
function dispositionName(title: string, ext: string): string {
  const base = title.replace(/[^\p{L}\p{N} ._-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Dokument";
  return encodeURIComponent(`${base}.${ext}`);
}

export async function streamDocument(input: { userId: string | null; documentId: string; range: string | null | undefined }, deps: StreamDeps): Promise<Response> {
  if (!input.userId) return json({ error: "UNAUTHORIZED" }, 401);
  if (!input.documentId || input.documentId.length > 128) return json({ error: "not_found" }, 404);

  // La requête filtre sur l'identifiant ET sur le compte : pour qui n'est pas
  // le propriétaire, ce document n'existe pas.
  const owned = await deps.findOwned(input.documentId, input.userId);
  if (!owned) return json({ error: "not_found" }, 404);
  if (!owned.fileKey) return json({ error: "no_original" }, 404);

  const range = safeRange(input.range);
  let object: StoredObject;
  try {
    object = await deps.getObject(owned.fileKey, range);
  } catch (err) {
    const name = String((err as { name?: unknown } | null)?.name ?? "");
    if (name === "NoSuchKey" || name === "NotFound") return json({ error: "no_original" }, 404);
    if (name === "InvalidRange") return new Response(null, { status: 416, headers: { "Cache-Control": "no-store" } });
    console.error("[stream] stockage indisponible", (err as Error)?.message?.slice(0, 200));
    return json({ error: "storage_unavailable" }, 502);
  }

  const ext = (owned.fileKey.split(".").pop() ?? "").toLowerCase();
  const headers = new Headers({
    "Content-Type": deps.mime(ext),
    "Accept-Ranges": "bytes",
    // Privé : le navigateur de l'étudiant peut le garder quelques minutes, aucun cache partagé ne le peut.
    "Cache-Control": "private, max-age=300",
    "Content-Disposition": `attachment; filename*=UTF-8''${dispositionName(owned.title, ext)}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (object.contentLength !== undefined) headers.set("Content-Length", String(object.contentLength));
  const partial = Boolean(range && object.contentRange);
  if (partial) headers.set("Content-Range", object.contentRange!);
  return new Response(object.body as ConstructorParameters<typeof Response>[0], { status: partial ? 206 : 200, headers });
}
