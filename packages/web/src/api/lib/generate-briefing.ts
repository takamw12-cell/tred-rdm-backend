/**
 * `generateBriefing` — le briefing du jour d'un compte, avec son cache.
 *
 * ── Ce qui coûte, et comment on le borne ──────────────────────────────────
 *
 * Le tableau de bord demande le briefing à CHAQUE ouverture. Le modèle, lui,
 * n'est appelé qu'une fois par jour et par compte : le résultat est gardé dans
 * `daily_briefing` (une ligne par compte, remplacée chaque matin, heure de
 * Berlin). Une ouverture suivante coûte une lecture de cette ligne et la liste
 * des examens — rien d'autre.
 *
 *   - Cas 1 (aucun document) : texte fixe, jamais de modèle. C'est le cas de
 *     tout nouveau compte : il ne coûte rien.
 *   - Génération À LA DEMANDE, pas de tâche planifiée à 5 h : préparer chaque
 *     nuit le briefing de tous les comptes paierait pour ceux qui n'ouvrent
 *     pas TRED ce jour-là. Ici, on ne paie que les visites réelles.
 *   - Au plus MAX_MODEL_CALLS_PER_DAY appels par compte et par jour (bouton
 *     « Actualiser » compris) ; au-delà, les phrases du code s'affichent.
 *   - Deux onglets ouverts en même temps partagent la même génération.
 *
 * Le briefing est refait dans la journée quand ce qui le fonde change : le
 * premier document arrive, l'examen le plus proche change, ou l'étudiant
 * clique « Actualiser » (MAX_REFRESHES_PER_DAY fois).
 *
 * ── Jamais une dépendance ─────────────────────────────────────────────────
 *
 * Tables absentes (migre-briefing.mjs pas lancé), modèle en panne, clé
 * absente, texte refusé par le garde-fou : le briefing s'affiche quand même,
 * avec les phrases de lib/briefing.ts. Sans table, donc sans cache, le modèle
 * n'est jamais appelé — sinon chaque chargement paierait.
 *
 * Au modèle ne partent que les phrases de référence (matière, thème, comptes) :
 * ni nom, ni e-mail, ni contenu de document. Données personnelles en base :
 * `daily_briefing` et `exam_date` portent `user_id`, exportées et effacées
 * avec le compte (lib/gdpr.ts).
 */
import { generateText } from "ai";
import { sql } from "drizzle-orm";

import { gateway } from "../agent/gateway";
import { FAST_MODEL } from "./ai-models";
import {
  MAX_EXAMS,
  acceptModelText,
  berlinDay,
  briefingLocale,
  briefingPrompt,
  dayBefore,
  daysBetween,
  examSignature,
  pickBriefing,
  type Briefing,
  type BriefingFacts,
  type BriefingKind,
  type ExamRow,
} from "./briefing";
import { conceptKey, missingTable, weakestConcepts, type MasteryDb } from "./concept-mastery";

/** Clics sur « Actualiser » pris en compte par jour. */
export const MAX_REFRESHES_PER_DAY = 3;
/** Appels du modèle par compte et par jour, toutes causes confondues. */
export const MAX_MODEL_CALLS_PER_DAY = 3;
/** Compteur des réponses jugées justes, dans `usage_counter` (period = jour à Berlin). */
export const MASTERED_METRIC = "mastered";
const MODEL_TIMEOUT_MS = 6000;

export interface StoredBriefing {
  day: string;
  locale: string;
  kind: BriefingKind;
  /** Signature des examens au moment de la génération. */
  examKey: string;
  briefing: Briefing;
  /** Le texte du modèle, ou `null` : les phrases du code s'affichent. */
  text: string | null;
  modelCalls: number;
  refreshes: number;
}

/** Tout ce qui touche la base, l'horloge ou le réseau — injecté, pour tester sans eux. */
export interface BriefingDeps {
  now: () => Date;
  readStored: (userId: string) => Promise<{ migrated: boolean; row: StoredBriefing | null }>;
  /** Les examens à venir, du plus proche au plus lointain. */
  readExams: (userId: string, today: string) => Promise<ExamRow[]>;
  hasDocument: (userId: string) => Promise<boolean>;
  readFacts: (userId: string, today: string, exams: ExamRow[]) => Promise<BriefingFacts>;
  write: (userId: string, row: StoredBriefing) => Promise<void>;
  /** `null` : modèle coupé ou clé absente. */
  writeText: ((briefing: Briefing, locale: string) => Promise<string | null>) | null;
}

export interface BriefingResult extends Briefing {
  /** Le jour à Berlin pour lequel ce briefing vaut. */
  day: string;
  text: string | null;
  /** `false` : migre-briefing.mjs n'a pas tourné — pas de cache, pas d'examens. */
  migrated: boolean;
  refreshLeft: number;
  exams: { id: string; subject: string; day: string; days: number }[];
}

const inFlight = new WeakMap<BriefingDeps, Map<string, Promise<BriefingResult>>>();

