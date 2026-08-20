import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";
import { generateText } from "ai";
import { unzipSync, strFromU8 } from "fflate";
import { gateway } from "../agent/gateway";

const TRANSCRIBE_PROMPT =
  "Transkribiere diese Seite eines Ingenieur-Dokuments " +
  "(Klausur, Übung, Skript, Tafelbild oder Foto einer Mitschrift) exakt und vollständig. " +
  "Behalte die Originalsprache (meist Deutsch) bei. " +
  "Gib Formeln in LaTeX wieder ($...$ inline, $$...$$ abgesetzt). " +
  "Beschreibe Schaltpläne/Diagramme kurz in [Abbildung: ...]. " +
  "Gib NUR den transkribierten Inhalt aus, ohne Kommentar.";

/**
 * Transkribiert ein Bild (gerenderte PDF-Seite oder hochgeladenes Foto).
 *
 * Lief früher über das Runable-Gateway. Nach dem Umzug auf Railway gab es die
 * Variablen AI_GATEWAY_* nicht mehr — jeder eingescannte Upload endete deshalb
 * mit `extraction_failed`. Jetzt läuft das über dieselbe Anthropic-Verbindung
 * wie der restliche Tutor.
 */
async function visionTranscribe(bytes: Uint8Array, mediaType: string): Promise<string> {
  const { text } = await generateText({
    model: gateway("anthropic/claude-sonnet-4.6"),
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_PROMPT },
          // "file" statt "image": der "image"-Part ist im AI SDK 7 veraltet und
          // erzeugt bei jedem Aufruf eine DeprecationWarning im Log.
          { type: "file", data: bytes, mediaType },
        ],
      },
    ],
  });
  return text.trim();
}

export interface ExtractedDoc {
  /** Volltext mit [[SEITE n]]-Markern, damit der Tutor Seiten zitieren kann. */
  text: string;
  pageCount: number;
  /** true, wenn der Text per Bildtranskription gewonnen wurde. */
  ocr: boolean;
}

/** Alter Name — extractDocument() deckt inzwischen alle Formate ab. */
export type ExtractedPdf = ExtractedDoc;

// Unter diesem Schnitt pro Seite gilt die Seite als reines Bild (ein Scan) und
// wir transkribieren sie, statt der leeren Textebene zu vertrauen.
const MIN_CHARS_PER_PAGE = 40;
// Nie mehr Seiten rendern/transkribieren — schützt Kosten und Wartezeit.
const MAX_OCR_PAGES = 30;
// Grobe Seitenschätzung für Formate ohne Seitenbegriff (DOCX, TXT).
const CHARS_PER_PAGE = 2200;

