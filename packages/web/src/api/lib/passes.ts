/**
 * Les « Pass » : un paiement UNIQUE qui ouvre l'accès Étudiant pour une durée,
 * sans abonnement (décision du fondateur, 18 nov. 2026, après le panel
 * d'acheteurs : 14,99 €/mois « pour trois semaines d'examens » ne passait pas).
 *
 *   Klausur-Pass    9,99 €   30 jours
 *   Semester-Pass  39,99 €    6 mois   (grille du 18 nov. 2026 au soir : six
 *                                       Klausur-Pass coûteraient 59,94 €)
 *
 * Le prix affiché vient de Stripe (STRIPE_PRICE_PASS_KLAUSUR /
 * STRIPE_PRICE_PASS_SEMESTER, prix « paiement unique ») ; la grille ci-dessous
 * sert de référence et d'affichage tant que Stripe n'est pas configuré.
 *
 * Un Pass ne se renouvelle pas : à l'échéance, `effectivePlan()` (lib/plan.ts)
 * rend le compte Free tout seul, sans tâche planifiée. Acheté pendant un accès
 * encore valable, il PROLONGE cet accès au lieu de le recouvrir.
 *
 * Module pur (aucune base, aucun Stripe) : tests/stripe-foundations.test.ts.
 */

export type PassKind = "klausur" | "semester";

export const PASSES = {
  klausur: { amount: 999, days: 30, months: 0, env: "STRIPE_PRICE_PASS_KLAUSUR", label: "Klausur-Pass" },
  semester: { amount: 3999, days: 0, months: 6, env: "STRIPE_PRICE_PASS_SEMESTER", label: "Semester-Pass" },
} as const satisfies Record<PassKind, { amount: number; days: number; months: number; env: string; label: string }>;

export const PASS_KINDS = Object.keys(PASSES) as PassKind[];

/** Ce que `user_plan.subscription_status` porte pour un accès acheté par Pass. */
export const PASS_STATUS = "pass";

type Env = Record<string, string | undefined>;

/**
 * Ce que le Semester-Pass fait économiser face à des Klausur-Pass achetés pour
 * la même durée, en pourcentage ARRONDI VERS LE BAS : le badge ne promet jamais
 * plus que la réalité (39,99 € contre 6 × 9,99 € = 59,94 € → 33 %).
 */
export function semesterSavingPercent(klausurAmount: number = PASSES.klausur.amount, semesterAmount: number = PASSES.semester.amount, months: number = PASSES.semester.months): number {
  const full = klausurAmount * months;
  if (full <= 0 || semesterAmount >= full) return 0;
  return Math.floor(((full - semesterAmount) / full) * 100);
}

export function passPriceId(kind: PassKind, env: Env = process.env): string | null {
  return env[PASSES[kind].env]?.trim() || null;
}

export function isPassKind(value: unknown): value is PassKind {
  return typeof value === "string" && (PASS_KINDS as string[]).includes(value);
}

/**
 * La nouvelle échéance. On part de l'échéance actuelle si l'accès payé court
 * encore (le Pass prolonge), sinon de maintenant.
 */
export function passValidUntil(kind: PassKind, current: { plan?: string | null; validUntil?: Date | null }, now: Date = new Date()): Date {
  const stillPaid = current.plan === "premium" && current.validUntil instanceof Date && current.validUntil.getTime() > now.getTime();
  const until = new Date(stillPaid ? current.validUntil!.getTime() : now.getTime());
  const pass = PASSES[kind];
  if (pass.months > 0) {
    // Mois de calendrier ; un 31 qui n'existe pas dans le mois d'arrivée retombe sur son dernier jour.
    const day = until.getUTCDate();
    until.setUTCDate(1);
    until.setUTCMonth(until.getUTCMonth() + pass.months);
    const lastDay = new Date(Date.UTC(until.getUTCFullYear(), until.getUTCMonth() + 1, 0)).getUTCDate();
    until.setUTCDate(Math.min(day, lastDay));
  }
  if (pass.days > 0) until.setUTCDate(until.getUTCDate() + pass.days);
  return until;
}
