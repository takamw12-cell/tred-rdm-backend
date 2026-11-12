/**
 * L'essai gratuit : 14 jours illimités, UNE seule fois par compte, sans carte.
 *
 * ── La règle (décision du 12 nov. 2026) ───────────────────────────────────
 *
 *   - `user_access.trial_ends_at` (millisecondes) est posé une seule fois.
 *     NULL = l'essai n'a jamais commencé ; une date passée = essai terminé.
 *   - Un nouveau compte commence son essai à l'inscription (auth.ts). Un
 *     compte d'avant cette règle peut le lancer lui-même, une fois
 *     (`subscriptions.startTrial`).
 *   - Rien ne « bascule » en base à la fin : `getPlan()` (lib/plan.ts) compare
 *     la date à l'heure courante à CHAQUE requête. Passé l'échéance, le compte
 *     est simplement lu comme Free. Pas de tâche planifiée qui pourrait
 *     tomber en panne et laisser un essai ouvert.
 *
 * ── SQL direct ────────────────────────────────────────────────────────────
 *
 * Même raison que lib/stored-profile-db.ts : la colonne n'est PAS déclarée
 * dans le schéma Drizzle, car le code est déployé avant que le fondateur
 * lance `migre-trial.mjs`. Tant que la colonne manque, il n'y a simplement
 * pas d'essai (`migrated: false`) et l'app se comporte comme avant.
 */
import { sql, type SQL } from "drizzle-orm";

export const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TrialDb {
  all: <T = unknown>(query: SQL) => Promise<T[]>;
  run: (query: SQL) => Promise<unknown>;
}

export interface TrialState {
  /** La colonne existe-t-elle ? Sinon, pas d'essai du tout. */
  migrated: boolean;
  /** L'essai est en cours. */
  active: boolean;
  /** Fin de l'essai (ms), ou null s'il n'a jamais commencé. */
  endsAt: number | null;
  /** Jours restants, arrondis vers le haut : « il te reste 1 jour » jusqu'à la dernière minute. */
  daysLeft: number;
  /** L'essai peut encore être lancé (jamais utilisé). */
  available: boolean;
}

/** État de l'essai à partir de la date stockée. Fonction pure (testée). */
export function trialState(endsAt: number | null, now = Date.now(), migrated = true): TrialState {
  if (!migrated) return { migrated: false, active: false, endsAt: null, daysLeft: 0, available: false };
  if (endsAt === null) return { migrated: true, active: false, endsAt: null, daysLeft: 0, available: true };
  const left = endsAt - now;
  const active = left > 0;
  return { migrated: true, active, endsAt, daysLeft: active ? Math.ceil(left / DAY_MS) : 0, available: false };
}

const missingColumn = (e: unknown) =>
  /no such column|has no column/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ""));

/** L'essai de CE compte. Ne lève jamais pour une migration manquante. */
export async function readTrial(db: TrialDb, userId: string, now = Date.now()): Promise<TrialState> {
  let rows: Array<{ trial_ends_at: number | null }>;
  try {
    rows = await db.all(sql`SELECT trial_ends_at FROM user_access WHERE user_id = ${userId} LIMIT 1`);
  } catch (e) {
    if (missingColumn(e)) return trialState(null, now, false);
    throw e;
  }
  const raw = rows[0]?.trial_ends_at;
  return trialState(raw == null ? null : Number(raw), now);
}

/**
 * Lance l'essai, s'il n'a jamais commencé. `WHERE trial_ends_at IS NULL` est
 * la garantie « une seule fois » : deux clics simultanés, ou un second appel
 * un an plus tard, ne touchent aucune ligne.
 */
export async function startTrial(db: TrialDb, userId: string, now = Date.now()): Promise<TrialState & { started: boolean }> {
  const endsAt = now + TRIAL_DAYS * DAY_MS;
  const seconds = Math.floor(now / 1000);
  try {
    const avant = await readTrial(db, userId, now);
    if (!avant.migrated || !avant.available) return { ...avant, started: false };
    // La ligne existe presque toujours (créée par getAccess à la première requête).
    await db.run(sql`INSERT OR IGNORE INTO user_access (user_id, updated_at) VALUES (${userId}, ${seconds})`);
    await db.run(sql`UPDATE user_access SET trial_ends_at = ${endsAt} WHERE user_id = ${userId} AND trial_ends_at IS NULL`);
  } catch (e) {
    if (missingColumn(e)) return { ...trialState(null, now, false), started: false };
    throw e;
  }
  const apres = await readTrial(db, userId, now);
  return { ...apres, started: apres.endsAt === endsAt };
}
