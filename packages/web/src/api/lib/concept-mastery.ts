/**
 * Le modèle de l'apprenant : un score de maîtrise par concept (2026-11-15).
 *
 * ── Ce que ça ajoute à la mémoire du tuteur ───────────────────────────────
 *
 * lib/memory.ts retient les LACUNES : une idée fausse, en une phrase, tant
 * qu'elle n'est pas corrigée. Ici, on mesure : pour chaque concept que
 * l'étudiant a travaillé (« Wärmekapazität », « Momentengleichgewicht »), un
 * score de 0 à 1 qui suit ce qu'il MONTRE — une bonne réponse le monte, une
 * mauvaise le descend — et le type d'erreur quand il se trompe (signe, unité,
 * formule confondue…).
 *
 * Deux usages :
 *   - avant chaque réponse, les trois concepts les plus fragiles sont remis au
 *     tuteur (NIVEAU 2b) : il ralentit, ajoute une analogie, vise l'erreur
 *     typique ;
 *   - le Dashboard en tire les barres de progression par matière.
 *
 * ── D'où vient le signal ──────────────────────────────────────────────────
 *
 * Du tuteur lui-même, par l'outil `lernstand_melden` (agent/index.ts) : aucun
 * appel de modèle en plus, donc aucun coût en plus. C'est le modèle qui juge,
 * comme pour les lacunes ; la consigne lui interdit de signaler une simple
 * question ou un « d'accord ».
 *
 * ── Un confort, jamais une dépendance ─────────────────────────────────────
 *
 * Même règle que la mémoire : tant que `migre-concept-mastery.mjs` n'a pas
 * tourné, rien n'est enregistré et rien ne tombe — le chat répond comme avant.
 *
 * Données personnelles : la table porte `user_id` ; elle est exportée et
 * effacée avec le compte (lib/gdpr.ts).
 */
import { sql, type SQL } from "drizzle-orm";

export const OUTCOMES = ["richtig", "teilweise", "falsch"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const ERROR_TYPES = ["vorzeichen", "einheit", "formel", "rechenfehler", "begriff", "ansatz", "sonstiges"] as const;
export type ErrorType = (typeof ERROR_TYPES)[number];

/** Les types d'erreur, tels qu'ils sont redits au tuteur. */
export const ERROR_LABELS: Record<ErrorType, string> = {
  vorzeichen: "Vorzeichen falsch",
  einheit: "Einheit vergessen oder falsch",
  formel: "Formel verwechselt",
  rechenfehler: "Rechenfehler",
  begriff: "Begriffe verwechselt",
  ansatz: "falscher Ansatz",
  sonstiges: "sonstiger Fehler",
};

/** Un concept jamais vu : on ne sait pas encore. */
export const START_SCORE = 0.5;
/** En dessous, le concept est « fragile » : il est remis au tuteur. */
export const WEAK_BELOW = 0.6;
/** Poids de la dernière réponse. Une étourderie n'efface pas dix réussites. */
const LEARNING_RATE = 0.3;
const TARGET: Record<Outcome, number> = { richtig: 1, teilweise: 0.5, falsch: 0 };
/** Plafond par compte : le modèle ne peut pas remplir la table sans fin. */
export const MAX_CONCEPTS_PER_USER = 300;
const MAX_NAME = 80;

const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** Le score après une réponse : moyenne mobile, toujours dans [0, 1]. */
export function nextScore(previous: number, outcome: Outcome): number {
  const p = Number.isFinite(previous) ? Math.min(1, Math.max(0, previous)) : START_SCORE;
  return round3(p + LEARNING_RATE * (TARGET[outcome] - p));
}

/** Le libellé affiché : une ligne, sans balise, 80 caractères. `null` s'il ne reste rien d'utilisable. */
export function cleanConcept(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const cleaned = name
    .normalize("NFKC")
    .replace(/[\p{Cc}<>"`]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NAME)
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

/** La clé d'un concept : la même pour « Wärmekapazität », « wärmekapazität » et « Wärme-Kapazität ». */
export function conceptKey(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("de")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .slice(0, MAX_NAME);
}

function parseErrors(json: string): Partial<Record<ErrorType, number>> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<ErrorType, number>> = {};
  for (const type of ERROR_TYPES) {
    const value = (raw as Record<string, unknown>)[type];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) out[type] = Math.min(9999, Math.floor(value));
  }
  return out;
}

/** Ajoute une erreur au compteur de son type. Type inconnu ou absent : rien ne change (hors nettoyage). */
export function addError(json: string, type: ErrorType | null | undefined): string {
  const errors = parseErrors(json);
  if (type && (ERROR_TYPES as readonly string[]).includes(type)) errors[type] = (errors[type] ?? 0) + 1;
  return JSON.stringify(errors);
}

/** Les types d'erreur les plus fréquents d'un concept. */
export function topErrors(json: string, max = 2): { type: ErrorType; count: number }[] {
  return Object.entries(parseErrors(json))
    .map(([type, count]) => ({ type: type as ErrorType, count: count as number }))
    .sort((a, b) => b.count - a.count)
    .slice(0, max);
}

/* ── En base ──────────────────────────────────────────────────────────── */

export interface MasteryDb {
  all: <T = unknown>(query: SQL) => Promise<T[]>;
  run: (query: SQL) => Promise<unknown>;
}

export interface MasterySignal {
  concept: string;
  topic?: string | null;
  outcome: Outcome;
  /** Seulement pris en compte quand la réponse n'est pas « richtig ». */
  errorType?: ErrorType | null;
}

export interface ConceptState {
  concept: string;
  topic: string;
  score: number;
  attempts: number;
  errors: { type: ErrorType; count: number }[];
}

export type MasteryResult = { saved: true; score: number } | { saved: false; reason: "invalid" | "full" | "not_migrated" };

export const missingTable = (e: unknown) => /no such table/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ""));

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn("[mastery] table concept_mastery absente — lancer migre-concept-mastery.mjs");
}

