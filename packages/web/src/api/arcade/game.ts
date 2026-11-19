import { randomBytes } from "node:crypto";
import type { ChallengeQuestion } from "../lib/doc-challenge";

/**
 * Arcade (19 nov. 2026) : le Fall-Check en partie chronométrée.
 *
 * Le SERVEUR tient la partie. Le navigateur ne reçoit une question qu'au
 * moment de la jouer, jamais la bonne réponse avant d'avoir répondu, et le
 * chrono est mesuré ici : un sans-faute rapporte des crédits, il ne doit pas
 * pouvoir se lire dans le réseau ni s'obtenir en arrêtant l'horloge.
 *
 * Règles pures ici (tests/arcade.test.ts) ; routes : arcade/routes.ts.
 */
export const QUESTION_MS = 15_000;
/** Latence du réseau tolérée en plus des 15 s affichées. */
export const GRACE_MS = 2_500;
export const SESSION_TTL_MS = 30 * 60_000;
export const PERFECT_REWARD = 2;
export const PERFECT_REWARDS_PER_DAY = 3;
/** En dessous, une partie est trop courte pour rapporter des crédits. */
export const MIN_QUESTIONS_FOR_REWARD = 4;

export interface ArcadeSession {
  id: string;
  userId: string;
  documentId: string;
  title: string;
  questions: ChallengeQuestion[];
  /** Index de la question à jouer. */
  next: number;
  /** Moment où la question en cours a été montrée (ms), null tant qu'elle ne l'est pas. */
  shownAt: number | null;
  correct: number;
  streak: number;
  score: number;
  createdAt: number;
  showOnBoard: boolean;
  finished: boolean;
}

export function newSession(input: { userId: string; documentId: string; title: string; questions: ChallengeQuestion[]; showOnBoard: boolean; now?: number }): ArcadeSession {
  return { id: randomBytes(16).toString("base64url"), userId: input.userId, documentId: input.documentId, title: input.title, questions: input.questions, next: 0, shownAt: null, correct: 0, streak: 0, score: 0, createdAt: input.now ?? Date.now(), showOnBoard: input.showOnBoard, finished: false };
}

/** Ce que le navigateur voit d'une question : pas la réponse. */
export function publicQuestion(q: ChallengeQuestion) {
  return { situation: q.situation, question: q.question, options: q.options };
}

/** 100 points par bonne réponse, +50 en série (à partir de la 2ᵉ), + jusqu'à 50 pour la vitesse. */
export function pointsFor(right: boolean, streak: number, elapsedMs: number): number {
  if (!right) return 0;
  const speed = Math.round(Math.max(0, Math.min(1, 1 - elapsedMs / QUESTION_MS)) * 50);
  return 100 + (streak >= 2 ? 50 : 0) + speed;
}

export type AnswerResult =
  | { ok: false; reason: "finished" | "not_shown" }
  | { ok: true; right: boolean; timedOut: boolean; points: number; session: ArcadeSession };

/** Corrige la réponse à la question en cours. `choice` = -1 : temps écoulé côté navigateur. */
export function answer(session: ArcadeSession, choice: number, now = Date.now()): AnswerResult {
  if (session.finished || session.next >= session.questions.length) return { ok: false, reason: "finished" };
  if (session.shownAt === null) return { ok: false, reason: "not_shown" };
  const q = session.questions[session.next]!;
  const elapsed = now - session.shownAt;
  const timedOut = choice < 0 || elapsed > QUESTION_MS + GRACE_MS;
  const right = !timedOut && choice === q.correct;
  const streak = right ? session.streak + 1 : 0;
  const points = pointsFor(right, streak, elapsed);
  const next: ArcadeSession = { ...session, next: session.next + 1, shownAt: null, correct: session.correct + (right ? 1 : 0), streak, score: session.score + points };
  next.finished = next.next >= next.questions.length;
  return { ok: true, right, timedOut, points, session: next };
}

export const isPerfect = (s: ArcadeSession) => s.finished && s.questions.length >= MIN_QUESTIONS_FOR_REWARD && s.correct === s.questions.length;

/** Le prénom seul, pour la Bestenliste : premier mot, lettres seulement, 20 caractères au plus. */
export function boardName(fullName: string | null | undefined): string {
  const first = (fullName ?? "").trim().split(/\s+/)[0] ?? "";
  const clean = first.replace(/[^\p{L}\p{M}'-]/gu, "").slice(0, 20);
  return clean.length >= 2 ? clean : "Anonym";
}

/** Semaine ISO d'un instant, en UTC : la Bestenliste repart à zéro chaque lundi. */
export function weekKey(now = Date.now()): string {
  const d = new Date(now);
  const day = d.getUTCDay() || 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 4 - day));
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((thursday.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
