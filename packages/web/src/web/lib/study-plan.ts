/**
 * Le plan de révision sur 7 jours, gardé sur l'appareil (2026-11-16).
 *
 * Le serveur CALCULE le plan (api/lib/learning-profile.ts) et ne l'enregistre
 * pas. C'est le navigateur qui le garde pour la semaine, avec les tâches
 * cochées : pas de nouvelle table, pas de donnée de plus côté serveur.
 * Conséquence assumée : le plan ne suit pas l'étudiant d'un appareil à
 * l'autre — sur un autre appareil, il en crée un nouveau, calculé sur le même
 * état des connaissances.
 *
 * La clé porte l'identifiant du compte : sur un appareil partagé, le plan
 * d'un compte n'est jamais montré au suivant.
 *
 * Module pur (le stockage est passé en argument) : testé sans navigateur.
 */
import type { StudyPlan } from "../../api/lib/learning-profile";

export type StoredPlan = StudyPlan & { createdAt: number };

export interface PlanState {
  plan: StoredPlan;
  /** Identifiants des tâches cochées. */
  done: string[];
}

export interface PlanStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

const keyFor = (userId: string) => `tred.studyPlan.v1:${userId}`;

function isPlanState(v: unknown): v is PlanState {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const s = v as { plan?: { createdAt?: unknown; days?: unknown; concepts?: unknown }; done?: unknown };
  const days = s.plan?.days;
  return (
    Array.isArray(s.done) &&
    s.done.every((id) => typeof id === "string") &&
    typeof s.plan?.createdAt === "number" &&
    Number.isFinite(s.plan.createdAt) &&
    Array.isArray(s.plan.concepts) &&
    Array.isArray(days) &&
    days.length > 0 &&
    days.every((d) => d && typeof d === "object" && typeof (d as { day?: unknown }).day === "number" && Array.isArray((d as { tasks?: unknown }).tasks))
  );
}

/** Le plan de CE compte, ou `null` : absent, abîmé, d'une autre forme, ou stockage refusé. */
export function loadPlan(userId: string, storage: PlanStorage): PlanState | null {
  try {
    const raw = storage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isPlanState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function savePlan(userId: string, state: PlanState, storage: PlanStorage): void {
  try {
    storage.setItem(keyFor(userId), JSON.stringify(state));
  } catch {
    /* navigation privée ou quota : le plan reste affiché, il ne survivra pas au rechargement */
  }
}

export function clearPlan(userId: string, storage: PlanStorage): void {
  try {
    storage.removeItem(keyFor(userId));
  } catch {
    /* rien à effacer */
  }
}

export const toggleDone = (done: readonly string[], id: string): string[] => (done.includes(id) ? done.filter((d) => d !== id) : [...done, id]);

/** L'avancement : les coches qui correspondent à une tâche du plan, sur le nombre de tâches. */
export function planProgress(plan: Pick<StudyPlan, "days">, done: readonly string[]): { done: number; total: number } {
  const ids = new Set(plan.days.flatMap((d) => d.tasks.map((t) => t.id)));
  return { done: new Set(done.filter((id) => ids.has(id))).size, total: ids.size };
}

const midnight = (ms: number) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Le jour du plan aujourd'hui (1 = jour de création), en jours de CALENDRIER, à l'heure de l'appareil. */
export function planDay(createdAt: number, now: number): number {
  // Arrondi : un changement d'heure fait des journées de 23 ou 25 heures.
  return Math.round((midnight(now) - midnight(createdAt)) / 86_400_000) + 1;
}

export const planExpired = (createdAt: number, now: number, days = 7): boolean => planDay(createdAt, now) > days;

/** La date du jour `day` du plan (1 = jour de création). */
export function dateOfDay(createdAt: number, day: number): Date {
  const d = new Date(midnight(createdAt));
  d.setDate(d.getDate() + day - 1);
  return d;
}
