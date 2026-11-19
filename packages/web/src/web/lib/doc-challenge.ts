/**
 * « Fall-Check » côté navigateur : l'appel au serveur (/api/agent/doc-challenge)
 * et les règles de la partie. Les questions viennent du document de
 * l'étudiant ; le serveur n'en laisse sortir aucune sans sa preuve.
 */
import { paywallFromResponse } from "@/lib/paywall";

export const CHALLENGE_MODES = ["diagnosis", "decision", "concept"] as const;
export type ChallengeMode = (typeof CHALLENGE_MODES)[number];

export interface ChallengeQuestion {
  situation: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  /** La phrase du document qui prouve la réponse, et sa page. */
  quote: string;
  page: number;
}
export interface Challenge {
  documentId: string;
  title: string;
  questions: ChallengeQuestion[];
}

/** Ce que la page sait dire quand la partie ne démarre pas. */
export type ChallengeError = "no_grounded_question" | "too_short" | "rate_limited" | "not_configured" | "not_found" | "quota" | "failed";
const KNOWN: ChallengeError[] = ["no_grounded_question", "too_short", "rate_limited", "not_configured", "not_found"];

export function challengeErrorOf(status: number, code: unknown): ChallengeError {
  if (status === 402) return "quota";
  return KNOWN.includes(code as ChallengeError) ? (code as ChallengeError) : "failed";
}

export async function fetchChallenge(body: { documentId: string; mode: ChallengeMode; locale: string }): Promise<Challenge> {
  const res = await fetch("/api/agent/doc-challenge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = (await res.clone().json().catch(() => ({}))) as { error?: unknown };
    // Limite du forfait : la fenêtre de limite s'ouvre, comme pour le quiz.
    await paywallFromResponse(res, "chat").catch(() => false);
    throw new Error(challengeErrorOf(res.status, data.error));
  }
  return (await res.json()) as Challenge;
}

export interface ChallengeState {
  /** La question en cours (= nombre de réponses données). */
  index: number;
  correct: number;
  streak: number;
  score: number;
}
export const CHALLENGE_START: ChallengeState = { index: 0, correct: 0, streak: 0, score: 0 };

/** 100 points par bonne réponse, +50 à partir de la deuxième d'affilée. */
export function answerChallenge(state: ChallengeState, right: boolean): ChallengeState {
  const streak = right ? state.streak + 1 : 0;
  return { index: state.index + 1, correct: state.correct + (right ? 1 : 0), streak, score: state.score + (right ? 100 + (streak >= 2 ? 50 : 0) : 0) };
}

/** Avancement de la barre, de 0 à 1 : les questions RÉPONDUES. */
export function progressOf(state: ChallengeState, total: number): number {
  return total > 0 ? Math.min(1, state.index / total) : 0;
}

/* ── Arcade : la partie tenue par le serveur (api/arcade) ──────────────────── */

export interface ArcadeStart {
  sessionId: string;
  documentId: string;
  title: string;
  total: number;
  secondsPerQuestion: number;
}
export interface ArcadeQuestion {
  index: number;
  total: number;
  situation: string;
  question: string;
  options: string[];
  remainingMs: number;
}
export interface ArcadeAnswer {
  right: boolean;
  timedOut: boolean;
  points: number;
  correct: number;
  explanation: string;
  quote: string;
  page: number;
  state: { index: number; correct: number; streak: number; score: number; total: number; finished: boolean };
  reward: { granted: boolean; amount: number; reason?: "daily_cap" } | null;
  rank: number | null;
}
export interface BoardRow {
  rank: number;
  name: string;
  score: number;
  me: boolean;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    const data = (await res.clone().json().catch(() => ({}))) as { error?: unknown };
    await paywallFromResponse(res, "chat").catch(() => false);
    throw new Error(challengeErrorOf(res.status, data.error));
  }
  return (await res.json()) as T;
}

export const startArcade = (body: { documentId: string; mode: ChallengeMode; locale: string; showOnBoard: boolean }) => postJson<ArcadeStart>("/api/arcade/start", body);
export const arcadeQuestion = (sessionId: string) => postJson<ArcadeQuestion>("/api/arcade/question", { sessionId });
/** `choice` = -1 : le temps est écoulé. */
export const arcadeAnswer = (sessionId: string, choice: number) => postJson<ArcadeAnswer>("/api/arcade/answer", { sessionId, choice });

export async function arcadeLeaderboard(): Promise<{ rows: BoardRow[]; mine: BoardRow | null }> {
  const res = await fetch("/api/arcade/leaderboard");
  if (!res.ok) return { rows: [], mine: null };
  return (await res.json()) as { rows: BoardRow[]; mine: BoardRow | null };
}

/** Chrono : couleur et pulsation selon le temps restant (rouge sous 3 s). */
export function timerTone(remainingMs: number): "calm" | "hurry" | "critical" {
  return remainingMs <= 3_000 ? "critical" : remainingMs <= 7_000 ? "hurry" : "calm";
}
