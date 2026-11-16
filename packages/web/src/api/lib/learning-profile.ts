/**
 * « Mein Lernprofil » (2026-11-16) : les forces et les faiblesses de
 * l'étudiant par matière, et un plan de révision sur 7 jours.
 *
 * ── Rien n'est rédigé par un modèle ───────────────────────────────────────
 *
 * Tout part de ce que le tuteur a DÉJÀ mesuré (lib/concept-mastery.ts) : un
 * score par concept et le type d'erreur quand la réponse était fausse. Ici, on
 * lit, on compte et on range :
 *
 *   - le profil : par matière, combien de concepts sont sûrs, en construction,
 *     fragiles ; les concepts les plus sûrs, les plus fragiles, les erreurs
 *     les plus fréquentes ;
 *   - le plan : les cinq concepts les plus fragiles, répartis sur sept jours
 *     selon la révision espacée (apprendre, se remémorer deux jours plus tard,
 *     appliquer cinq jours plus tard, auto-test le dernier jour) ;
 *   - les pages : pour chaque concept, les pages des documents DE L'ÉTUDIANT
 *     où il est écrit.
 *
 * Conséquences voulues : le plan ne coûte rien, il s'affiche tout de suite, et
 * il ne peut pas inventer — ni un concept, ni une page.
 *
 * ── Une page n'est citée que si le concept y est écrit ────────────────────
 *
 * On cherche le concept dans le texte de chaque page (marques [[SEITE n]] de
 * lib/extract.ts), après repliement (casse, trémas, accents). Trois règles :
 *
 *   1. le mot doit COMMENCER un mot de la page : « Arbeit » trouve
 *      « Arbeitssatz », pas « Bearbeitung » ;
 *   2. la fin du mot est libre, parce que l'allemand fléchit : « Kreisprozess »
 *      trouve « Kreisprozesse », « erster Hauptsatz » trouve « erste
 *      Hauptsatz » ;
 *   3. pour un concept en plusieurs mots, on veut la tournure ; à défaut, tous
 *      ses mots porteurs sur la MÊME page.
 *
 * Rien trouvé : aucune page. Il n'y a pas de page par défaut.
 *
 * Module sans réseau ; seule `learnerProfile` lit la base.
 */
import { sql } from "drizzle-orm";
import { ERROR_TYPES, WEAK_BELOW, missingTable, topErrors, type ConceptState, type ErrorType, type MasteryDb, type SubjectMastery } from "./concept-mastery";

/* ── Les pages d'un concept ───────────────────────────────────────────── */

export interface PlanDoc {
  id: string;
  title: string;
  kind: string;
  /** Texte extrait, avec ses marques [[SEITE n]]. */
  textContent: string;
}

export interface PageRef {
  documentId: string;
  title: string;
  /** `null` : le document n'a pas de pages (notes, .txt) — il est cité sans numéro. */
  page: number | null;
  /** Combien de fois le concept est écrit sur cette page. */
  hits: number;
}

/** Pour apprendre, le cours vaut mieux que l'annale qui pose la question. */
const KIND_RANK: Record<string, number> = { vorlesung: 0, uebung: 1, other: 2, klausur: 3 };
const kindRank = (kind: string) => KIND_RANK[kind] ?? 2;

/** Mots qui ne portent pas le concept (« erster Hauptsatz DER Thermodynamik »). */
const SMALL = new Set(["eine", "einer", "eines", "einem", "einen", "nach", "beim", "ueber", "fuer", "unter", "zwischen", "with", "from", "pour", "dans", "avec", "para"]);

/**
 * Le texte replié : minuscules, ä→ae, ö→oe, ü→ue, ß→ss, sans accents, et tout
 * ce qui n'est ni lettre ni chiffre devient une espace. Comparaison seulement.
 * (Même repliement que lib/search-text.ts, appliqué à la chaîne entière : un
 * polycopié fait 400 000 caractères.)
 */
