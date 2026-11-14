import { wellFormed } from "./unicode-safe";

// Relevanz-Auswahl für den Kurskontext.
//
// Vorher ging bei jeder Frage der komplette Text aller Dokumente an das Modell
// (bis zu 300.000 Zeichen ≈ 75.000 Token, also ~15–20 Cent pro Frage). Das ist
// weder bezahlbar noch nötig: für eine konkrete Frage sind nur wenige Abschnitte
// relevant.
//
// Hier läuft eine rein lexikalische Auswahl (BM25-ähnlich) ohne externen Dienst,
// ohne zusätzlichen Schlüssel und ohne zusätzliche Kosten. Für Fachtexte mit
// markanten Begriffen (Biegung, Torsion, Flächenträgheitsmoment) funktioniert
// das gut. Später ließe sich das durch Embeddings ersetzen, ohne die Aufrufer
// zu ändern.

export interface SourceDoc {
  /** Identifiant du document : il suit chaque extrait jusqu'au bout (absent des anciens appels). */
  id?: string;
  title: string;
  kind: string;
  content: string;
}

interface Chunk {
  docIndex: number;
  order: number;
  text: string;
  terms: Map<string, number>;
  length: number;
  /** La page où l'extrait COMMENCE (dernière marque [[SEITE n]] à sa gauche). `null` : avant la première marque. */
  page: number | null;
}

/* ── Les pages ──────────────────────────────────────────────────────────────
 *
 * Le texte d'un document porte une marque [[SEITE n]] au début de chaque page
 * (lib/extract.ts). Un extrait de 1 400 caractères, lui, commence n'importe où
 * — le plus souvent au milieu d'une page, donc SANS marque. Avant le
 * 14 nov. 2026, le modèle recevait alors deux extraits à la suite, le premier
 * marqué « Seite 3 », le second (page 17) sans rien : il citait la page 3
 * pour un passage de la page 17. Une citation fausse est pire que pas de
 * citation.
 *
 * Désormais chaque extrait connaît la page où il commence, et la redit en
 * tête quand sa propre marque n'y est pas. Aucun extrait n'arrive au modèle
 * sans son document (l'enveloppe <dokument>) ni sa page.
 */

interface PageMark {
  at: number;
  end: number;
  page: number;
}

/** Les marques de page d'un texte, dans l'ordre. */
function pageMarks(text: string): PageMark[] {
  const marks: PageMark[] = [];
  for (const m of text.matchAll(/\[\[SEITE (\d+)\]\]/g)) marks.push({ at: m.index, end: m.index + m[0].length, page: Number(m[1]) });
  return marks;
}

/** La marque qui contient la position `at` (strictement à l'intérieur), s'il y en a une. */
const markAround = (marks: PageMark[], at: number) => marks.find((m) => m.at < at && at < m.end);

/** La page de la position `at` : la dernière marque commencée à sa gauche. */
function pageAt(marks: PageMark[], at: number): number | null {
  let page: number | null = null;
  for (const m of marks) {
    if (m.at > at) break;
    page = m.page;
  }
  return page;
}

const STARTS_WITH_MARK = /^\[\[SEITE \d+\]\]/;

/** Les pages qu'un extrait couvre, dans l'ordre et sans doublon (marques [[SEITE n]] qu'il contient). */
export function pagesIn(excerpt: string): number[] {
  const pages: number[] = [];
  for (const m of pageMarks(excerpt)) if (!pages.includes(m.page)) pages.push(m.page);
  return pages;
}

/** Début d'un document, coupé proprement : jamais au milieu d'une marque de page. */
function head(text: string, max: number): string {
  const marks = pageMarks(text);
  const cut = markAround(marks, max);
  return wellFormed(text.slice(0, cut ? cut.at : max));
}

const CHUNK_CHARS = 1400;
const CHUNK_OVERLAP = 200;

