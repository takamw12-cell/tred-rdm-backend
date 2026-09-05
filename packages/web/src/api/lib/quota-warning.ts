import { and, eq, inArray } from "drizzle-orm";

import { db } from "../database";
import { purchasedCredits, usageCounter, userPlan } from "../database/schema";
import { LIMITS, currentPeriod, type PlanId } from "./plan";

/**
 * L'avertissement « tu approches de ta limite ».
 *
 * ── Pourquoi il n'est PAS envoyé au moment du franchissement ──────────────
 *
 * Une version antérieure de `push.ts` contenait un `notifyQuotaReached` jamais
 * appelé, et son retrait était commenté ainsi : le quota ne se dépasse jamais
 * en arrière-plan, toujours sur un geste — donc une notification poussée
 * arriverait pendant que l'étudiant lit déjà le message à l'écran. C'était
 * juste, et ça reste juste.
 *
 * Le compteur n'avance que lorsqu'on se sert de l'application. Prévenir au
 * franchissement, c'est donc prévenir quelqu'un qui regarde l'écran. Le
 * bandeau du chat s'en charge, et mieux.
 *
 * Ce module envoie l'avertissement le SOIR, avec la relance de révision déjà
 * en place — c'est-à-dire au seul moment où il apporte quelque chose : quand
 * l'application est fermée, et qu'il reste une soirée pour recharger avant la
 * veille de la Klausur.
 *
 * ── Qui reçoit ────────────────────────────────────────────────────────────
 *
 * Seulement ceux pour qui la limite va réellement mordre :
 *
 *   • au moins 90 % du quota mensuel consommé, ET
 *   • aucun crédit acheté en réserve — avec des crédits, rien ne s'arrête,
 *     et l'avertissement serait un faux signal, ET
 *   • pas déjà prévenu ce mois-ci.
 *
 * Une notification qui se trompe une fois est désactivée pour toujours, avec
 * toutes celles qui suivent. Le filtre est donc volontairement plus étroit que
 * nécessaire.
 *
 * ── La marque « déjà prévenu » ────────────────────────────────────────────
 *
 * Écrite dans `usage_counter` sous la métrique `quota_warned`. Aucune
 * migration : la table est déjà clefée sur (utilisateur, période, métrique),
 * et la marque expire donc d'elle-même le 1er du mois, exactement comme le
 * quota qu'elle accompagne. Une colonne dédiée aurait demandé un `ALTER TABLE`
 * et une règle de remise à zéro à écrire — puis à ne pas oublier.
 */

/** Part du quota à partir de laquelle on prévient. */
export const SEUIL_ALERTE = 0.9;

/** La métrique-marqueur. Jamais lue par `consume`, qui ne connaît pas ce nom. */
const MARQUE = "quota_warned";

export interface AlerteQuota {
  userId: string;
  used: number;
  limit: number;
  restants: number;
}

/**
 * Parmi `ids`, ceux qu'il faut prévenir ce soir.
 *
 * Trois lectures groupées plutôt qu'une par étudiant : à cinq cents comptes,
 * la version naïve ferait quinze cents allers-retours vers Turso pour une
 * poignée de notifications.
 */
export async function quiEstPresqueAuBout(ids: string[]): Promise<AlerteQuota[]> {
  if (ids.length === 0) return [];
  const periode = currentPeriod();

  const [compteurs, tarifs, soldes] = await Promise.all([
    db
      .select({
        userId: usageCounter.userId,
        metric: usageCounter.metric,
        count: usageCounter.count,
      })
      .from(usageCounter)
      .where(and(inArray(usageCounter.userId, ids), eq(usageCounter.period, periode))),
    db
      .select({ userId: userPlan.userId, plan: userPlan.plan, validUntil: userPlan.validUntil })
      .from(userPlan)
      .where(inArray(userPlan.userId, ids)),
    db
      .select({
        userId: purchasedCredits.userId,
        credits: purchasedCredits.creditsRemaining,
      })
      .from(purchasedCredits)
      .where(inArray(purchasedCredits.userId, ids)),
  ]);

  const chatParUtilisateur = new Map<string, number>();
  const dejaPrevenu = new Set<string>();
  for (const c of compteurs) {
    if (c.metric === "chat") chatParUtilisateur.set(c.userId, Number(c.count));
    if (c.metric === MARQUE) dejaPrevenu.add(c.userId);
  }

  const planParUtilisateur = new Map<string, PlanId>();
  for (const t of tarifs) {
    // Même règle que `getPlan` : un abonnement expiré retombe sur "free". La
    // recopier ici évite N appels ; la divergence serait un bogue silencieux,
    // d'où le commentaire.
    const perime = t.validUntil !== null && t.validUntil.getTime() < Date.now();
    planParUtilisateur.set(t.userId, perime || !t.plan ? "free" : (t.plan as PlanId));
  }

  const soldeParUtilisateur = new Map(soldes.map((s) => [s.userId, Number(s.credits)]));

  const alertes: AlerteQuota[] = [];
  for (const userId of ids) {
    if (dejaPrevenu.has(userId)) continue;
    if ((soldeParUtilisateur.get(userId) ?? 0) > 0) continue;

    const plan = planParUtilisateur.get(userId) ?? "free";
    const limite = LIMITS[plan].chat;
    const used = chatParUtilisateur.get(userId) ?? 0;
    if (limite <= 0) continue;
    if (used / limite < SEUIL_ALERTE) continue;

    alertes.push({ userId, used, limit: limite, restants: Math.max(0, limite - used) });
  }

  return alertes;
}

/** Pose la marque du mois. Idempotente. */
export async function marquerPrevenu(userId: string): Promise<void> {
  const periode = currentPeriod();
  await db
    .insert(usageCounter)
    .values({ userId, period: periode, metric: MARQUE, count: 1 })
    .onConflictDoNothing();
}

/** Les textes, dans les trois langues que le mobile sait afficher. */
export const TEXTES_QUOTA: Record<
  string,
  { titre: string; corps: (restants: number) => string }
> = {
  de: {
    titre: "Dein Kontingent geht zur Neige",
    corps: (n) =>
      n === 0
        ? "Dein Monatskontingent ist aufgebraucht. Guthaben aufladen und weitermachen."
        : n === 1
          ? "Noch eine Frage diesen Monat. Guthaben aufladen, bevor es eng wird."
          : `Noch ${n} Fragen diesen Monat. Guthaben aufladen, bevor es eng wird.`,
  },
  en: {
    titre: "Your allowance is running low",
    corps: (n) =>
      n === 0
        ? "This month's allowance is used up. Top up to keep going."
        : n === 1
          ? "One question left this month. Top up before it runs out."
          : `${n} questions left this month. Top up before it runs out.`,
  },
  fr: {
    titre: "Ton forfait s'épuise",
    corps: (n) =>
      n === 0
        ? "Ton forfait du mois est épuisé. Recharge pour continuer."
        : n === 1
          ? "Il te reste une question ce mois-ci. Recharge avant d'être bloqué."
          : `Il te reste ${n} questions ce mois-ci. Recharge avant d'être bloqué.`,
  },
};
