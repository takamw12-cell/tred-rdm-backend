/**
 * Vérification des citations du tuteur (2026-11-14).
 *
 * Le tuteur cite avec [[QUELLE doc="<Titel>" seite=<n>]]phrase[[/QUELLE]].
 * Jusqu'ici, rien ne contrôlait ce marqueur : le numéro de page était ignoré,
 * et un titre qui ne correspondait à aucun document ouvrait… le premier de la
 * liste. Un modèle peut se tromper de page, écorcher un titre, ou « citer »
 * une phrase qu'il a reformulée. L'étudiant, lui, voit une référence.
 *
 * Ici, chaque citation est confrontée aux documents DE CET ÉTUDIANT :
 *
 *   1. le document existe-t-il (par son titre, de façon tolérante) ?
 *   2. la phrase citée y est-elle vraiment, et sur quelle page ?
 *   3. la page annoncée est-elle la bonne ? Sinon on donne la vraie.
 *
 * Le verdict décide de ce que l'interface affiche : un badge vérifié qui ouvre
 * le PDF à la bonne page, un badge sans coche quand la phrase n'a pas été
 * retrouvée mot pour mot, ou rien de cliquable quand le document n'existe pas.
 *
 * Module pur : ni base, ni réseau. La route (api/index.ts) lui donne les
 * documents de la session — jamais ceux d'un autre compte.
 */

export interface CitedDoc {
  id: string;
  title: string;
  pageCount: number;
  /** Texte extrait, avec ses marques [[SEITE n]]. */
  textContent: string;
}

export interface CitationInput {
  /** Le titre écrit par le tuteur (`doc="…"`), s'il y en a un. */
  doc: string | null;
  /** La page écrite par le tuteur (`seite=n`), s'il y en a une. */
  page: number | null;
  /** La phrase entre les marqueurs. */
  excerpt: string;
}

export type CitationStatus =
  /** La phrase est dans ce document, à la page annoncée (ou le tuteur n'annonçait pas de page). */
  | "verified"
  /** La phrase est dans ce document, mais sur une AUTRE page : `page` est la vraie. */
  | "page_corrected"
  /** Le document existe, la phrase n'y a pas été retrouvée. `page` : la page citée si elle existe, sinon `null`. */
  | "quote_not_found"
  /** Aucun document de l'étudiant ne correspond, et la phrase n'est nulle part. */
  | "unknown_document";

export interface CitationVerdict {
  status: CitationStatus;
  documentId: string | null;
  title: string | null;
  page: number | null;
  /** La page écrite par le tuteur, telle quelle. */
  citedPage: number | null;
}

/* ── Titres ───────────────────────────────────────────────────────────── */

/** « Thermo_Kapitel_3.pdf » → « thermo kapitel 3 ». */
export function normTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\.(pdf|docx|pptx|txt|md|csv|png|jpe?g|webp|heic)$/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Les documents que ce titre désigne. Égalité d'abord ; sinon l'un contient
 * l'autre (« Skript Kapitel 3 » pour « ET2_Skript_Kapitel_3_final »). Rien ne
 * ressemble : liste vide — on ne choisit JAMAIS un document par défaut.
 */
export function docsByTitle<T extends { title: string }>(docs: readonly T[], title: string | null): T[] {
  const wanted = normTitle(title ?? "");
  if (wanted.length < 2) return [];
  const exact = docs.filter((d) => normTitle(d.title) === wanted);
  if (exact.length > 0) return exact;
  if (wanted.length < 4) return [];
  return docs.filter((d) => {
    const have = normTitle(d.title);
    return have.length >= 4 && (have.includes(wanted) || wanted.includes(have));
  });
}

/* ── Texte ────────────────────────────────────────────────────────────── */

/**
 * Ce qui reste d'un texte quand on retire tout ce qui diffère entre le PDF et
 * la citation sans changer le sens : casse, accents, ponctuation, retours à la
 * ligne — et la notation LaTeX, que le tuteur DOIT employer même dans une
 * citation (« $U = R \cdot I$ » pour « U = R · I »).
 */
export function normText(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\\[a-zA-Z]+/g, " ")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

interface Page {
  page: number;
  norm: string;
}

