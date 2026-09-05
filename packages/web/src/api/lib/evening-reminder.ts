import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "../database";
import { jobRun, misconception, pushToken, userAccess } from "../database/schema";
import { sendNotification } from "./push";
import {
  marquerPrevenu,
  quiEstPresqueAuBout,
  TEXTES_QUOTA,
} from "./quota-warning";

/**
 * La relance du soir.
 *
 * ── Le trou qu'elle bouche ────────────────────────────────────────────────
 *
 * La répétition espacée était complète sauf sur un point : elle écrivait des
 * rendez-vous que personne ne tenait. `dueAt` avançait, l'intervalle doublait,
 * et l'étudiant ne l'apprenait qu'en ouvrant TRED de lui-même — ce qui vide de
 * son sens l'idée même d'espacer. Un système de révision dont le déclencheur
 * est « si l'étudiant y pense » ne révise personne.
 *
 * ── Pourquoi dans le processus, et pas un service à part ──────────────────
 *
 * Un service planifié de plus, c'est une facture, une configuration, et un
 * endroit supplémentaire où le déploiement peut diverger du code. Ici la
 * boucle vit dans le serveur : elle part avec lui, se met à jour avec lui, et
 * ne peut pas rester sur une ancienne version.
 *
 * Le prix à payer est le double envoi si deux répliques tournent. D'où le
 * verrou en base, qui coûte une requête par quart d'heure.
 */

/** La clé du verrou dans `job_run`. */
const JOB = "evening_reminder";

/** 19 h, heure de Berlin. Après le trajet du retour, avant la soirée. */
const HEURE_LOCALE = 19;

/** Le fuseau de référence. Tes étudiants sont à Aix-la-Chapelle. */
const FUSEAU = "Europe/Berlin";

/**
 * Toutes les quinze minutes. Assez fin pour toucher la bonne heure, assez
 * large pour que le réveil coûte moins qu'une requête de santé.
 */
const PERIODE_MS = 15 * 60_000;

/** Personne ne lit une notification qui parle de trente lacunes. */
const MAX_UTILISATEURS = 500;

/**
 * L'heure locale à Berlin, quel que soit le fuseau du serveur.
 *
 * Railway tourne en UTC, et l'Allemagne change d'heure deux fois par an :
 * calculer « 19 h moins deux » donnerait 18 h en hiver et 20 h en été. `Intl`
 * connaît les règles, pas nous.
 */
function heureBerlin(maintenant: Date): number {
  const h = new Intl.DateTimeFormat("de-DE", {
    timeZone: FUSEAU,
    hour: "numeric",
    hour12: false,
  }).format(maintenant);
  return Number.parseInt(h, 10);
}

/** Minuit à Berlin, en millisecondes — la borne du « déjà fait aujourd'hui ». */
function debutDeJourneeBerlin(maintenant: Date): number {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSEAU,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(maintenant);
  // « 2026-09-03 » à minuit UTC : approximation d'au plus deux heures, ce qui
  // suffit largement à distinguer deux journées.
  return Date.parse(`${parties}T00:00:00Z`);
}

/**
 * Tente de prendre le verrou de la journée.
 *
 * Renvoie `true` à une seule réplique. Le `UPDATE` conditionnel est atomique :
 * deux répliques qui l'exécutent en même temps ne peuvent pas toutes deux
 * toucher une ligne.
 */
async function prendreLeVerrou(maintenant: Date): Promise<boolean> {
  const debut = debutDeJourneeBerlin(maintenant);

  // La ligne doit exister avant de pouvoir être verrouillée. `DO NOTHING` rend
  // l'appel sans effet dès la deuxième fois.
  await db
    .insert(jobRun)
    .values({ key: JOB, ranAt: 0, note: "" })
    .onConflictDoNothing();

  const res = await db
    .update(jobRun)
    .set({ ranAt: maintenant.getTime() })
    .where(and(eq(jobRun.key, JOB), lte(jobRun.ranAt, debut)));

  return ((res as unknown as { rowsAffected?: number }).rowsAffected ?? 0) > 0;
}

/** Les textes, dans les trois langues que le mobile sait afficher. */
const TEXTES: Record<string, { titre: string; corps: (n: number) => string }> = {
  de: {
    titre: "Zeit für deine Wiederholung",
    corps: (n) =>
      n === 1
        ? "Eine Lücke wartet auf dich. Fünf Minuten reichen."
        : `${n} Lücken warten auf dich. Fünf Minuten reichen.`,
  },
  en: {
    titre: "Time for your review",
    corps: (n) =>
      n === 1
        ? "One gap is waiting. Five minutes is enough."
        : `${n} gaps are waiting. Five minutes is enough.`,
  },
  fr: {
    titre: "C'est l'heure de réviser",
    corps: (n) =>
      n === 1
        ? "Une lacune t'attend. Cinq minutes suffisent."
        : `${n} lacunes t'attendent. Cinq minutes suffisent.`,
  },
};

/**
 * Le balayage : qui a des révisions dues, et un appareil pour l'apprendre.
 *
 * ── L'ordre des filtres n'est pas indifférent ─────────────────────────────
 *
 * On part des JETONS, pas des lacunes. La grande majorité des comptes n'aura
 * jamais installé l'application ; commencer par les lacunes ferait lire toute
 * la table pour n'en garder qu'une poignée.
 */
