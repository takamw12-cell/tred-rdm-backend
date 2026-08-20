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
    let order = 0;
    for (let start = 0; start < text.length; start += CHUNK_CHARS - CHUNK_OVERLAP) {
      const slice = text.slice(start, start + CHUNK_CHARS);
      if (slice.trim().length < 40) continue;
      const terms = new Map<string, number>();
      for (const t of tokenize(slice)) terms.set(t, (terms.get(t) ?? 0) + 1);
      chunks.push({ docIndex, order: order++, text: slice, terms, length: slice.length });
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
      sources: docs.map((d) => ({ ...d, content: d.content.slice(0, per) })),
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
      sources: docs.map((d) => ({ ...d, content: d.content.slice(0, per) })),
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
      // Lücke im Original markieren, damit das Modell nicht falsch verknüpft.
      if (prevOrder >= 0 && c.order !== prevOrder + 1) parts.push("[…]");
      parts.push(c.text.trim());
      prevOrder = c.order;
    }
    sources.push({ title: doc.title, kind: doc.kind, content: parts.join("\n") });
  }

  return { sources, truncated: true };
}
