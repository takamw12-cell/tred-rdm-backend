import { eq } from "drizzle-orm";

import { hogql } from "../analytics/routes";
import { posthogQueryConfigured } from "../analytics/posthog-diagnostic";
import { db } from "../database";
import { jobRun } from "../database/schema";
import { adminWhitelist } from "./admin-guard";
import { prendreLeVerrou } from "./evening-reminder";
import { mailConfigured, sendMail } from "./mail";
import { collectCounts, headline, inSendWindow, mergeVideoRows, renderDigest, SEND_FROM_HOUR, DIGEST_TIMEZONE, type DigestData, type DigestDb, type VisitRow } from "./morning-digest";

/**
 * Le résumé du matin, envoyé : chaque jour à 8 h (Berlin), un e-mail aux
 * adresses de `ADMIN_EMAILS` — « X visiteurs, Y inscriptions, Z imports,
 * W vidéos générées », et le détail par vidéo. Le calcul et le texte sont dans
 * morning-digest.ts (pur, testé) ; ici, la boucle, le verrou et l'envoi.
 *
 * Même construction que la relance du soir (evening-reminder.ts) : une boucle
 * dans le serveur, pas un service planifié de plus, et un verrou en base
 * (`job_run`, clé « morning_digest ») pour qu'un seul envoi parte par jour,
 * même avec plusieurs répliques.
 *
 * Rien ne part si `ADMIN_EMAILS` est vide ou si l'e-mail n'est pas configuré
 * (RESEND_API_KEY). `DISABLE_MORNING_DIGEST=true` coupe la boucle.
 * Les journaux ne portent que des comptes : jamais une adresse.
 */

const JOB = "morning_digest";
const PERIODE_MS = 15 * 60_000;
const num = (v: unknown) => Number(v ?? 0) || 0;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);

/** Visiteurs (personnes distinctes avec une page vue) par lien de campagne, 24 h et 7 jours. `null` : PostHog indisponible. */
async function visits(): Promise<{ total24: number; total7: number; rows: VisitRow[] } | null> {
  if (!posthogQueryConfigured()) return null;
  try {
    const [totals, rows] = await Promise.all([
      hogql(`
        SELECT uniqIf(person_id, timestamp >= now() - INTERVAL 24 HOUR), uniq(person_id)
        FROM events
        WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY`),
      hogql(`
        SELECT properties.utm_source AS source, properties.utm_campaign AS campaign, properties.utm_content AS content,
               uniqIf(person_id, timestamp >= now() - INTERVAL 24 HOUR) AS visitors_24h,
               uniq(person_id) AS visitors_7d
        FROM events
        WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 7 DAY
        GROUP BY source, campaign, content
        ORDER BY visitors_7d DESC
        LIMIT 30`),
    ]);
    return {
      total24: num(totals[0]?.[0]),
      total7: num(totals[0]?.[1]),
      rows: rows.map((r) => ({ source: str(r[0]), campaign: str(r[1]), content: str(r[2]), visitors24: num(r[3]), visitors7: num(r[4]) })),
    };
  } catch {
    // hogql() a déjà journalisé le statut ; le résumé part sans les visiteurs.
    return null;
  }
}

/** Les chiffres du jour, prêts à être rendus. */
export async function buildDigest(maintenant: Date = new Date()): Promise<DigestData> {
  const [counts, seen] = await Promise.all([collectCounts(db as unknown as DigestDb, maintenant.getTime()), visits()]);
  return {
    until: maintenant.getTime(),
    visitors24: seen?.total24 ?? null,
    visitors7: seen?.total7 ?? null,
    signups24: counts.signups24,
    signups7: counts.signups7,
    imports24: counts.imports24,
    videos24: counts.videos24,
    videosFailed24: counts.videosFailed24,
    utmMigrated: counts.signupsByVideo24 !== null,
    byVideo: mergeVideoRows({ signups24: counts.signupsByVideo24, signups7: counts.signupsByVideo7, visits: seen?.rows ?? null, totalSignups24: counts.signups24, totalSignups7: counts.signups7 }),
  };
}

/** Calcule et envoie. Rend la ligne de résumé et le nombre d'e-mails partis. */
export async function sendMorningDigest(maintenant: Date = new Date()): Promise<{ line: string; sent: number; recipients: number }> {
  const data = await buildDigest(maintenant);
  const mail = renderDigest(data);
  const recipients = adminWhitelist();
  let sent = 0;
  for (const to of recipients) {
    const result = await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
    if (result.ok) sent += 1;
  }
  return { line: headline(data), sent, recipients: recipients.length };
}

let minuterie: ReturnType<typeof setInterval> | null = null;
let prevenu = false;

/** Démarre la boucle. Appelée une fois au lancement du serveur (api/index.ts). */
export function startMorningDigest(): void {
  if (minuterie) return;
  if (process.env.DISABLE_MORNING_DIGEST === "true") {
    console.log("[resume] désactivé par l'environnement");
    return;
  }

  const tour = async () => {
    try {
      const maintenant = new Date();
      if (!inSendWindow(maintenant)) return;
      if (adminWhitelist().length === 0 || !mailConfigured()) {
        if (!prevenu) console.warn("[resume] pas d'envoi : ADMIN_EMAILS vide ou RESEND_API_KEY absente");
        prevenu = true;
        return;
      }
      if (!(await prendreLeVerrou(maintenant, JOB))) return;

      const { line, sent, recipients } = await sendMorningDigest(maintenant);
      const note = `${line} — ${sent}/${recipients} e-mail(s) partis`;
      // Aucun e-mail parti : le verrou est rendu, le prochain tour (15 min) réessaie
      // tant que la fenêtre du matin est ouverte.
      await db
        .update(jobRun)
        .set(sent > 0 ? { note } : { note, ranAt: 0 })
        .where(eq(jobRun.key, JOB));
      console.log(`[resume] ${note}`);
    } catch (error) {
      // Une tâche de fond qui jette tue le processus : elle échoue en silence
      // et le tour suivant réessaie.
      console.error("[resume] échec", error);
    }
  };

  minuterie = setInterval(() => void tour(), PERIODE_MS);
  minuterie.unref?.();
  console.log(`[resume] actif — ${SEND_FROM_HOUR} h ${DIGEST_TIMEZONE}, vérifié tous les quarts d'heure`);
}

/** Pour les tests et l'arrêt propre. */
export function stopMorningDigest(): void {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}