// Häufige Füllwörter tragen keine Bedeutung und würden das Ranking verwässern.
const STOPWORDS = new Set([
  // Deutsch
  "aber","alle","allem","allen","aller","alles","als","also","auch","auf","aus","bei","bin","bis","bist","dann","dass","dein","dem","den","der","des","dessen","die","dies","diese","diesem","diesen","dieser","dieses","doch","dort","durch","ein","eine","einem","einen","einer","eines","für","hat","hatte","hier","ich","ihr","ist","kann","man","mit","nach","nicht","noch","nur","oder","sein","sich","sie","sind","soll","über","und","uns","vom","von","vor","war","waren","was","wenn","werden","wie","wir","wird","wurde","zum","zur","zwischen",
  // Französisch
  "avec","aux","ces","cette","comme","dans","des","donc","elle","est","etre","être","les","leur","mais","meme","même","nous","par","pas","plus","pour","que","qui","sans","son","sont","sur","tout","une","vous",
  // Englisch
  "and","are","for","from","has","have","its","not","that","the","their","then","there","these","this","was","were","which","with","you",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

function splitIntoChunks(docs: SourceDoc[]): Chunk[] {
  const chunks: Chunk[] = [];
  docs.forEach((doc, docIndex) => {
    const text = doc.content ?? "";
    const marks = pageMarks(text);
    let order = 0;
    for (let start = 0; start < text.length; start += CHUNK_CHARS - CHUNK_OVERLAP) {
      // Jamais au milieu d'une marque de page : « TE 12]] » en tête d'extrait
      // ne dit plus rien. Le début recule jusqu'à la marque, la fin s'arrête avant.
      const from = markAround(marks, start)?.at ?? start;
      const end = Math.min(text.length, start + CHUNK_CHARS);
      const to = markAround(marks, end)?.at ?? end;
      // wellFormed : une coupure peut tomber au milieu d'un emoji ou d'un 𝑥 de
      // PDF (deux unités UTF-16). Voir unicode-safe.ts.
      const slice = wellFormed(text.slice(from, to));
      if (slice.replace(/\[\[SEITE \d+\]\]/g, "").trim().length < 40) continue;
      const terms = new Map<string, number>();
      for (const t of tokenize(slice)) terms.set(t, (terms.get(t) ?? 0) + 1);
      chunks.push({ docIndex, order: order++, text: slice, terms, length: slice.length, page: pageAt(marks, from) });
    }
  });
  return chunks;
}

/**
 * Wählt aus allen Dokumenten die für `query` relevantesten Abschnitte, bis das
 * Zeichenbudget erschöpft ist. Passt alles ins Budget, bleibt der Text
 * unverändert — kleine Kurse verlieren also nichts.
 */
export function selectRelevantContext(
  docs: SourceDoc[],
  query: string,
  budgetChars: number,
): { sources: SourceDoc[]; truncated: boolean } {
  const total = docs.reduce((n, d) => n + (d.content?.length ?? 0), 0);
  if (docs.length === 0) return { sources: [], truncated: false };
  if (total <= budgetChars) return { sources: docs, truncated: false };

  const queryTerms = new Set(tokenize(query));
  const chunks = splitIntoChunks(docs);
  if (chunks.length === 0) return { sources: docs, truncated: false };

  // Ohne brauchbare Suchbegriffe: Anfang jedes Dokuments nehmen (dort stehen
  // in Skripten Inhaltsverzeichnis und Grundlagen).
  if (queryTerms.size === 0) {
    const per = Math.floor(budgetChars / docs.length);
    return {
      sources: docs.map((d) => ({ ...d, content: head(d.content, per) })),
      truncated: true,
    };
  }

  // Dokumenthäufigkeit je Begriff → seltene Begriffe wiegen schwerer (IDF).
  const docFreq = new Map<string, number>();
  for (const c of chunks) {
    for (const term of c.terms.keys()) {
      if (queryTerms.has(term)) docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const avgLen = chunks.reduce((n, c) => n + c.length, 0) / chunks.length;
  const k1 = 1.5;
  const b = 0.75;

  const scored = chunks.map((c) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = c.terms.get(term);
      if (!tf) continue;
      const df = docFreq.get(term) ?? 1;
      const idf = Math.log(1 + (chunks.length - df + 0.5) / (df + 0.5));
      const norm = tf * (k1 + 1) / (tf + k1 * (1 - b + (b * c.length) / avgLen));
      score += idf * norm;
    }
    return { chunk: c, score };
  });

  scored.sort((x, y) => y.score - x.score);

  const picked: Chunk[] = [];
  let used = 0;
  for (const { chunk, score } of scored) {
    if (score <= 0) continue;
    if (used + chunk.length > budgetChars) continue;
    picked.push(chunk);
    used += chunk.length;
  }

  // Nichts getroffen (z. B. reine Verständnisfrage): Dokumentanfänge nehmen.
  if (picked.length === 0) {
    const per = Math.floor(budgetChars / docs.length);
    return {
      sources: docs.map((d) => ({ ...d, content: head(d.content, per) })),
      truncated: true,
    };
  }

  // Wieder in Lesereihenfolge bringen, damit Formeln und Herleitungen nicht
  // durcheinander beim Modell ankommen.
  picked.sort((x, y) => x.docIndex - y.docIndex || x.order - y.order);

  const byDoc = new Map<number, Chunk[]>();
  for (const c of picked) {
    const list = byDoc.get(c.docIndex) ?? [];
    list.push(c);
    byDoc.set(c.docIndex, list);
  }

  const sources: SourceDoc[] = [];
  for (const [docIndex, list] of [...byDoc.entries()].sort((a, b) => a[0] - b[0])) {
    const doc = docs[docIndex];
    const parts: string[] = [];
    let prevOrder = -2;
    for (const c of list) {
      const first = prevOrder < 0;
      const afterGap = !first && c.order !== prevOrder + 1;
      // Lücke im Original markieren, damit das Modell nicht falsch verknüpft.
      if (afterGap) parts.push("[…]");
      const body = c.text.trim();
      // L'extrait commence au milieu d'une page : on redit laquelle. Sans cela
      // le modèle lirait la marque de l'extrait PRÉCÉDENT et citerait sa page.
      // (Un extrait qui suit directement le précédent en est la suite : rien à redire.)
      const needsPage = (first || afterGap) && c.page !== null && !STARTS_WITH_MARK.test(body);
      parts.push(needsPage ? `[[SEITE ${c.page}]]\n${body}` : body);
      prevOrder = c.order;
    }
    sources.push({ ...(doc.id ? { id: doc.id } : {}), title: doc.title, kind: doc.kind, content: parts.join("\n") });
  }

  return { sources, truncated: true };
}
