import { extractText, getDocumentProxy, getResolvedPDFJS, renderPageAsImage } from "unpdf";
import { mathpixConfigured, mathpixOcr } from "./mathpix";
import { generateText } from "ai";
import { unzipSync, strFromU8 } from "fflate";
import { gateway } from "../agent/gateway";
import { PRIMARY_MODEL } from "./ai-models";

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
    model: gateway(PRIMARY_MODEL),
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

// Nie mehr Seiten rendern/transkribieren — schützt Kosten und Wartezeit.
const MAX_OCR_PAGES = 30;
// Grobe Seitenschätzung für Formate ohne Seitenbegriff (DOCX, TXT).
const CHARS_PER_PAGE = 2200;

function cleanPage(s: string): string {
  return s.replace(/\u0000/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// ── PDF ────────────────────────────────────────────────────────────────────

/**
 * Le PDF est-il illisible par sa couche texte ? Deux cas de scan :
 *
 *   · `zu_wenig_text` — moins de 50 caractères sur la page : c'est une image.
 *   · `zeichensalat`  — il y a du texte, mais c'est du bruit. Un scan passé
 *     par un OCR de photocopieur, ou une police sans table ToUnicode, rend
 *     des caractères de contrôle, des zones privées (U+E000…), des U+FFFD ou
 *     une soupe de symboles. Plus de 30 % de caractères suspects, ou moins de
 *     30 % de lettres, et la page part à l'OCR.
 *
 * « Suspect » ne veut PAS dire « non-ASCII » : les umlauts, le grec des
 * formules, les guillemets „…“ et les symboles mathématiques sont légitimes,
 * comme toute lettre d'une autre écriture (un cours en arabe ou en chinois
 * n'est pas un scan).
 */
export type PageVerdict = "ok" | "zu_wenig_text" | "zeichensalat";

export interface PageQuality {
  verdict: PageVerdict;
  /** Caractères hors espaces. */
  chars: number;
  suspiciousRatio: number;
  letterRatio: number;
}

export const MIN_CHARS_PER_PAGE = 50;
export const MAX_SUSPICIOUS_RATIO = 0.3;
const MIN_LETTER_RATIO = 0.3;

// Contrôle (hors blancs), zone privée, non attribué, demi-surrogat, U+FFFD,
// symboles « autres » et modificateurs (sauf ° © ® ™ ¶, courants dans un cours).
const SUSPICIOUS = /[\p{Cc}\p{Co}\p{Cn}\p{Cs}\uFFFD\p{Sk}]|(?![°©®™¶])\p{So}/gu;
const LETTER = /[\p{L}\p{M}]/gu;

export function assessPageText(raw: string): PageQuality {
  const text = (raw ?? "").replace(/[\s\u00A0]+/g, "");
  const chars = [...text].length;
  const suspicious = text.match(SUSPICIOUS)?.length ?? 0;
  const letters = text.match(LETTER)?.length ?? 0;
  const suspiciousRatio = chars ? suspicious / chars : 0;
  const letterRatio = chars ? letters / chars : 0;
  // Le bruit d'abord : une page courte mais corrompue doit partir à l'OCR
  // même au milieu d'un Skript numérique.
  const verdict: PageVerdict =
    chars >= 10 && suspiciousRatio > MAX_SUSPICIOUS_RATIO
      ? "zeichensalat"
      : chars < MIN_CHARS_PER_PAGE
        ? "zu_wenig_text"
        : letterRatio < MIN_LETTER_RATIO
          ? "zeichensalat"
          : "ok";
  return { verdict, chars, suspiciousRatio, letterRatio };
}

const UNREADABLE_PAGE = "[Seite konnte nicht gelesen werden]";

/** Le scan n'a pu être lu ni par la couche texte, ni par Mathpix, ni par la vision. */
export class ScannedPdfUnreadableError extends Error {
  constructor(message = "scan_unreadable") {
    super(message);
    this.name = "ScannedPdfUnreadableError";
  }
}

/**
 * Quelles pages faut-il passer à l'OCR ?
 *   · une page en charabia : toujours (on ne garde jamais ce texte) ;
 *   · une page presque vide : seulement si le document est surtout fait
 *     d'images. Dans un Skript numérique, une page courte est une page de
 *     titre ou une page blanche — la transcrire coûterait sans rien apporter.
 */
export function pagesToOcr(pages: string[]): { index: number; verdict: PageVerdict }[] {
  const q = pages.map((p) => assessPageText(p));
  const good = q.filter((x) => x.verdict === "ok").length;
  const mostlyScanned = good < pages.length / 2;
  return q
    .map((x, index) => ({ index, verdict: x.verdict }))
    .filter((x) => x.verdict === "zeichensalat" || (x.verdict === "zu_wenig_text" && mostlyScanned));
}

/**
 * Assemble le texte final : couche texte pour les bonnes pages, OCR pour les
 * autres. `ocrPage(i)` rend le texte de la page i (0-based) ou null.
 * Lève ScannedPdfUnreadableError si, au bout du compte, rien n'est lisible.
 */
export async function recoverPdfPages(
  pages: string[],
  ocrPage: (index: number) => Promise<string | null>,
  maxOcrPages = MAX_OCR_PAGES,
): Promise<{ text: string; ocr: boolean; unreadablePages: number[] }> {
  const plan = pagesToOcr(pages);
  const out = pages.map((p) => cleanPage(p ?? ""));
  const unreadable: number[] = [];
  let usedOcr = false;

  for (const [k, { index, verdict }] of plan.entries()) {
    const recovered = k < maxOcrPages ? cleanPage((await ocrPage(index)) ?? "") : "";
    // Une page peu remplie (schéma + légende) reste valable tant que ce
    // n'est pas du charabia.
    if (recovered && assessPageText(recovered).verdict !== "zeichensalat") {
      out[index] = recovered;
      usedOcr = true;
    } else if (verdict === "zeichensalat" || !out[index]) {
      // Le charabia n'entre jamais dans le document : il fausserait la
      // recherche et le tuteur citerait du bruit.
      out[index] = UNREADABLE_PAGE;
      unreadable.push(index + 1);
    }
  }

  const readable = out.some((p) => p !== UNREADABLE_PAGE && assessPageText(p).chars >= 20);
  if (!readable) throw new ScannedPdfUnreadableError();
  return {
    text: out.map((p, i) => `[[SEITE ${i + 1}]]\n${p}`).join("\n\n").trim(),
    ocr: usedOcr,
    unreadablePages: unreadable,
  };
}

/**
 * 1. `unpdf` lit la couche texte page par page (rapide, exacte) — ça couvre
 *    les Skripte et feuilles d'exercices normaux.
 * 2. Les pages scannées (vides OU en charabia, voir assessPageText) sont
 *    rendues en PNG puis lues par Mathpix si ses clés sont posées (formules
 *    exactes), sinon — ou s'il échoue — par la vision Claude.
 * 3. Rien de lisible au bout du compte → ScannedPdfUnreadableError
 *    (l'étudiant reçoit un message clair, pas « extraction_failed »).
 */
export async function extractPdf(
  bytes: Uint8Array,
  /** Remplaçable dans les tests ; par défaut rendu PNG → Mathpix → vision. */
  ocrPage: (index: number) => Promise<string | null> = (i) => ocrPdfPage(bytes, i + 1),
  /** Remplaçable dans les tests ; par défaut rendu PNG → vision (lignes « [Abbildung …] »). */
  describeFigures: (index: number, aufgabeBefore: string | null) => Promise<string | null> = (i, a) =>
    describeFiguresOf(bytes, i, a),
): Promise<ExtractedDoc> {
  // unpdf/pdf.js hängt den gelesenen ArrayBuffer ab, also bekommt es eine Kopie
  // und `bytes` bleibt für die Transkription unten unversehrt.
  const pdf = await getDocumentProxy(bytes.slice());
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = (text as string[]).map((p) => p ?? "");

  const { text: joined, ocr, unreadablePages } = await recoverPdfPages(pages, ocrPage);
  if (unreadablePages.length) {
    console.warn(`[extract] ${unreadablePages.length} Seite(n) unlesbar, auch nach OCR (Seiten ${unreadablePages.slice(0, 10).join(", ")})`);
  }

  // Les schémas : la couche texte ne les contient pas (« Gegeben ist folgende
  // Schaltung » suivi de… rien). Les pages qui en portent sont décrites par la
  // vision, et la description est ajoutée au texte de la page.
  let withFigures = joined;
  try {
    const stats = await pageFigureStats(pdf);
    const targets = figurePages(stats).filter((i) => !unreadablePages.includes(i + 1));
    withFigures = await addFigureDescriptions(joined, targets, (i, task) => describeFigures(i, task));
  } catch (err) {
    // Jamais bloquant : le document reste utilisable sans les descriptions.
    console.warn("[extract] Abbildungen nicht beschrieben:", err instanceof Error ? err.message : err);
  }
  return { text: withFigures, pageCount: totalPages, ocr };
}

// ── Abbildungen (schémas, croquis, diagrammes) ─────────────────────────────

/** Au plus autant de pages décrites par la vision, par document (coût). */
export const MAX_FIGURE_PAGES = 20;
/** Une image plus petite (icône, puce, logo) n'est pas une figure. */
const MIN_FIGURE_PX = 80;

export interface PageFigureStats {
  /** Images d'au moins MIN_FIGURE_PX × MIN_FIGURE_PX. */
  images: number;
  /** Tracés vectoriels (constructPath). */
  paths: number;
}

/** Compte, page par page, les images et les tracés (pdf.js, liste d'opérateurs). */
export async function pageFigureStats(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<PageFigureStats[]> {
  const { OPS } = await getResolvedPDFJS();
  const imageOps = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageXObjectRepeat]);
  const out: PageFigureStats[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { fnArray, argsArray } = await page.getOperatorList();
    let images = 0;
    let paths = 0;
    fnArray.forEach((fn, k) => {
      if (fn === OPS.constructPath) paths++;
      else if (imageOps.has(fn)) {
        const args = argsArray[k] as unknown[] | undefined;
        const w = Number(args?.[1] ?? MIN_FIGURE_PX);
        const h = Number(args?.[2] ?? MIN_FIGURE_PX);
        if (w >= MIN_FIGURE_PX && h >= MIN_FIGURE_PX) images++;
      }
    });
    out.push({ images, paths });
  }
  return out;
}

/**
 * Les pages (0-based) qui portent une figure. Ce qui se répète sur toutes les
 * pages (logo, en-tête, cadre) forme la ligne de base et ne compte pas :
 *   · une image de plus que la page qui en a le moins ;
 *   · ou deux fois plus de tracés que la page médiane (schéma vectoriel).
 */
export function figurePages(stats: PageFigureStats[], max = MAX_FIGURE_PAGES): number[] {
  if (stats.length === 0) return [];
  const baseImages = stats.length >= 3 ? Math.min(...stats.map((s) => s.images)) : 0;
  const sorted = stats.map((s) => s.paths).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const vectorThreshold = stats.length >= 3 ? Math.max(2 * median, 60) : 60;
  return stats
    .map((s, i) => ({ i, hit: s.images > baseImages || s.paths >= vectorThreshold }))
    .filter((x) => x.hit)
    .map((x) => x.i)
    .slice(0, max);
}

/** La dernière « Aufgabe N » avant ce point : une page peut commencer au milieu d'une Aufgabe. */
export function lastTaskBefore(text: string): string | null {
  const all = [...text.matchAll(/^\s*(?:Aufgabe|Übung|Uebung|Exercise|Exercice)\s+(\d+(?:\.\d+)*)\b/gim)];
  return all.length ? all[all.length - 1][1] : null;
}

/**
 * Ajoute à la fin de chaque page visée les descriptions de ses figures.
 * `describe(i, aufgabe)` rend les lignes « [Abbildung …] » de la page i
 * (0-based), ou null. Le texte garde ses marqueurs [[SEITE n]].
 */
export async function addFigureDescriptions(
  text: string,
  pageIndexes: number[],
  describe: (pageIndex: number, aufgabeBefore: string | null) => Promise<string | null>,
): Promise<string> {
  if (pageIndexes.length === 0) return text;
  const parts = text.split(/(?=\[\[SEITE \d+\]\])/);
  const byPage = new Map<number, number>();
  parts.forEach((p, k) => {
    const m = /^\[\[SEITE (\d+)\]\]/.exec(p);
    if (m) byPage.set(Number(m[1]) - 1, k);
  });
  const jobs = pageIndexes
    .map((i) => ({ i, k: byPage.get(i) }))
    .filter((j): j is { i: number; k: number } => j.k !== undefined);
  // Quatre pages à la fois : l'import d'un poly de 20 schémas reste sous la minute.
  for (let start = 0; start < jobs.length; start += 4) {
    await Promise.all(
      jobs.slice(start, start + 4).map(async ({ i, k }) => {
        const before = lastTaskBefore(parts.slice(0, k).join("\n"));
        const lines = (await describe(i, before).catch(() => null))
          ?.split("\n")
          .map((l) => l.trim())
          .filter((l) => /^\[Abbildung/i.test(l));
        if (lines?.length) parts[k] = `${parts[k].trimEnd()}\n\n${lines.join("\n")}\n\n`;
      }),
    );
  }
  return parts.join("").trim();
}

const FIGURE_PROMPT = (aufgabe: string | null) =>
  "Auf dieser Seite eines Übungsblatts oder Skripts stehen Abbildungen " +
  "(Schaltpläne, Kräfteskizzen, Diagramme, Tabellen als Bild). Beschreibe JEDE " +
  "Abbildung einzeln, exakt und vollständig, in der Sprache des Dokuments. " +
  "Genau EINE Zeile pro Abbildung, in diesem Format:\n" +
  "[Abbildung — zu Aufgabe <Nr> <Buchstabe>) — <was es ist>: <alle Bauteile mit " +
  "Bezeichnung und Wert mit Einheit, z. B. R1 = 100 Ω>; Netzliste: <für JEDES Bauteil " +
  "die zwei Knoten, zwischen denen es liegt, z. B. U0: K1–K0, S1: K1–K2, L2: K1–K2, " +
  "L1: K2–K0>; Topologie: <daraus abgeleitet, was in Reihe und was parallel liegt, " +
  "Schalterstellung>; <Pfeile und Zählrichtungen mit Bezeichnung und gegebenem Wert, " +
  "z. B. I2 = 25 mA>]\n" +
  "Für Schaltpläne: Verfolge jede Leitung von Ende zu Ende, nummeriere die Knoten " +
  "(K0 = unterer Bezugsknoten) und leite Reihe/parallel NUR aus der Netzliste ab: " +
  "Zwei Bauteile zwischen denselben zwei Knoten sind parallel. " +
  "Die Teilaufgabe ist die, deren Text direkt ÜBER der Abbildung steht. Steht die " +
  "Abbildung vor den Teilaufgaben, schreibe „zu Aufgabe <Nr> (Grundschaltung)“. " +
  (aufgabe
    ? `Beginnt die Seite mitten in einer Aufgabe, ist es Aufgabe ${aufgabe}. `
    : "") +
  "Erfinde nichts: Unlesbares heißt „unleserlich“. Keine Abbildung auf der Seite: " +
  "gib nichts aus. Gib NUR diese Zeilen aus.";

/** Rend la page et la fait décrire par la vision. null si quoi que ce soit échoue. */
async function describeFiguresOf(bytes: Uint8Array, pageIndex: number, aufgabe: string | null): Promise<string | null> {
  const png = await renderPdfPage(bytes, pageIndex + 1);
  if (!png) return null;
  try {
    const { text } = await generateText({
      model: gateway(PRIMARY_MODEL),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: FIGURE_PROMPT(aufgabe) },
            { type: "file", data: png, mediaType: "image/png" },
          ],
        },
      ],
    });
    return text.trim();
  } catch (err) {
    console.warn(`[extract] Abbildungen Seite ${pageIndex + 1}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** Rend la page n (1-based) en PNG, puis Mathpix → vision. null si tout échoue. */
async function ocrPdfPage(bytes: Uint8Array, pageNumber: number): Promise<string | null> {
  const png = await renderPdfPage(bytes, pageNumber);
  return png ? ocrImageText(png, "image/png") : null;
}

/** La page n (1-based) en PNG (échelle 2), ou null. */
async function renderPdfPage(bytes: Uint8Array, pageNumber: number): Promise<Uint8Array | null> {
  // Specifier bewusst nicht literal, damit der Release-Bundler @napi-rs/canvas
  // als externen Laufzeit-Import behandelt und das native .node-Addon nicht in
  // eine zweite Ausgabedatei splittet — das bricht `bun build --outfile`.
  const canvasPkg = ["@napi-rs", "canvas"].join("/");
  let png: Uint8Array;
  try {
    // renderPageAsImage verbraucht den Puffer, also jedes Mal eine frische Kopie.
    const rendered = (await renderPageAsImage(bytes.slice(), pageNumber, {
      scale: 2,
      canvasImport: () => import(canvasPkg) as never,
    })) as ArrayBuffer;
    png = new Uint8Array(rendered);
  } catch (err) {
    console.warn(`[extract] Seite ${pageNumber} nicht renderbar:`, err instanceof Error ? err.message : err);
    return null;
  }
  return png;
}

/**
 * Image → texte : Mathpix d'abord (quand MATHPIX_APP_ID/KEY sont posés et que
 * le format s'y prête), la vision Claude en filet. null si les deux échouent
 * (pas de clé IA, panne réseau…) — l'appelant décide de la suite.
 */
export async function ocrImageText(
  bytes: Uint8Array,
  mediaType: string,
  vision: (bytes: Uint8Array, mediaType: string) => Promise<string> = visionTranscribe,
): Promise<string | null> {
  const mp = await tryMathpix(bytes, mediaType);
  if (mp && assessPageText(mp).verdict === "ok") return mp;
  try {
    return await vision(bytes, mediaType);
  } catch (err) {
    console.warn("[extract] vision indisponible :", err instanceof Error ? err.message : err);
    return null;
  }
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

/** Formats que Mathpix lit directement ; il reçoit au plus 8 Mo. */
const MATHPIX_TYPES = new Set(["image/png", "image/jpeg"]);
const MATHPIX_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Photo d'exercice ou de tableau → texte + LaTeX.
 *
 * Mathpix d'abord (quand MATHPIX_APP_ID/KEY sont posés) : c'est un OCR fait
 * pour les formules, il rend du LaTeX exact là où une transcription
 * générale approxime les indices et les fractions. Claude Vision reste le
 * filet : sans clé, sur un format que Mathpix ne lit pas, en cas d'erreur,
 * ou s'il ne trouve presque rien (photo de schéma sans texte).
 */
/** Texte Mathpix d'une image, ou null (pas de clé, format, erreur, presque rien). */
async function tryMathpix(bytes: Uint8Array, mediaType: string): Promise<string | null> {
  if (!mathpixConfigured() || !MATHPIX_TYPES.has(mediaType) || bytes.byteLength > MATHPIX_MAX_BYTES) return null;
  try {
    const dataUrl = `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
    const { text } = await mathpixOcr(dataUrl);
    return text.trim().length >= 40 ? text : null;
  } catch (err) {
    console.warn("[extract] Mathpix indisponible, repli sur la vision :", err instanceof Error ? err.message : err);
    return null;
  }
}

async function extractImage(bytes: Uint8Array, mediaType: string): Promise<ExtractedDoc> {
  const mp = await tryMathpix(bytes, mediaType);
  if (mp) return { text: `[[SEITE 1]]\n${cleanPage(mp)}`, pageCount: 1, ocr: true };
  // Ici l'erreur de la vision remonte telle quelle : pour une photo, le
  // message « Bild konnte nicht verarbeitet werden » existe déjà côté client.
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
