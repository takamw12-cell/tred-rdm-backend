/**
 * Les pièces jointes d'une question (image, PDF) : ce qui part VRAIMENT au
 * modèle, et ce qui voyage dans le corps de la requête.
 *
 * Module pur, sans dépendance : il est lu par le serveur (api/index.ts) ET
 * par le navigateur (web/pages/chat.tsx), pour que les deux appliquent la
 * même règle.
 *
 * ── Pourquoi (mesure du 15 nov. 2026, 06:58 UTC) ───────────────────────────
 *
 * Une question avec un PDF joint a envoyé 292 547 tokens en un seul appel :
 * 54 000 de règles et d'outils, moins de 10 000 d'extraits du cours — et le
 * reste, le PDF, que le modèle lit page par page (texte + image de la page).
 * Premier signe de vie après 29 s, premier mot après 36 s, environ 1 $ pour
 * cette seule question. Les deux questions suivantes ont réexpédié ce même
 * fichier : le navigateur renvoie tout l'historique, pièces jointes comprises,
 * et le serveur les jetait à l'arrivée.
 *
 *   1. Une question porte au plus MAX_ATTACHED_PDF_PAGES pages de PDF. Une
 *      feuille d'exercices ou une Klausur passent ; un Skript va dans « Meine
 *      Kurse », où il est découpé, cherché et cité page par page.
 *   2. Une pièce jointe ne voyage qu'avec SA question : l'historique est
 *      élagué dans le navigateur avant l'envoi, puis de nouveau ici.
 */

/** Fichiers (images + PDF) qu'une question peut porter. */
export const MAX_FILES_PER_MESSAGE = 4;

/**
 * Pages de PDF qu'une question peut porter, tous fichiers confondus.
 * Une page coûte au modèle 1 500 à 3 000 tokens (son texte et son image) :
 * 20 pages restent sous ~60 000 tokens, l'ordre de grandeur du prompt lui-même.
 */
export const MAX_ATTACHED_PDF_PAGES = 20;

export const pdfPagesExceeded = (pages: number) => pages > MAX_ATTACHED_PDF_PAGES;

interface PartLike {
  type?: string;
  mediaType?: string;
  url?: unknown;
}
interface MessageLike {
  role?: string;
  parts?: unknown[];
}

const OLD_ATTACHMENT = "[Anhang aus einer früheren Nachricht]";
const UNREADABLE_ATTACHMENT = "[Anhang konnte nicht gelesen werden]";

const isPdf = (p: PartLike) => p?.type === "file" && p.mediaType === "application/pdf";
const isSendableFile = (p: PartLike) => p?.type === "file" && (String(p.mediaType ?? "").startsWith("image/") || p.mediaType === "application/pdf");

/**
 * Letzte Verteidigungslinie: ein Anhang ohne brauchbare Daten lässt sonst die
 * komplette Anfrage mit HTTP 400 scheitern ("Input should be a valid string").
 */
const isUsable = (url: unknown): url is string =>
  typeof url === "string" &&
  ((url.startsWith("data:") && url.includes(";base64,") && url.length > 200) || url.startsWith("http://") || url.startsWith("https://"));

function lastUserIndex(msgs: unknown[]): number {
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    if ((msgs[i] as MessageLike)?.role === "user") return i;
  }
  return -1;
}

/**
 * Seule la DERNIÈRE question garde ses fichiers (au plus MAX_FILES_PER_MESSAGE).
 * Ceux des questions passées sont remplacés par une ligne de texte : le tuteur
 * sait qu'il y en avait un, mais ni le modèle ni le réseau ne le portent encore.
 *
 * Ne modifie rien sur place ; rejouée sur son propre résultat, elle ne change
 * plus rien (le navigateur l'applique avant l'envoi, le serveur à l'arrivée).
 */
export function pruneHistoryFiles(msgs: unknown[]): unknown[] {
  if (!Array.isArray(msgs) || msgs.length === 0) return msgs;
  const current = lastUserIndex(msgs);

  return msgs.map((msg, index) => {
    const m = msg as MessageLike;
    if (!Array.isArray(m.parts)) return msg;

    let kept = 0;
    const parts: unknown[] = [];
    for (const part of m.parts) {
      const p = part as PartLike;
      if (!isSendableFile(p)) {
        parts.push(part);
        continue;
      }
      // Lieber den Anhang weglassen als das Gespräch abbrechen.
      if (!isUsable(p.url)) {
        parts.push({ type: "text", text: UNREADABLE_ATTACHMENT });
        continue;
      }
      if (index === current && kept < MAX_FILES_PER_MESSAGE) {
        parts.push(part);
        kept += 1;
        continue;
      }
      // Older (or excess) attachment: keep the trace, drop the payload.
      parts.push({ type: "text", text: OLD_ATTACHMENT });
    }
    return { ...m, parts };
  });
}

/** `Buffer` côté serveur (Bun, Node) ; absent du navigateur, où `atob` suffit. */
const NodeBuffer = (globalThis as { Buffer?: { from(data: string, encoding: "base64"): Uint8Array } }).Buffer;

/** Les octets d'une data URL en base64 ; `null` pour tout le reste (lien, texte brut). */
export function dataUrlBytes(url: string): Uint8Array | null {
  const at = url.indexOf(";base64,");
  if (!url.startsWith("data:") || at < 0) return null;
  const b64 = url.slice(at + 8);
  try {
    // Un PDF joint pèse jusqu'à 20 Mo : le décodage natif, pas une boucle par caractère.
    if (NodeBuffer) return new Uint8Array(NodeBuffer.from(b64, "base64"));
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * Les pages de PDF que la dernière question enverrait au modèle.
 *
 * `countPages` ouvre le fichier (serveur : lib/pdf-pages.ts). Un PDF qu'on ne
 * sait pas ouvrir — protégé par mot de passe, abîmé — est compté dans
 * `unreadable` et ne bloque rien : la limite porte sur ce qu'on a pu mesurer.
 */
export async function attachedPdfPages(
  msgs: unknown[],
  countPages: (bytes: Uint8Array) => Promise<number>,
): Promise<{ pages: number; files: number; unreadable: number }> {
  const out = { pages: 0, files: 0, unreadable: 0 };
  if (!Array.isArray(msgs)) return out;
  const pruned = pruneHistoryFiles(msgs);
  const last = pruned[lastUserIndex(pruned)] as MessageLike | undefined;
  for (const part of last?.parts ?? []) {
    const p = part as PartLike;
    if (!isPdf(p) || typeof p.url !== "string") continue;
    out.files += 1;
    const bytes = dataUrlBytes(p.url);
    try {
      if (!bytes) throw new Error("not a data URL");
      out.pages += await countPages(bytes);
    } catch {
      out.unreadable += 1;
    }
  }
  return out;
}

/** Taille des fichiers portés par ces messages, en caractères de data URL (mesure, tests). */
export function uploadBytes(msgs: unknown[]): number {
  let n = 0;
  for (const msg of Array.isArray(msgs) ? msgs : []) {
    for (const part of (msg as MessageLike)?.parts ?? []) {
      const p = part as PartLike;
      if (p?.type === "file" && typeof p.url === "string") n += p.url.length;
    }
  }
  return n;
}
