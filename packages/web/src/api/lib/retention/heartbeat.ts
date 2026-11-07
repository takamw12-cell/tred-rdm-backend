import { and, eq, lte } from "drizzle-orm";

import { db } from "../../database";
import { jobRun } from "../../database/schema";
import { cycleDue, decideAction, inSendWindow, intervalHoursFromEnv, type Decision, type RetentionActionKind } from "./agent";
import { scanUsers } from "./scan";
import { disabledByEnv, HEARTBEAT_JOB, isPaused, recordAndSend } from "./store";

/**
 * Le battement de cœur de l'agent de rétention.
 *
 * Comme la relance du soir : une minuterie dans le serveur (pas de service à
 * payer en plus, pas de version qui diverge), réveillée tous les quarts
 * d'heure. Elle ne fait un CYCLE que si :
 *   - l'agent n'est pas en pause (/admin/retention ; en pause par défaut),
 *   - il est entre 9 h et 20 h à Berlin,
 *   - le dernier cycle date d'au moins RETENTION_INTERVAL_HOURS (12 h par défaut),
 *   - et cette réplique a pris le verrou en base (une seule réplique par cycle).
 *
 * Un cycle : lire l'état de chacun (scan.ts), décider (agent.ts, déterministe),
 * écrire et envoyer (store.ts). Au plus une notification par étudiant et par
 * jour — la règle est dans la décision, et la ligne écrite avant l'envoi.
 */

const PERIODE_MS = 15 * 60_000;
const MAX_SENDS_PER_CYCLE = 500;

export interface CycleSummary {
  scanned: number;
  actions: Record<RetentionActionKind, number>;
  pushSent: number;
  skipped: number;
  /** Pour l'aperçu admin : qui recevrait quoi, et pourquoi. */
  decisions: { userId: string; decision: Decision }[];
}

/** Un cycle complet. `dryRun` : décide sans rien écrire ni envoyer (aperçu admin). */
export async function runRetentionCycle(opts: { now?: Date; dryRun?: boolean } = {}): Promise<CycleSummary> {
  const now = opts.now ?? new Date();
  const scanned = await scanUsers(now);
  const summary: CycleSummary = {
    scanned: scanned.length,
    actions: { send_push_notification: 0, create_flashcard: 0, send_daily_digest: 0 },
    pushSent: 0,
    skipped: 0,
    decisions: [],
  };
  for (const { user, context } of scanned) {
    const decision = decideAction(user, context);
    summary.decisions.push({ userId: user.id, decision });
    if (decision.action === "none") {
      summary.skipped += 1;
      continue;
    }
    summary.actions[decision.action] += 1;
    if (opts.dryRun) continue;
    if (summary.actions.send_push_notification + summary.actions.create_flashcard + summary.actions.send_daily_digest > MAX_SENDS_PER_CYCLE) break;
    // En série : cinq cents envois d'un coup satureraient la connexion sortante
    // pendant que d'autres étudiants utilisent l'application.
    const r = await recordAndSend(user, decision, now);
    summary.pushSent += r.pushSent;
  }
  return summary;
}

/** Prend le verrou du cycle si l'intervalle est écoulé. Une seule réplique gagne. */
async function takeLock(now: Date, intervalHours: number): Promise<boolean> {
  await db.insert(jobRun).values({ key: HEARTBEAT_JOB, ranAt: 0, note: "" }).onConflictDoNothing();
  const [row] = await db.select({ ranAt: jobRun.ranAt }).from(jobRun).where(eq(jobRun.key, HEARTBEAT_JOB)).limit(1);
  if (!row || !cycleDue(row.ranAt, now, intervalHours)) return false;
  // UPDATE conditionnel atomique : deux répliques ne peuvent pas toutes deux le gagner.
  const res = await db
    .update(jobRun)
    .set({ ranAt: now.getTime() })
    .where(and(eq(jobRun.key, HEARTBEAT_JOB), lte(jobRun.ranAt, now.getTime() - intervalHours * 60 * 60_000)));
  return ((res as unknown as { rowsAffected?: number }).rowsAffected ?? 0) > 0;
}

let minuterie: ReturnType<typeof setInterval> | null = null;
let tablesMissingLogged = false;

export function startRetentionHeartbeat(): void {
  if (minuterie) return;
  if (disabledByEnv()) {
    console.log("[retention] désactivé par l'environnement (DISABLE_RETENTION_AGENT)");
    return;
  }
  const intervalHours = intervalHoursFromEnv(process.env.RETENTION_INTERVAL_HOURS);

  const tour = async () => {
    try {
      const now = new Date();
      if (!inSendWindow(now)) return;
      if (await isPaused()) return;
      if (!(await takeLock(now, intervalHours))) return;
      const s = await runRetentionCycle({ now });
      const note =
        `${s.scanned} étudiants · relances ${s.actions.send_push_notification} · cartes proposées ${s.actions.create_flashcard}` +
        ` · récapitulatifs ${s.actions.send_daily_digest} · push ${s.pushSent} · rien à faire ${s.skipped}`;
      await db.update(jobRun).set({ note }).where(eq(jobRun.key, HEARTBEAT_JOB));
      console.log(`[retention] ${note}`);
    } catch (error) {
      // Tables absentes : le dire une fois, pas tous les quarts d'heure.
      const msg = String((error as Error)?.message ?? error);
      if (/no such table/i.test(msg)) {
        if (!tablesMissingLogged) console.warn("[retention] tables absentes — lance migre-retention.mjs");
        tablesMissingLogged = true;
        return;
      }
      // Une tâche de fond qui jette tue le processus : échouer en silence, réessayer au tour suivant.
      console.error("[retention] échec du cycle", error);
    }
  };

  minuterie = setInterval(() => void tour(), PERIODE_MS);
  minuterie.unref?.();
  console.log(`[retention] battement actif — cycle toutes les ${intervalHours} h, 9 h–20 h Berlin (en pause tant que /admin/retention ne l'active pas)`);
}

export function stopRetentionHeartbeat(): void {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}