/** Enregistre ce que l'étudiant vient de montrer sur UN concept. Ne lève jamais pour une migration manquante. */
export async function recordMastery(db: MasteryDb, userId: string, signal: MasterySignal, now: number = Date.now()): Promise<MasteryResult> {
  const concept = cleanConcept(signal?.concept);
  const key = concept ? conceptKey(concept) : "";
  if (!concept || !key || !(OUTCOMES as readonly string[]).includes(signal.outcome)) return { saved: false, reason: "invalid" };
  const topic = cleanConcept(signal.topic) ?? "";
  const errorType = signal.outcome === "richtig" ? null : (signal.errorType ?? null);
  const correct = signal.outcome === "richtig" ? 1 : 0;

  try {
    const [row] = await db.all<{ id: string; score: number; error_patterns: string; topic: string }>(
      sql`SELECT id, score, error_patterns, topic FROM concept_mastery WHERE user_id = ${userId} AND concept_key = ${key} LIMIT 1`,
    );
    if (row) {
      const score = nextScore(Number(row.score), signal.outcome);
      await db.run(sql`
        UPDATE concept_mastery
           SET score = ${score},
               attempts = attempts + 1,
               correct = correct + ${correct},
               error_patterns = ${addError(row.error_patterns, errorType)},
               topic = ${row.topic || topic},
               last_seen = ${now}
         WHERE id = ${row.id} AND user_id = ${userId}`);
      return { saved: true, score };
    }

    const [count] = await db.all<{ n: number }>(sql`SELECT count(*) AS n FROM concept_mastery WHERE user_id = ${userId}`);
    if (Number(count?.n ?? 0) >= MAX_CONCEPTS_PER_USER) return { saved: false, reason: "full" };

    const score = nextScore(START_SCORE, signal.outcome);
    await db.run(sql`
      INSERT INTO concept_mastery (id, user_id, concept, concept_key, topic, score, attempts, correct, error_patterns, last_seen, created_at)
      VALUES (${crypto.randomUUID()}, ${userId}, ${concept}, ${key}, ${topic}, ${score}, 1, ${correct}, ${addError("{}", errorType)}, ${now}, ${now})
      ON CONFLICT(user_id, concept_key) DO NOTHING`);
    return { saved: true, score };
  } catch (error) {
    if (!missingTable(error)) throw error;
    warnOnce();
    return { saved: false, reason: "not_migrated" };
  }
}