function foldText(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Les deux dernières lettres d'un mot long sont une terminaison possible (-e, -en, -er, -es). */
const stemOf = (token: string, from: number) => (token.length >= from ? token.slice(0, -2) : token);

interface Matcher {
  /** La tournure, mots consécutifs (un ou deux petits mots peuvent s'intercaler). */
  phrase: RegExp;
  /** Les mots porteurs, un par un — pour « tous sur la même page ». Vide pour un concept d'un seul mot. */
  each: RegExp[];
}

function matcherFor(concept: string): Matcher | null {
  const tokens = foldText(concept).split(" ").filter(Boolean).slice(0, 10);
  if (tokens.join("").length < 3) return null;
  const single = tokens.length === 1;
  // Les mots sont faits de [a-z0-9] : rien à échapper dans l'expression.
  const word = (t: string, from: number) => ` ${stemOf(t, from)}[a-z0-9]*`;
  const phrase = new RegExp(tokens.map((t) => word(t, single ? 8 : 6)).join("(?: [a-z0-9]{1,3}){0,2}"), "g");
  const carriers = tokens.filter((t) => t.length >= 4 && !SMALL.has(t));
  const each = !single && carriers.length >= 2 ? carriers.map((t) => new RegExp(word(t, 6), "g")) : [];
  return { phrase, each };
}

interface IndexedPage {
  page: number | null;
  /** Texte replié, précédé d'une espace : chaque mot commence après une espace. */
  words: string;
}

/** Un document découpé et replié une seule fois, même si cinq concepts y sont cherchés. */
const indexed = new WeakMap<PlanDoc, IndexedPage[]>();

function pagesOfDoc(doc: PlanDoc): IndexedPage[] {
  const known = indexed.get(doc);
  if (known) return known;

  const text = doc.textContent ?? "";
  const parts = text.split(/\[\[SEITE (\d+)\]\]/);
  let pages: IndexedPage[];
  if (parts.length === 1) {
    pages = [{ page: null, words: ` ${foldText(text)}` }];
  } else {
    const byPage = new Map<number, string>();
    const add = (page: number, chunk: string) => byPage.set(page, `${byPage.get(page) ?? ""} ${chunk}`);
    // Du texte avant la première marque : c'est le haut de la première page.
    if (parts[0]?.trim()) add(1, parts[0]);
    for (let i = 1; i < parts.length; i += 2) add(Number(parts[i]), parts[i + 1] ?? "");
    pages = [...byPage].map(([page, chunk]) => ({ page, words: ` ${foldText(chunk)}` }));
  }
  indexed.set(doc, pages);
  return pages;
}

const count = (words: string, re: RegExp) => words.match(re)?.length ?? 0;

/**
 * Les pages où `concept` est écrit, les plus fournies d'abord : `max` au plus.
 * Liste vide s'il n'est écrit nulle part — l'appelant n'affiche alors aucune page.
 */
export function conceptPages(docs: readonly PlanDoc[], concept: string, max = 2): PageRef[] {
  const matcher = matcherFor(concept);
  if (!matcher) return [];

  const found: (PageRef & { rank: number; order: number })[] = [];
  const collect = (hitsOn: (words: string) => number) => {
    docs.forEach((doc, order) => {
      for (const p of pagesOfDoc(doc)) {
        const hits = hitsOn(p.words);
        if (hits > 0) found.push({ documentId: doc.id, title: doc.title, page: p.page, hits, rank: kindRank(doc.kind), order });
      }
    });
  };

  collect((words) => count(words, matcher.phrase));
  // La tournure n'est nulle part : les pages qui portent TOUS les mots du concept.
  if (found.length === 0 && matcher.each.length > 0) {
    collect((words) => Math.min(...matcher.each.map((re) => count(words, re))));
  }

  return found
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank || a.order - b.order || (a.page ?? 0) - (b.page ?? 0))
    .slice(0, Math.max(1, Math.floor(max)))
    .map(({ documentId, title, page, hits }) => ({ documentId, title, page, hits }));
}

/**
 * Le mot à donner à SQL pour dégrossir : le plus long du concept, tel qu'il
 * est écrit. SQL écarte les documents sans rapport ; `conceptPages` tranche.
 */