/** Le briefing du jour. `force` : l'étudiant a cliqué « Actualiser ». Ne lève pas pour un modèle en panne. */
export function generateBriefing(deps: BriefingDeps, userId: string, locale: string, options: { force?: boolean } = {}): Promise<BriefingResult> {
  const lang = briefingLocale(locale);
  const force = options.force === true;
  let running = inFlight.get(deps);
  if (!running) inFlight.set(deps, (running = new Map()));
  const key = `${userId}|${lang}|${force ? 1 : 0}`;
  const pending = running.get(key);
  if (pending) return pending;
  const job = build(deps, userId, lang, force).finally(() => running.delete(key));
  running.set(key, job);
  return job;
}

async function build(deps: BriefingDeps, userId: string, lang: string, force: boolean): Promise<BriefingResult> {
  const today = berlinDay(deps.now());
  const [{ migrated, row }, exams] = await Promise.all([deps.readStored(userId), deps.readExams(userId, today)]);
  const examKey = examSignature(exams);
  const current = row && row.day === today ? row : null;
  const refreshes = current?.refreshes ?? 0;
  const refreshing = force && refreshes < MAX_REFRESHES_PER_DAY;

  const result = (briefing: Briefing, text: string | null, used: number): BriefingResult => ({
    ...briefing,
    day: today,
    text,
    migrated,
    refreshLeft: migrated ? Math.max(0, MAX_REFRESHES_PER_DAY - used) : 0,
    exams: exams.map((e) => ({ id: e.id, subject: e.subject, day: e.day, days: daysBetween(today, e.day) })),
  });

  if (current && !refreshing) {
    const stale = current.examKey !== examKey || (current.kind === "welcome" && (await deps.hasDocument(userId)));
    // Interface passée dans une autre langue : les phrases du code, traduites, plutôt qu'un second appel.
    if (!stale) return result(current.briefing, current.locale === lang ? current.text : null, refreshes);
  }

  const briefing = pickBriefing(await deps.readFacts(userId, today, exams));
  let modelCalls = current?.modelCalls ?? 0;
  let text: string | null = null;
  if (migrated && deps.writeText && briefing.kind !== "welcome" && modelCalls < MAX_MODEL_CALLS_PER_DAY) {
    modelCalls += 1;
    text = acceptModelText(await deps.writeText(briefing, lang).catch(() => null), briefing);
  }

  const used = refreshes + (refreshing ? 1 : 0);
  if (migrated) {
    await deps
      .write(userId, { day: today, locale: lang, kind: briefing.kind, examKey, briefing, text, modelCalls, refreshes: used })
      .catch((err) => console.error("[briefing] cache non écrit :", (err as Error).message));
  }
  return result(briefing, text, used);
}

/* ── En base ──────────────────────────────────────────────────────────── */

export type BriefingDb = MasteryDb;

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn("[briefing] tables daily_briefing / exam_date absentes — lancer migre-briefing.mjs");
}

/** Une lecture sur une table créée par un autre script : absente, elle vaut « rien ». */
const optional = <T>(query: Promise<T[]>): Promise<T[]> =>
  query.catch((error) => {
    if (!missingTable(error)) throw error;
    return [];
  });

const ms = (v: unknown) => Number(v ?? 0) || 0;

function parseBriefing(json: string): Briefing | null {
  try {
    const b = JSON.parse(json) as Briefing;
    return b && Array.isArray(b.parts) && b.parts.length > 0 && typeof b.kind === "string" ? b : null;
  } catch {
    return null;
  }
}

export async function readExamRows(db: BriefingDb, userId: string, today: string): Promise<{ migrated: boolean; exams: ExamRow[] }> {
  try {
    const rows = await db.all<{ id: string; subject: string; exam_day: string }>(sql`
      SELECT id, subject, exam_day
        FROM exam_date
       WHERE user_id = ${userId} AND exam_day >= ${today}
    ORDER BY exam_day ASC, created_at ASC
       LIMIT ${MAX_EXAMS}`);
    return { migrated: true, exams: rows.map((r) => ({ id: r.id, subject: r.subject, day: r.exam_day })) };
  } catch (error) {
    if (!missingTable(error)) throw error;
    warnOnce();
    return { migrated: false, exams: [] };
  }
}