/** Les concepts les plus fragiles de CE compte, les plus bas d'abord. Liste vide tant que la migration manque. */
export async function weakestConcepts(db: MasteryDb, userId: string, limit = 3, below: number = WEAK_BELOW): Promise<ConceptState[]> {
  try {
    const rows = await db.all<{ concept: string; topic: string; score: number; attempts: number; error_patterns: string }>(sql`
      SELECT concept, topic, score, attempts, error_patterns
        FROM concept_mastery
       WHERE user_id = ${userId} AND attempts >= 1 AND score < ${below}
    ORDER BY score ASC, last_seen DESC
       LIMIT ${Math.max(1, Math.min(50, Math.floor(limit)))}`);
    return rows.map((r) => ({ concept: r.concept, topic: r.topic ?? "", score: round3(Number(r.score)), attempts: Number(r.attempts), errors: topErrors(r.error_patterns ?? "{}") }));
  } catch (error) {
    if (!missingTable(error)) throw error;
    warnOnce();
    return [];
  }
}

export interface SubjectMastery {
  topic: string;
  /** Moyenne des concepts de la matière, de 0 à 1. */
  score: number;
  concepts: number;
}

/** La maîtrise par matière, pour les barres du Dashboard : les matières les plus travaillées d'abord. */
export async function masteryBySubject(db: MasteryDb, userId: string, limit = 8): Promise<SubjectMastery[]> {
  try {
    const rows = await db.all<{ topic: string; s: number; c: number }>(sql`
      SELECT CASE WHEN topic = '' THEN 'Allgemein' ELSE topic END AS topic, avg(score) AS s, count(*) AS c
        FROM concept_mastery
       WHERE user_id = ${userId} AND attempts >= 1
    GROUP BY 1
    ORDER BY c DESC, topic ASC
       LIMIT ${Math.max(1, Math.min(30, Math.floor(limit)))}`);
    return rows.map((r) => ({ topic: r.topic, score: round3(Number(r.s)), concepts: Number(r.c) }));
  } catch (error) {
    if (!missingTable(error)) throw error;
    warnOnce();
    return [];
  }
}

/* ── Ce que le tuteur reçoit (NIVEAU 2b) ──────────────────────────────── */

/**
 * Les concepts fragiles et la consigne d'adaptation. Aucun chiffre : le
 * tuteur ne doit pas pouvoir réciter un pourcentage à l'étudiant.
 */
export function masteryPromptLines(weak: ConceptState[]): string[] {
  const report = [
    "LERNSTAND MELDEN (still, ohne es je zu erwähnen):",
    "- Immer wenn die Person SELBST etwas beantwortet, gerechnet oder erklärt",
    "  hat, halte das Ergebnis mit lernstand_melden fest — richtig, teilweise",
    "  oder falsch, mit der Fehlerart, wenn es nicht stimmte.",
    "",
  ];
  if (weak.length === 0) return report;

  const lines = weak.map((w) => {
    const level = w.score < 0.3 ? "sehr unsicher" : "unsicher";
    const errors = w.errors.map((e) => `${ERROR_LABELS[e.type]} (${e.count}×)`).join(", ");
    return `  - ${w.concept}${w.topic ? ` (${w.topic})` : ""}: ${level}${errors ? ` — typische Fehler: ${errors}` : ""}`;
  });
  return [
    "LERNSTAND — WO DIESE PERSON GERADE AM UNSICHERSTEN IST:",
    "",
    ...lines,
    "",
    "SO PASST DU DICH AN:",
    "- Berührt die Frage eines dieser Konzepte: erkläre LANGSAMER und in",
    "  kleineren Schritten, nimm eine Analogie mehr, und prüfe zuerst mit",
    "  einer kurzen Frage die Voraussetzung, an der es hakt.",
    "- Achte gezielt auf die genannten typischen Fehler und lass die Person",
    "  sie selbst entdecken, bevor sie wieder passieren (\"Welche Einheit hat",
    "  dein Ergebnis?\").",
    "- Bei allen anderen Konzepten: gewohntes Tempo.",
    "- Nenne nie eine Einstufung, eine Zahl oder diese Liste. Du kennst die",
    "  Person — du liest nicht aus einer Akte vor.",
    "- Im Prüfungsmodus: nicht helfen, nur festhalten.",
    "",
    ...report,
  ];
}
