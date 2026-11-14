/**
 * Contrôle d'un fichier téléversé, AVANT tout traitement.
 *
 * L'extension et le type MIME annoncés viennent du client : ils ne prouvent
 * rien. Un exécutable renommé « cours.pdf » passait le contrôle d'extension et
 * partait dans le stockage, puis dans pdf.js. Ici on lit les premiers octets
 * du fichier — sa signature — et on vérifie qu'ils correspondent à
 * l'extension. Module pur, testé sans serveur.
 */

/** 50 Mo. Un Skript de 300 pages scanné en fait une trentaine. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);
const ascii = (b: Uint8Array, start: number, end: number) => String.fromCharCode(...b.subarray(start, Math.min(end, b.length)));

const ZIP = [0x50, 0x4b, 0x03, 0x04];

/** Un fichier Office est un zip : on y cherche le dossier propre au format. */
function zipContains(b: Uint8Array, name: string): boolean {
  return startsWith(b, ZIP) && Buffer.from(b.buffer, b.byteOffset, b.byteLength).includes(name, 0, "latin1");
}

/** Marques HEIF acceptées (photos d'iPhone). */
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/**
 * Du texte, vraiment ? Pas d'octet nul et presque aucun caractère de contrôle
 * dans les 8 premiers Ko. Un binaire quelconque échoue aux deux.
 */
function looksLikeText(b: Uint8Array): boolean {
  const head = b.subarray(0, 8192);
  let control = 0;
  for (const byte of head) {
    if (byte === 0) return false;
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x0c) control += 1;
  }
  return control <= head.length * 0.02;
}

/** Le contenu correspond-il à l'extension annoncée ? */
export function contentMatchesExtension(ext: string, b: Uint8Array): boolean {
  switch (ext) {
    case "pdf":
      // La norme tolère quelques octets avant « %PDF- » (en-têtes de scanner).
      return ascii(b, 0, 1024).includes("%PDF-");
    case "docx":
      return zipContains(b, "word/");
    case "pptx":
      return zipContains(b, "ppt/");
    case "png":
      return startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return startsWith(b, [0xff, 0xd8, 0xff]);
    case "webp":
      return ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP";
    case "heic":
      return ascii(b, 4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(b, 8, 12));
    case "txt":
    case "md":
    case "csv":
      return looksLikeText(b);
    default:
      return false;
  }
}

/** `Content-Length` annoncé au-delà du plafond (+ 1 Mo pour l'enveloppe multipart) : refus sans lire le corps. */
export function declaredTooLarge(contentLength: string | null | undefined): boolean {
  const n = Number(contentLength);
  return Number.isFinite(n) && n > MAX_UPLOAD_BYTES + 1024 * 1024;
}