export function searchTerm(concept: string): string | null {
  const words = concept.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
  if (words.length === 0) return null;
  return words.reduce((longest, w) => (w.length > longest.length ? w : longest));
}

/* ── Le plan sur 7 jours ──────────────────────────────────────────────── */

export const PLAN_DAYS = 7;
/** Cinq concepts : au-delà, la semaine devient une liste qu'on ne finit pas. */
export const MAX_PLAN_CONCEPTS = 5;
/** Révision espacée : se remémorer deux jours après, appliquer cinq jours après. */
const RECALL_AFTER = 2;
const APPLY_AFTER = 5;

/** Ce que le plan sait d'un concept fragile. */
export interface PlanConcept {
  concept: string;
  topic: string;
  score: number;
  errors: { type: ErrorType; count: number }[];
  refs: PageRef[];
}

export type PlanTaskKind = "learn" | "recall" | "apply" | "selftest";

export interface PlanTask {
  /** Stable d'un calcul à l'autre : c'est la clé des coches de l'étudiant. */
  id: string;
  kind: PlanTaskKind;
  /** Le concept travaillé ; `null` pour l'auto-test, qui les couvre tous. */
  concept: string | null;
  topic: string;
  /** Les pages à lire (tâche « learn »). Vide : le concept n'est écrit dans aucun document. */
  refs: PageRef[];
  /** L'erreur la plus fréquente sur ce concept, à surveiller. */
  errorType: ErrorType | null;
  /** Auto-test : les concepts de la semaine. */
  concepts: string[];
}

export interface PlanDay {
  day: number;
  tasks: PlanTask[];
}

export interface StudyPlan {
  /** Les concepts de la semaine, le plus fragile d'abord. */
  concepts: string[];
  days: PlanDay[];
}

/**
 * Le plan : `null` s'il n'y a aucun concept fragile — on n'invente pas une
 * semaine de révision pour quelqu'un dont on ne sait rien.
 *
 *   concept n° i (0 = le plus fragile)  →  appris le jour i+1,
 *                                           remémoré le jour i+3,
 *                                           appliqué le jour i+6 ;
 *   jour 7                               →  auto-test sur tous.
 *
 * Ce qui tomberait le jour 7 n'est pas ajouté : l'auto-test le couvre.
 */
export function buildStudyPlan(weak: readonly PlanConcept[]): StudyPlan | null {
  const chosen = [...weak].sort((a, b) => a.score - b.score).slice(0, MAX_PLAN_CONCEPTS);
  if (chosen.length === 0) return null;

  const days: PlanDay[] = Array.from({ length: PLAN_DAYS }, (_, i) => ({ day: i + 1, tasks: [] }));
  const put = (day: number, kind: PlanTaskKind, index: number, c: PlanConcept) => {
    if (day >= PLAN_DAYS) return;
    days[day - 1]!.tasks.push({
      id: `d${day}-${kind}-${index}`,
      kind,
      concept: c.concept,
      topic: c.topic,
      refs: kind === "learn" ? c.refs : [],
      errorType: kind === "learn" ? (c.errors[0]?.type ?? null) : null,
      concepts: [],
    });
  };

  // Dans une journée : d'abord le nouveau, puis ce qu'on se remémore, puis ce qu'on applique.
  chosen.forEach((c, i) => put(i + 1, "learn", i, c));
  chosen.forEach((c, i) => put(i + 1 + RECALL_AFTER, "recall", i, c));
  chosen.forEach((c, i) => put(i + 1 + APPLY_AFTER, "apply", i, c));

  const concepts = chosen.map((c) => c.concept);
  days[PLAN_DAYS - 1]!.tasks.push({ id: `d${PLAN_DAYS}-selftest-0`, kind: "selftest", concept: null, topic: "", refs: [], errorType: null, concepts });
  return { concepts, days };
}

/* ── Le profil, lu en base ────────────────────────────────────────────── */