export async function balayerRelances(): Promise<{
  envoyes: number;
  vises: number;
  alertesQuota: number;
}> {
  // Les utilisateurs joignables. `groupBy` plutôt que `distinct` : un étudiant
  // avec un téléphone et une tablette ne doit compter qu'une fois.
  const joignables = await db
    .select({ userId: pushToken.userId })
    .from(pushToken)
    .groupBy(pushToken.userId)
    .limit(MAX_UTILISATEURS);

  if (joignables.length === 0) return { envoyes: 0, vises: 0, alertesQuota: 0 };

  const ids = joignables.map((r) => r.userId);
  const maintenant = new Date();

  // La langue enregistrée sur le serveur — la seule connue quand
  // l'application est fermée. Lue une fois pour les deux messages.
  const languesToutes = await db
    .select({ userId: userAccess.userId, locale: userAccess.locale })
    .from(userAccess)
    .where(inArray(userAccess.userId, ids));
  const langueDe = new Map(languesToutes.map((l) => [l.userId, l.locale]));

  /**
   * L'alerte de quota passe AVANT la relance de révision, et l'exclut.
   *
   * Deux notifications le même soir au même étudiant, c'est le début de la fin
   * des notifications : il les coupe toutes, y compris celle qui le fait
   * réviser. Et entre les deux, l'ordre n'est pas discutable — quelqu'un qui
   * ne peut plus poser de question ne peut pas réviser non plus. On lui dit
   * d'abord ce qui le bloque.
   */
  const alertes = await quiEstPresqueAuBout(ids);
  let alertesQuota = 0;
  const prevenus = new Set<string>();

  for (const a of alertes) {
    const texte = TEXTES_QUOTA[langueDe.get(a.userId) ?? "de"] ?? TEXTES_QUOTA.de;
    const r = await sendNotification({
      userId: a.userId,
      title: texte.titre,
      body: texte.corps(a.restants),
      data: { type: "quota_low", screen: "credits", remaining: a.restants },
    });
    // La marque n'est posée QUE si la notification est partie. Sinon un échec
    // réseau ferait taire l'alerte pour tout le mois.
    if (r.sent > 0) {
      await marquerPrevenu(a.userId);
      prevenus.add(a.userId);
      alertesQuota += r.sent;
    }
  }

  // Combien de lacunes dues par étudiant, en une requête. La même condition
  // que `dueGaps` : ouverte, et sans échéance ou échéance passée.
  const dues = await db
    .select({ userId: misconception.userId, n: sql<number>`count(*)` })
    .from(misconception)
    .where(
      and(
        inArray(misconception.userId, ids),
        eq(misconception.status, "open"),
        or(isNull(misconception.dueAt), lte(misconception.dueAt, maintenant)),
      ),
    )
    .groupBy(misconception.userId);

  const aRelancer = dues.filter(
    (d) => Number(d.n) > 0 && !prevenus.has(d.userId),
  );
  if (aRelancer.length === 0) return { envoyes: 0, vises: 0, alertesQuota };

  let envoyes = 0;
  for (const d of aRelancer) {
    const n = Number(d.n);
    const texte = TEXTES[langueDe.get(d.userId) ?? "de"] ?? TEXTES.de;

    // En série et non en parallèle : cinq cents notifications lancées d'un
    // coup saturent la connexion sortante et font expirer les requêtes des
    // étudiants qui, eux, sont en train de se servir de l'application.
    const r = await sendNotification({
      userId: d.userId,
      title: texte.titre,
      body: texte.corps(n),
      data: { type: "review_due", screen: "review", count: n },
    });
    envoyes += r.sent;
  }

  return { envoyes, vises: aRelancer.length, alertesQuota };
}

let minuterie: ReturnType<typeof setInterval> | null = null;

/**
 * Démarre la boucle. Appelée une fois au lancement du serveur.
 *
 * Elle ne fait rien tant que ce n'est pas l'heure à Berlin, et rien non plus
 * si une autre réplique a déjà pris le verrou du jour.
 */
export function startEveningReminder(): void {
  if (minuterie) return;
  if (process.env.DISABLE_EVENING_REMINDER === "true") {
    console.log("[relance] désactivée par l'environnement");
    return;
  }

  const tour = async () => {
    try {
      const maintenant = new Date();
      if (heureBerlin(maintenant) !== HEURE_LOCALE) return;
      if (!(await prendreLeVerrou(maintenant))) return;

      const { envoyes, vises, alertesQuota } = await balayerRelances();
      const note = `${envoyes} révisions à ${vises} étudiants · ${alertesQuota} alertes de quota`;
      await db.update(jobRun).set({ note }).where(eq(jobRun.key, JOB));

      console.log(`[relance] ${note}`);
    } catch (error) {
      // Une tâche de fond qui jette tue le processus sous Node. Elle doit
      // échouer en silence et réessayer au tour suivant.
      console.error("[relance] échec du balayage", error);
    }
  };

  minuterie = setInterval(() => void tour(), PERIODE_MS);
  // `unref` : cette minuterie ne doit pas empêcher le processus de s'arrêter
  // proprement quand Railway le remplace.
  minuterie.unref?.();

  console.log(`[relance] active — ${HEURE_LOCALE} h ${FUSEAU}, vérifiée tous les quarts d'heure`);
}

/** Pour les tests et l'arrêt propre. */
export function stopEveningReminder(): void {
  if (minuterie) clearInterval(minuterie);
  minuterie = null;
}