/** Ce que le serveur sait de l'étudiant aujourd'hui : des comptes et des libellés, lus pour CE compte. */
export async function readBriefingFacts(db: BriefingDb, userId: string, today: string, exams: ExamRow[], now: Date): Promise<BriefingFacts> {
  const [[docs], [chat], [card], [seen], weakest, [mastered], [fach]] = await Promise.all([
    db.all<{ n: number }>(sql`SELECT count(*) AS n FROM document WHERE user_id = ${userId}`),
    // `chat_conversation.updated_at` est en SECONDES (colonne « timestamp » de Drizzle).
    db.all<{ t: number | null }>(sql`SELECT max(updated_at) AS t FROM chat_conversation WHERE user_id = ${userId}`),
    optional(db.all<{ t: number | null }>(sql`SELECT max(last_reviewed_at) AS t FROM flashcard WHERE user_id = ${userId}`)),
    optional(db.all<{ t: number | null }>(sql`SELECT max(last_seen) AS t FROM concept_mastery WHERE user_id = ${userId}`)),
    weakestConcepts(db, userId, 12),
    db.all<{ count: number }>(sql`SELECT count FROM usage_counter WHERE user_id = ${userId} AND period = ${dayBefore(today)} AND metric = ${MASTERED_METRIC} LIMIT 1`),
    db.all<{ name: string }>(sql`SELECT name FROM subject WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 1`),
  ]);

  const last = Math.max(ms(chat?.t) * 1000, ms(card?.t), ms(seen?.t));
  const daysInactive = last > 0 ? Math.max(0, daysBetween(berlinDay(new Date(last)), berlinDay(now))) : null;

  const next = exams[0] ? { subject: exams[0].subject, days: daysBetween(today, exams[0].day) } : null;
  // Le thème du jour : avant un examen, seulement un concept de CETTE matière.
  const subjectKey = next ? conceptKey(next.subject) : "";
  const ofExam = next ? weakest.find((w) => w.topic && subjectKey && (conceptKey(w.topic).includes(subjectKey) || subjectKey.includes(conceptKey(w.topic)))) : undefined;

  return {
    documents: ms(docs?.n),
    daysInactive,
    exam: next,
    focus: next ? (ofExam?.concept ?? null) : (weakest[0]?.concept ?? null),
    subject: weakest[0]?.topic || fach?.name || null,
    masteredYesterday: ms(mastered?.count),
  };
}

/** Une réponse jugée juste par le tuteur : +1 au compteur du jour (Berlin). Ne lève jamais. */
export async function bumpMastered(db: BriefingDb, userId: string, now: Date = new Date()): Promise<void> {
  try {
    await db.run(sql`
      INSERT INTO usage_counter (user_id, period, metric, count)
      VALUES (${userId}, ${berlinDay(now)}, ${MASTERED_METRIC}, 1)
      ON CONFLICT(user_id, period, metric) DO UPDATE SET count = count + 1`);
  } catch (error) {
    console.error("[briefing] compteur du jour non écrit :", (error as Error).message);
  }
}

/** `BRIEFING_MODEL=off` coupe le modèle : les phrases du code s'affichent. */
export const briefingModelEnabled = (env: Record<string, string | undefined> = process.env): boolean => Boolean(env.ANTHROPIC_API_KEY) && env.BRIEFING_MODEL !== "off";

/** Le modèle rapide (Haiku par défaut, FAST_AI_MODEL) reformule les phrases de référence. */
async function writeWithModel(briefing: Briefing, locale: string): Promise<string | null> {
  const { system, prompt } = briefingPrompt(briefing, locale);
  try {
    const { text } = await generateText({
      model: gateway(FAST_MODEL),
      system,
      prompt,
      maxOutputTokens: 160,
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
    return text;
  } catch (err) {
    console.warn("[briefing] modèle indisponible, phrases du code affichées :", (err as Error).message);
    return null;
  }
}

/** Les dépendances réelles : la base de TRED et le modèle rapide. */
export function briefingDeps(db: BriefingDb): BriefingDeps {
  return {
    now: () => new Date(),
    readStored: async (userId) => {
      try {
        const [r] = await db.all<{ day: string; locale: string; kind: string; exam_key: string; payload: string; text: string | null; model_calls: number; refreshes: number }>(sql`
          SELECT day, locale, kind, exam_key, payload, text, model_calls, refreshes
            FROM daily_briefing
           WHERE user_id = ${userId}
           LIMIT 1`);
        const briefing = r ? parseBriefing(r.payload) : null;
        if (!r || !briefing) return { migrated: true, row: null };
        return { migrated: true, row: { day: r.day, locale: r.locale, kind: briefing.kind, examKey: r.exam_key, briefing, text: r.text || null, modelCalls: ms(r.model_calls), refreshes: ms(r.refreshes) } };
      } catch (error) {
        if (!missingTable(error)) throw error;
        warnOnce();
        return { migrated: false, row: null };
      }
    },
    readExams: async (userId, today) => (await readExamRows(db, userId, today)).exams,
    hasDocument: async (userId) => (await db.all(sql`SELECT 1 AS x FROM document WHERE user_id = ${userId} LIMIT 1`)).length > 0,
    readFacts: (userId, today, exams) => readBriefingFacts(db, userId, today, exams, new Date()),
    write: async (userId, row) => {
      await db.run(sql`
        INSERT INTO daily_briefing (user_id, day, locale, kind, exam_key, payload, text, model_calls, refreshes, updated_at)
        VALUES (${userId}, ${row.day}, ${row.locale}, ${row.kind}, ${row.examKey}, ${JSON.stringify(row.briefing)}, ${row.text}, ${row.modelCalls}, ${row.refreshes}, ${Date.now()})
        ON CONFLICT(user_id) DO UPDATE SET
          day = excluded.day, locale = excluded.locale, kind = excluded.kind, exam_key = excluded.exam_key,
          payload = excluded.payload, text = excluded.text, model_calls = excluded.model_calls,
          refreshes = excluded.refreshes, updated_at = excluded.updated_at`);
    },
    writeText: briefingModelEnabled() ? writeWithModel : null,
  };
}
