import { and, eq, gte, like } from "drizzle-orm";
import { conceptMastery, creditTransaction } from "../database/schema";
import { berlinDay } from "./briefing";
import { conceptKey, missingTable } from "./concept-mastery";
import { getPurchasedCredits, grantCredits, toCredits } from "./credits";

/**
 * « Study Rewards » : des crédits gagnés en étudiant (décision du 18 nov. 2026).
 *
 *   chapter_completed    +0,5   une tâche du plan d'étude cochée « Erledigt »
 *   exercise_completed   +0,5   (prévu, pas encore branché)
 *   mock_exam_passed     +2     (prévu, pas encore branché)
 *
 * ── Anti-abus ───────────────────────────────────────────────────────────────
 * Un crédit vaut une question au modèle : chaque récompense est une dépense.
 *  1. UNE fois par jalon : l'identifiant de la ligne du journal
 *     (`credit_transactions.id`) EST le jalon — « reward:<compte>:<action>:<clé> ».
 *     Un second essai bute sur la clé primaire ; pas de table en plus.
 *  2. Plafond : 3 crédits gagnés par jour (jour de Berlin), tous jalons
 *     confondus. Une récompense qui le dépasserait est refusée en entier.
 *  3. Justification : cocher une case ne suffit pas. Pour un chapitre, le
 *     concept doit avoir été travaillé AVEC le tuteur dans les dernières 24 h
 *     (ligne `concept_mastery` vue récemment, au moins un essai). Ce travail
 *     coûte lui-même un crédit : personne ne s'enrichit en cochant des cases.
 *  4. Le jalon d'un chapitre vaut pour la semaine : le même concept peut être
 *     récompensé à nouveau la semaine suivante, pas le lendemain.
 */

export const REWARDS = {
  chapter_completed: 0.5,
  exercise_completed: 0.5,
  mock_exam_passed: 2,
} as const;
export type RewardAction = keyof typeof REWARDS;

export const DAILY_REWARD_CAP = 3;
const JUSTIFIED_WITHIN_MS = 24 * 60 * 60 * 1000;

export type RewardReason = "granted" | "already_rewarded" | "daily_cap" | "not_justified" | "unavailable";

export interface RewardResult {
  granted: boolean;
  reason: RewardReason;
  /** Crédits ajoutés par CET appel (0 si refusé). */
  amount: number;
  earnedToday: number;
  /** Ce qu'il reste à gagner aujourd'hui. */
  leftToday: number;
  balance: number;
}

/** « 2026-W47 » : la semaine ISO du jour donné. */
export function isoWeek(day: string): string {
  const thursday = new Date(`${day}T12:00:00Z`);
  // Une semaine ISO appartient à l'année de son jeudi.
  thursday.setUTCDate(thursday.getUTCDate() - ((thursday.getUTCDay() + 6) % 7) + 3);
  const year = thursday.getUTCFullYear();
  // Le jeudi de la semaine 1 : celui de la semaine qui contient le 4 janvier.
  const firstThursday = new Date(Date.UTC(year, 0, 4, 12));
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ((firstThursday.getUTCDay() + 6) % 7) + 3);
  const week = 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** L'identifiant du jalon : une ligne du journal, donc une seule récompense. */
export function rewardId(userId: string, action: RewardAction, key: string, day: string): string {
  const scope = action === "chapter_completed" ? isoWeek(day) : "once";
  return `reward:${userId}:${action}:${scope}:${conceptKey(key).slice(0, 80)}`;
}

/** Pur : la récompense passe-t-elle sous le plafond du jour ? */
export function underDailyCap(earnedToday: number, amount: number, cap: number = DAILY_REWARD_CAP): boolean {
  return toCredits(earnedToday + amount) <= cap;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Crédits de récompense déjà gagnés aujourd'hui (jour de Berlin). */
export async function rewardsEarnedToday(db: Db, userId: string, now: Date = new Date()): Promise<number> {
  const today = berlinDay(now);
  // 36 h en arrière couvrent le jour de Berlin quel que soit le décalage ; le tri fin se fait ici.
  const rows = (await db
    .select({ amount: creditTransaction.amount, createdAt: creditTransaction.createdAt })
    .from(creditTransaction)
    .where(and(eq(creditTransaction.userId, userId), like(creditTransaction.id, `reward:${userId}:%`), gte(creditTransaction.createdAt, new Date(now.getTime() - 36 * 3600 * 1000))))) as Array<{ amount: number; createdAt: Date }>;
  return toCredits(rows.filter((r) => berlinDay(new Date(r.createdAt)) === today).reduce((sum, r) => sum + Number(r.amount), 0));
}

/** Le concept a-t-il été travaillé avec le tuteur dans les dernières 24 h ? */
async function workedRecently(db: Db, userId: string, concept: string, now: Date): Promise<boolean> {
  try {
    const rows = (await db
      .select({ attempts: conceptMastery.attempts, lastSeen: conceptMastery.lastSeen })
      .from(conceptMastery)
      .where(and(eq(conceptMastery.userId, userId), eq(conceptMastery.conceptKey, conceptKey(concept))))
      .limit(1)) as Array<{ attempts: number; lastSeen: Date }>;
    const row = rows[0];
    return !!row && row.attempts > 0 && now.getTime() - new Date(row.lastSeen).getTime() <= JUSTIFIED_WITHIN_MS;
  } catch (error) {
    if (!missingTable(error)) throw error;
    return false;
  }
}

/**
 * Ajoute les crédits d'un jalon d'étude — ou dit pourquoi non. Ne lève pas
 * pour un refus : l'interface affiche la raison.
 */
export async function awardCreditsForStudy(db: Db, userId: string, action: RewardAction, key: string, now: Date = new Date()): Promise<RewardResult> {
  const amount = REWARDS[action];
  const earnedToday = await rewardsEarnedToday(db, userId, now);
  const refuse = async (reason: RewardReason): Promise<RewardResult> => ({ granted: false, reason, amount: 0, earnedToday, leftToday: Math.max(0, toCredits(DAILY_REWARD_CAP - earnedToday)), balance: await getPurchasedCredits(userId) });

  const cleanKey = conceptKey(key);
  if (!cleanKey) return refuse("not_justified");
  // Seul le chapitre est branché : les deux autres actions n'ont pas encore de preuve côté serveur.
  if (action !== "chapter_completed" || !(await workedRecently(db, userId, key, now))) return refuse("not_justified");
  if (!underDailyCap(earnedToday, amount)) return refuse("daily_cap");

  const res = await grantCredits({ userId, amount, transactionId: rewardId(userId, action, key, berlinDay(now)), description: `Lernbonus: ${key.slice(0, 80)}`, type: "grant" });
  if (!res.granted) return refuse("already_rewarded");
  const after = toCredits(earnedToday + amount);
  return { granted: true, reason: "granted", amount, earnedToday: after, leftToday: Math.max(0, toCredits(DAILY_REWARD_CAP - after)), balance: res.balance };
}