function cleanPage(s: string): string {
  return s.replace(/\u0000/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// ── PDF ────────────────────────────────────────────────────────────────────

/**
 * 1. `unpdf` liest die eingebettete Textebene seitenweise (schnell, exakt) —
 *    das deckt normale Skripte und Übungsblätter ab.
 * 2. Hat ein PDF praktisch keine Textebene (eingescannte Klausur), wird jede
 *    Seite als PNG gerendert und vom Vision-Modell transkribiert — bei
 *    Handschrift, Formeln und Schaltplänen deutlich besser als klassisches OCR.
 */
export async function extractPdf(bytes: Uint8Array): Promise<ExtractedDoc> {
  // unpdf/pdf.js hängt den gelesenen ArrayBuffer ab, also bekommt es eine Kopie
  // und `bytes` bleibt für die Transkription unten unversehrt.
  const pdf = await getDocumentProxy(bytes.slice());
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = text as string[];

  const parts = pages.map((p, i) => `[[SEITE ${i + 1}]]\n${cleanPage(p ?? "")}`);
  const joined = parts.join("\n\n").trim();
  const plainLen = joined.replace(/\[\[SEITE \d+\]\]/g, "").trim().length;

  if (plainLen >= totalPages * MIN_CHARS_PER_PAGE && plainLen >= 120) {
    return { text: joined, pageCount: totalPages, ocr: false };
  }

  const ocrText = await transcribeScanned(bytes, totalPages);
  return { text: ocrText, pageCount: totalPages, ocr: true };
}

async function transcribeScanned(bytes: Uint8Array, totalPages: number): Promise<string> {
  const limit = Math.min(totalPages, MAX_OCR_PAGES);
  const parts: string[] = [];

  // Specifier bewusst nicht literal, damit der Release-Bundler @napi-rs/canvas
  // als externen Laufzeit-Import behandelt und das native .node-Addon nicht in
  // eine zweite Ausgabedatei splittet — das bricht `bun build --outfile`.
  const canvasPkg = ["@napi-rs", "canvas"].join("/");

  for (let i = 1; i <= limit; i++) {
    // renderPageAsImage verbraucht den Puffer, also jedes Mal eine frische Kopie.
    const rendered = (await renderPageAsImage(bytes.slice(), i, {
      scale: 2,
      canvasImport: () => import(canvasPkg) as never,
    })) as ArrayBuffer;

    const text = await visionTranscribe(new Uint8Array(rendered), "image/png");
    parts.push(`[[SEITE ${i}]]\n${cleanPage(text)}`);
  }

  return parts.join("\n\n").trim();
}

// ── Word (.docx) ───────────────────────────────────────────────────────────

async function extractDocx(bytes: Uint8Array): Promise<ExtractedDoc> {
  // mammoth ist CommonJS; der dynamische Import hält es aus dem Startpfad des
  // Servers heraus — geladen wird es erst beim ersten DOCX.
  const mod = (await import("mammoth")) as unknown as {
    default?: { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }> };
    extractRawText?: (o: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const extractRawText = mod.extractRawText ?? mod.default?.extractRawText;
  if (!extractRawText) throw new Error("mammoth: extractRawText not available");

  const { value } = await extractRawText({ buffer: Buffer.from(bytes) });
  const text = cleanPage(value);
  return {
    text: `[[SEITE 1]]\n${text}`,
    pageCount: Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE)),
    ocr: false,
  };
}

// ── PowerPoint (.pptx) ─────────────────────────────────────────────────────

/**
 * Eine .pptx ist ein ZIP mit einer XML-Datei pro Folie. Wir ziehen die
 * Textknoten `<a:t>` heraus — eine Folie wird zu einer "Seite", damit der Tutor
 * später "Folie 7" zitieren kann.
 */
function extractPptx(bytes: Uint8Array): ExtractedDoc {
  const files = unzipSync(bytes);
  const slideNames = Object.keys(files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const num = (s: string) => Number(/slide(\d+)\.xml$/.exec(s)?.[1] ?? 0);
      return num(a) - num(b);
    });

  const parts = slideNames.map((name, i) => {
    const xml = strFromU8(files[name] as Uint8Array);
    const texts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) =>
      (m[1] ?? "")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&"),
    );
    return `[[SEITE ${i + 1}]]\n${cleanPage(texts.join("\n"))}`;
  });

  return {
    text: parts.join("\n\n").trim(),
    pageCount: slideNames.length || 1,
    ocr: false,
  };
}

// ── Bilder ─────────────────────────────────────────────────────────────────

async function extractImage(bytes: Uint8Array, mediaType: string): Promise<ExtractedDoc> {
  const text = await visionTranscribe(bytes, mediaType);
  return { text: `[[SEITE 1]]\n${cleanPage(text)}`, pageCount: 1, ocr: true };
}

// ── Reiner Text ────────────────────────────────────────────────────────────

function extractPlain(bytes: Uint8Array): ExtractedDoc {
  const text = cleanPage(new TextDecoder("utf-8").decode(bytes));
  return {
    text: `[[SEITE 1]]\n${text}`,
    pageCount: Math.max(1, Math.ceil(text.length / CHARS_PER_PAGE)),
    ocr: false,
  };
}

// ── Verteiler ──────────────────────────────────────────────────────────────

export const SUPPORTED_EXTENSIONS = [
  "pdf", "docx", "pptx", "txt", "md", "csv",
  "png", "jpg", "jpeg", "webp", "heic",
] as const;

const IMAGE_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
};

const STORAGE_MIME: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  ...IMAGE_MIME,
};

export function fileExtension(filename: string): string {
  return (filename.split(".").pop() ?? "").toLowerCase();
}

export function isSupported(filename: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(fileExtension(filename));
}

export function storageMime(ext: string): string {
  return STORAGE_MIME[ext] ?? "application/octet-stream";
}

/** Kann der Browser die Originaldatei direkt anzeigen statt nur herunterzuladen? */
export function isViewableInBrowser(ext: string): boolean {
  return ext === "pdf" || ext in IMAGE_MIME;
}

export class UnsupportedFormatError extends Error {
  readonly ext: string;
  constructor(ext: string) {
    super(`unsupported format: ${ext}`);
    this.ext = ext;
  }
}

/**
 * Einheitlicher Einstieg für alle Uploads. Wählt anhand der Dateiendung den
 * passenden Weg und liefert immer dieselbe Struktur zurück.
 */
export async function extractDocument(
  bytes: Uint8Array,
  filename: string,
): Promise<ExtractedDoc> {
  const ext = fileExtension(filename);

  if (ext === "pdf") return extractPdf(bytes);
  if (ext === "docx") return extractDocx(bytes);
  if (ext === "pptx") return extractPptx(bytes);
  if (ext in IMAGE_MIME) return extractImage(bytes, IMAGE_MIME[ext] as string);
  if (ext === "txt" || ext === "md" || ext === "csv") return extractPlain(bytes);

  throw new UnsupportedFormatError(ext);
}
