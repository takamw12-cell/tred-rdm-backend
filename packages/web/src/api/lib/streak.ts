import { desc, eq } from "drizzle-orm";
import { studyDay } from "../database/schema";
import { berlinDay, dayBefore } from "./briefing";
import { missingTable } from "./concept-mastery";

/**
 * La série de jours d'étude — la « flamme » du tableau de bord (18 nov. 2026).
 *
 * Un jour compte dès que l'étudiant a posé UNE question au tuteur ce jour-là
 * (jour civil de Berlin, comme le briefing et les Karteikarten). La série est
 * le nombre de jours d'affilée jusqu'à aujourd'hui. Tant qu'aujourd'hui n'est
 * pas fini, une série arrêtée à hier vit encore : elle est « en danger », et
 * le tableau de bord le dit.
 *
 * Rien n'est stocké d'autre que la liste des jours : `current` et `longest`
 * sont recalculés à la lecture. Pas de compteur à réparer s'il se désaccorde.
 *
 * Table `study_day`, créée par migre-streak.mjs. Tant qu'elle manque, rien
 * n'est enregistré, la flamme affiche 0 et rien ne tombe.
 */

export interface Streak {
  /** Jours d'affilée jusqu'à aujourd'hui (ou jusqu'à hier si aujourd'hui n'est pas encore joué). */
  current: number;
  activeToday: boolean;
  /** Une série existe, mais rien n'a encore été fait aujourd'hui : elle tombe à minuit. */
  atRisk: boolean;
  longest: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isRealDay = (day: string) => DAY.test(day) && !Number.isNaN(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;

/** Pur : la série, à partir des jours étudiés (ordre et doublons indifférents) et du jour d'aujourd'hui. */
export function streakFrom(days: readonly string[], today: string): Streak {
  const set = new Set(days.filter((d) => typeof d === "string" && isRealDay(d) && d <= today));
  const activeToday = set.has(today);

  let current = 0;
  // On part d'aujourd'hui s'il est joué, sinon d'hier : la série d'hier n'est pas encore perdue.
  for (let day = activeToday ? today : dayBefore(today); set.has(day); day = dayBefore(day)) current += 1;

  let longest = 0;
  for (const day of set) {
    // Le début d'une suite : le jour d'avant n'y est pas.
    if (set.has(dayBefore(day))) continue;
    let length = 0;
    for (let d = day; set.has(d); d = dayAfter(d)) length += 1;
    longest = Math.max(longest, length);
  }

  return { current, activeToday, atRisk: current > 0 && !activeToday, longest };
}

function dayAfter(day: string): string {
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/* ── Base ───────────────────────────────────────────────────────────────── */

/** Ce que ce module demande à la base (Drizzle le satisfait). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StreakDb = any;

/** Marque aujourd'hui comme jour d'étude. Idempotent ; ne lève jamais. */
export async function recordStudyDay(db: StreakDb, userId: string, now: Date = new Date()): Promise<void> {
  try {
    await db.insert(studyDay).values({ userId, day: berlinDay(now) }).onConflictDoNothing();
  } catch (error) {
    if (!missingTable(error)) console.error("[serie] jour non enregistré", error instanceof Error ? error.name : "erreur");
  }
}

/** La série du compte. Table absente : série vide, `migrated: false`. */
export async function readStreak(db: StreakDb, userId: string, now: Date = new Date()): Promise<Streak & { migrated: boolean }> {
  try {
    // 400 jours suffisent pour la série en cours et la plus longue d'une année.
    const rows = (await db.select({ day: studyDay.day }).from(studyDay).where(eq(studyDay.userId, userId)).orderBy(desc(studyDay.day)).limit(400)) as Array<{ day: string }>;
    return { ...streakFrom(rows.map((r) => r.day), berlinDay(now)), migrated: true };
  } catch (error) {
    if (!missingTable(error)) throw error;
    return { ...streakFrom([], berlinDay(now)), migrated: false };
  }
}