/** À partir de ce score, le concept est « sûr » (deux bonnes réponses de suite y mènent). */
export const STRONG_FROM = 0.7;

export interface SubjectProfile extends SubjectMastery {
  /** Concepts sûrs (score ≥ 0,7). */
  strong: number;
  /** Ni sûrs ni fragiles. */
  building: number;
  /** Concepts fragiles (score < 0,6) : ceux que le tuteur reprend plus lentement. */
  weak: number;
}

export interface LearnerProfile {
  /** Faux tant que la table n'existe pas : la section ne s'affiche pas. */
  available: boolean;
  subjects: SubjectProfile[];
  strengths: ConceptState[];
  weaknesses: ConceptState[];
  errorTypes: { type: ErrorType; count: number }[];
  totals: { concepts: number; attempts: number };
}

const EMPTY: Omit<LearnerProfile, "available"> = { subjects: [], strengths: [], weaknesses: [], errorTypes: [], totals: { concepts: 0, attempts: 0 } };
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Le profil de CE compte, en une lecture (300 concepts au plus par compte).
 * Ne lève jamais pour une migration manquante.
 */
export async function learnerProfile(db: MasteryDb, userId: string): Promise<LearnerProfile> {
  let rows: { concept: string; topic: string; score: number; attempts: number; error_patterns: string; last_seen: number }[];
  try {
    rows = await db.all(sql`
      SELECT concept, topic, score, attempts, error_patterns, last_seen
        FROM concept_mastery
       WHERE user_id = ${userId} AND attempts >= 1`);
  } catch (error) {
    if (!missingTable(error)) throw error;
    return { available: false, ...EMPTY };
  }

  const concepts = rows.map((r) => ({
    concept: r.concept,
    topic: r.topic || "Allgemein",
    score: round3(Number(r.score)),
    attempts: Number(r.attempts),
    patterns: r.error_patterns ?? "{}",
    lastSeen: Number(r.last_seen),
  }));
  const state = (c: (typeof concepts)[number]): ConceptState => ({ concept: c.concept, topic: c.topic, score: c.score, attempts: c.attempts, errors: topErrors(c.patterns) });

  const bySubject = new Map<string, { sum: number; strong: number; building: number; weak: number; n: number }>();
  for (const c of concepts) {
    const s = bySubject.get(c.topic) ?? { sum: 0, strong: 0, building: 0, weak: 0, n: 0 };
    s.sum += c.score;
    s.n += 1;
    if (c.score >= STRONG_FROM) s.strong += 1;
    else if (c.score < WEAK_BELOW) s.weak += 1;
    else s.building += 1;
    bySubject.set(c.topic, s);
  }
  const subjects = [...bySubject]
    .map(([topic, s]) => ({ topic, score: round3(s.sum / s.n), concepts: s.n, strong: s.strong, building: s.building, weak: s.weak }))
    .sort((a, b) => b.concepts - a.concepts || a.topic.localeCompare(b.topic, "de"))
    .slice(0, 8);

  const errorTotals = new Map<ErrorType, number>();
  for (const c of concepts) for (const e of topErrors(c.patterns, ERROR_TYPES.length)) errorTotals.set(e.type, (errorTotals.get(e.type) ?? 0) + e.count);
  const errorTypes = ERROR_TYPES.filter((type) => errorTotals.has(type))
    .map((type) => ({ type, count: errorTotals.get(type)! }))
    .sort((a, b) => b.count - a.count);

  return {
    available: true,
    subjects,
    strengths: concepts
      .filter((c) => c.score >= STRONG_FROM)
      .sort((a, b) => b.score - a.score || b.lastSeen - a.lastSeen)
      .slice(0, 3)
      .map(state),
    weaknesses: concepts
      .filter((c) => c.score < WEAK_BELOW)
      .sort((a, b) => a.score - b.score || b.lastSeen - a.lastSeen)
      .slice(0, MAX_PLAN_CONCEPTS)
      .map(state),
    errorTypes,
    totals: { concepts: concepts.length, attempts: concepts.reduce((n, c) => n + c.attempts, 0) },
  };
}