/** Le texte d'un document, page par page (marques [[SEITE n]]), déjà normalisé. */
export function pagesOf(textContent: string): Page[] {
  const parts = textContent.split(/\[\[SEITE (\d+)\]\]/);
  const pages: Page[] = [];
  if (parts[0]?.trim()) pages.push({ page: 1, norm: normText(parts[0]) });
  for (let i = 1; i < parts.length; i += 2) pages.push({ page: Number(parts[i]), norm: normText(parts[i + 1] ?? "") });
  return pages;
}

/** Trop courte pour prouver quoi que ce soit (« siehe oben »). */
const MIN_QUOTE = 12;
const SHINGLE = 3;

const shingles = (norm: string): string[] => {
  const words = norm.split(" ").filter((w) => w.length >= 3);
  const out: string[] = [];
  for (let i = 0; i + SHINGLE <= words.length; i++) out.push(words.slice(i, i + SHINGLE).join(" "));
  return out;
};

export interface QuoteHit {
  page: number;
  /** Retrouvée mot pour mot (à la normalisation près) — et non « presque ». */
  exact: boolean;
}

/**
 * Où la phrase se trouve-t-elle ? D'abord mot pour mot, sur une page ou à
 * cheval sur deux. Sinon « presque » : au moins 60 % de ses suites de trois
 * mots sur une même page — une virgule de moins, une formule recopiée
 * autrement, pas une reformulation.
 */
export function findQuote(pages: readonly Page[], excerpt: string): QuoteHit | null {
  const quote = normText(excerpt);
  if (quote.length < MIN_QUOTE) return null;

  for (const p of pages) if (p.norm.includes(quote)) return { page: p.page, exact: true };
  for (let i = 0; i + 1 < pages.length; i++) {
    if (`${pages[i]!.norm} ${pages[i + 1]!.norm}`.includes(quote)) return { page: pages[i]!.page, exact: true };
  }

  const wanted = shingles(quote);
  if (wanted.length < 3) return null;
  let best: { page: number; hits: number } | null = null;
  for (const p of pages) {
    const have = new Set(shingles(p.norm));
    const hits = wanted.reduce((n, s) => n + (have.has(s) ? 1 : 0), 0);
    if (!best || hits > best.hits) best = { page: p.page, hits };
  }
  if (best && best.hits >= 3 && best.hits / wanted.length >= 0.6) return { page: best.page, exact: false };
  return null;
}

/* ── Verdict ──────────────────────────────────────────────────────────── */

export function verifyCitation(input: CitationInput, docs: readonly CitedDoc[]): CitationVerdict {
  const citedPage = input.page !== null && Number.isInteger(input.page) && input.page > 0 ? input.page : null;
  const found = (doc: CitedDoc, hit: QuoteHit): CitationVerdict => ({
    status: citedPage === null || citedPage === hit.page ? "verified" : "page_corrected",
    documentId: doc.id,
    title: doc.title,
    page: hit.page,
    citedPage,
  });

  // 1. Dans le ou les documents que le titre désigne.
  const named = docsByTitle(docs, input.doc);
  for (const doc of named) {
    const hit = findQuote(pagesOf(doc.textContent), input.excerpt);
    if (hit) return found(doc, hit);
  }

  // 2. Le titre ne désigne rien, ou la phrase n'y est pas : la phrase tranche,
  // si elle existe MOT POUR MOT dans un seul autre document de l'étudiant.
  const elsewhere = docs
    .filter((d) => !named.includes(d))
    .map((doc) => ({ doc, hit: findQuote(pagesOf(doc.textContent), input.excerpt) }))
    .filter((x): x is { doc: CitedDoc; hit: QuoteHit } => x.hit !== null && x.hit.exact);
  if (elsewhere.length === 1) {
    const { doc, hit } = elsewhere[0]!;
    // Le tuteur a nommé un autre document : la page qu'il annonçait ne vaut rien ici.
    return { status: "page_corrected", documentId: doc.id, title: doc.title, page: hit.page, citedPage };
  }

  // 3. Le document existe, la phrase n'y est pas : la page citée n'est gardée que si elle existe.
  if (named.length > 0) {
    const doc = named[0]!;
    const pageExists = citedPage !== null && citedPage <= Math.max(doc.pageCount, pagesOf(doc.textContent).length);
    return { status: "quote_not_found", documentId: doc.id, title: doc.title, page: pageExists ? citedPage : null, citedPage };
  }

  return { status: "unknown_document", documentId: null, title: null, page: null, citedPage };
}
