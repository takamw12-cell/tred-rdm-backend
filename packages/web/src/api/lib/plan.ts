import { and, eq, sql } from "drizzle-orm";
import { db } from "../database";
import { document, usageCounter, userAccess, userPlan } from "../database/schema";
import {
  getPurchasedCredits,
  logTransaction,
  spendPurchasedCredits,
  SPEND_ORDER,
} from "./credits";
import { REWARD, rewardedEnabled } from "./ad-reward";
import { readTrial, TRIAL_DAYS, type TrialDb } from "./trial";

/**
 * "trial" = les 14 jours d'essai illimité (lib/trial.ts). Ce n'est jamais une
 * valeur stockée dans `user_plan` : elle est calculée par `getPlan()`.
 * "premium" = l'abonnement Étudiant (mensuel ou semestriel, mêmes droits).
 */
export type PlanId = "founder" | "free" | "beta" | "trial" | "standard" | "premium";

/**
 * MODE BÊTA (décision du fondateur, 12 nov. 2026) : TRED est 100 % gratuit
 * pour tous les testeurs. Les prix sont prêts mais PAS activés ; ils le
 * seront (et seront revus) au lancement sur l'App Store et le Play Store.
 *
 * Tant que `BILLING_ENABLED` ne vaut pas "true" :
 *   - tout compte non abonné a le tarif "beta" : compteurs illimités en
 *     pratique (mêmes garde-fous anti-abus que l'essai) ;
 *   - aucun paiement ne peut démarrer (abonnement, crédits) ;
 *   - l'essai de 14 jours ne commence pas : il est gardé pour le lancement.
 *
 * Pour activer la facturation : `BILLING_ENABLED=true` dans Railway. Rien
 * d'autre à changer dans le code.
 */
export const betaFree = (): boolean => process.env.BILLING_ENABLED !== "true";

export type Metric = "chat" | "exercise" | "video" | "formulas";

/**
 * LA GRILLE TARIFAIRE (décision du fondateur, 12 nov. 2026).
 *
 *   Free                 0 €            50 chats, 5 vidéos, 10 exercices / mois
 *   Étudiant mensuel     14,99 € / mois 1000 chats, 50 vidéos, 200 exercices / mois
 *   Étudiant semestriel  59,99 € / 6 mois, soit 9,99 € / mois (badge « -30 % »)
 *   Crédits à l'unité    5 € = 50 crédits = 50 chats ou 5 vidéos
 *   Essai                14 jours illimités, une seule fois
 *
 * Les montants ENCAISSÉS restent ceux des prix Stripe (STRIPE_PRICE_*) : la
 * page /pricing affiche ceux de Stripe dès qu'ils sont configurés. Cette
 * grille est la référence : `subscriptions.me` signale dans les logs tout
 * prix Stripe qui s'en écarte, pour qu'on ne facture jamais autre chose que
 * ce qui a été décidé.
 */
export const PRICING = {
  currency: "EUR",
  monthly: { amount: 1499, months: 1 },
  semester: { amount: 5999, months: 6, badge: "-30%" },
  creditPack: { amount: 500, credits: 50 },
  trialDays: TRIAL_DAYS,
} as const;

/**
 * Ce que coûte une action payée en crédits achetés.
 * 50 crédits = 50 chats ou 5 vidéos : une vidéo vaut donc 10 crédits.
 * Un exercice ou une Formelsammlung (réponse longue) en vaut 2.
 */
export const CREDIT_COST: Record<Metric, number> = {
  chat: 1,
  exercise: 2,
  formulas: 2,
  video: 10,
};

/**
 * Monatliche Kontingente je Tarif, plus die Gesamtzahl speicherbarer Dokumente.
 *
 * "Unbegrenzt" ist bewusst KEINE fehlende Prüfung, sondern eine sehr hohe
 * Obergrenze. Jede KI-Antwort kostet echtes Geld: ohne jede Schranke genügt
 * eine Schleife im Client oder ein einziger Missbrauchsfall, um eine Rechnung
 * zu erzeugen, die niemand bemerkt, bis sie da ist. Der Deckel liegt so hoch,
 * dass kein echter Studierender ihn erreicht — und so tief, dass ein Ausreißer
 * auffällt, bevor er teuer wird.
 */
/**
 * Absolutes Sicherheitsnetz: maximale AUSGABE-Tokens je Nutzer und Monat.
 *
 * Die Nachrichtenzähler unten begrenzen die ANZAHL der Aufrufe. Sie sagen aber
 * nichts über deren Größe: eine einzige Anfrage mit acht Werkzeugschritten und
 * langen Antworten kostet ein Vielfaches einer kurzen Frage. Dieser Deckel
 * begrenzt den EURO-Betrag, nicht die Klickzahl — er ist der einzige Schutz
 * gegen eine Überraschungsrechnung am Monatsende.
 */
export const OUTPUT_TOKEN_CAP = 100_000;

/**
 * Deckel je Tarif. Zahlende Tarife höher: das adaptive "thinking" zählt mit,
 * eine einzige lange Antwort kann 15 000 Tokens kosten. `null` = kein Deckel
 * (Gründer und Admins — sie müssen testen können, ohne ausgesperrt zu werden).
 */
export const TOKEN_CAPS: Record<PlanId, number | null> = {
  free: OUTPUT_TOKEN_CAP,
  // Essai « illimité » : les compteurs ne bloquent pas, mais ce plafond en
  // euros reste. Un essai sans carte et sans aucun plafond est une facture
  // ouverte au premier script venu.
  trial: 250_000,
  // Bêta gratuite : même plafond de sécurité que l'essai et l'abonnement.
  beta: 250_000,
  standard: 250_000,
  premium: 250_000,
  founder: null,
};

/** Admin-Rolle (user_access.role). Lesefehler → kein Admin. */
async function isAdmin(userId: string): Promise<boolean> {
  const rows = await db
    .select({ role: userAccess.role })
    .from(userAccess)
    .where(eq(userAccess.userId, userId))
    .limit(1);
  return rows[0]?.role === "admin";
}

/** Metrik-Schlüssel des Token-Zählers in `usage_counter`. */
export const TOKEN_METRIC = "tokens_out";

/**
 * Monatliche Kontingente je Tarif, plus die Gesamtzahl speicherbarer Dokumente.
 *
 * "chat" ist bewusst knapp im Gratis-Tarif: wer ernsthaft für eine Klausur
 * lernt, ist in zwei Tagen durch. Genau das ist der Moment, in dem ein Upgrade
 * einen Wert hat — und nicht der Moment, in dem der Nutzer nie an eine Grenze
 * stößt und deshalb nie zahlt.
 */
export const LIMITS: Record<PlanId, Record<Metric | "documents", number>> = {
  free: { chat: 50, exercise: 10, video: 5, formulas: 3, documents: 10 },
  // Essai : affiché « illimité ». Les valeurs ci-dessous sont un garde-fou
  // anti-abus (trois fois l'abonnement), pas une limite qu'un étudiant
  // atteint en 14 jours. Voir aussi TOKEN_CAPS.trial.
  trial: { chat: 3000, exercise: 600, video: 150, formulas: 180, documents: 200 },
  // Bêta gratuite : illimité en pratique pour un testeur, avec le même
  // garde-fou anti-abus que l'essai.
  beta: { chat: 3000, exercise: 600, video: 150, formulas: 180, documents: 200 },
  // Une seule offre payante (mensuelle ou semestrielle), mêmes droits.
  standard: { chat: 1000, exercise: 200, video: 50, formulas: 60, documents: 200 },
  premium: { chat: 1000, exercise: 200, video: 50, formulas: 60, documents: 200 },
  founder: { chat: 1000, exercise: 200, video: 50, formulas: 60, documents: 200 },
};

/** Les tarifs dont les compteurs sont présentés comme « illimités ». */
export const UNLIMITED_PLANS: ReadonlySet<PlanId> = new Set<PlanId>(["trial", "beta"]);

/** Les tarifs qui peuvent être STOCKÉS dans user_plan ("trial" ne l'est jamais). */
const PLAN_IDS: PlanId[] = ["founder", "free", "standard", "premium"];

/** Current billing period, e.g. "2026-07". Counters reset on the 1st. */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Le tarif effectif, à partir de ce qui est stocké. Fonction pure (testée).
 *
 *   1. un abonnement payé et encore valable gagne toujours ;
 *   1 bis. sinon, en mode bêta (`beta`), tout le monde est "beta" ;
 *   2. sinon, un essai en cours donne "trial" ;
 *   3. sinon "free" — y compris quand l'essai vient de finir : c'est ce
 *      calcul, refait à chaque requête, qui « bascule » le compte en Free.
 */
export function effectivePlan(input: {
  storedPlan?: string | null;
  validUntil?: Date | null;
  trialEndsAt?: number | null;
  now?: number;
  /** Mode bêta gratuit (voir `betaFree`). */
  beta?: boolean;
}): PlanId {
  const now = input.now ?? Date.now();
  const stored = PLAN_IDS.includes(input.storedPlan as PlanId) ? (input.storedPlan as PlanId) : "free";
  const paid = stored !== "free" && !(input.validUntil && input.validUntil.getTime() < now);
  if (paid) return stored;
  if (input.beta) return "beta";
  if (input.trialEndsAt != null && input.trialEndsAt > now) return "trial";
  return "free";
}

/**
 * Effective plan for a user. Falls back to "free" when nothing is stored or
 * when a paid period has expired, so access can never be granted by accident.
 * Vérifie l'essai à CHAQUE appel (donc à chaque requête facturable).
 */
export async function getPlan(userId: string): Promise<PlanId> {
  const rows = await db
    .select()
    .from(userPlan)
    .where(eq(userPlan.userId, userId))
    .limit(1);
  const row = rows[0];
  const sansEssai = effectivePlan({ storedPlan: row?.plan, validUntil: row?.validUntil, beta: betaFree() });
  if (sansEssai !== "free") return sansEssai;

  // Une lecture de plus, seulement pour les comptes non payants. Une panne
  // ici ne doit ouvrir aucun droit : on retombe sur Free.
  const trial = await readTrial(db as unknown as TrialDb, userId).catch((error) => {
    console.error("[plan] trial read failed", error);
    return null;
  });
  return effectivePlan({ storedPlan: row?.plan, validUntil: row?.validUntil, trialEndsAt: trial?.endsAt ?? null });
}

export async function getUsage(
  userId: string,
): Promise<Record<Metric, number>> {
  const rows = await db
    .select()
    .from(usageCounter)
    .where(
      and(
        eq(usageCounter.userId, userId),
        eq(usageCounter.period, currentPeriod()),
      ),
    );
  const usage: Record<Metric, number> = {
    chat: 0,
    exercise: 0,
    video: 0,
    formulas: 0,
  };
  for (const r of rows) {
    if (r.metric in usage) usage[r.metric as Metric] = r.count;
  }
  return usage;
}

export interface QuotaResult {
  ok: boolean;
  plan: PlanId;
  used: number;
  limit: number;
  /** Woraus wurde bezahlt: Monatskontingent oder gekaufte Credits. */
  source?: "quota" | "credits";
  /** Verbleibende GEKAUFTE Credits (verfallen nicht). */
  creditsRemaining?: number;
  /** Le compteur atteint : le paywall dit « vidéos », pas « quota ». */
  metric?: Metric;
}

/**
 * Check the monthly allowance and, when there is room left, count this call.
 * Returns ok:false when the allowance is exhausted — the caller answers 402
 * so the interface can invite an upgrade.
 */
/**
 * Trichter mit zwei Töpfen.
 *
 *   1. Monatskontingent (`usage_counter`) — verfällt am Monatsende.
 *   2. Gekaufte Credits (`purchased_credits`) — verfallen nie.
 *
 * Zuerst wird das verfallende Kontingent verbraucht (siehe SPEND_ORDER in
 * lib/credits.ts). Sind beide leer, kommt ok:false zurück und der Aufrufer
 * antwortet mit 402.
 */
export async function consume(
  userId: string,
  metric: Metric,
): Promise<QuotaResult> {
  const plan = await getPlan(userId);
  const limit = LIMITS[plan][metric];
  const period = currentPeriod();

  const rows = await db
    .select()
    .from(usageCounter)
    .where(
      and(
        eq(usageCounter.userId, userId),
        eq(usageCounter.period, period),
        eq(usageCounter.metric, metric),
      ),
    )
    .limit(1);
  const used = rows.length > 0 ? rows[0].count : 0;
  const quotaLeft = used < limit;

  const takeFromQuota = async (): Promise<QuotaResult> => {
    if (rows.length === 0) {
      await db
        .insert(usageCounter)
        .values({ userId, period, metric, count: 1 })
        .onConflictDoUpdate({
          target: [usageCounter.userId, usageCounter.period, usageCounter.metric],
          set: { count: sql`${usageCounter.count} + 1` },
        });
    } else {
      await db
        .update(usageCounter)
        .set({ count: sql`${usageCounter.count} + 1` })
        .where(
          and(
            eq(usageCounter.userId, userId),
            eq(usageCounter.period, period),
            eq(usageCounter.metric, metric),
          ),
        );
    }
    // Journal ohne Guthabenwirkung: der Studierende sieht seine Historie
    // lückenlos, egal aus welchem Topf bezahlt wurde.
    void logTransaction({
      userId,
      amount: -1,
      type: "consume",
      description: `${metric} (Monatskontingent)`,
      source: "quota",
    });
    return { ok: true, plan, used: used + 1, limit, source: "quota", metric };
  };

  const takeFromCredits = async (): Promise<QuotaResult | null> => {
    // Une vidéo coûte plus qu'une question : voir CREDIT_COST.
    const spent = await spendPurchasedCredits(userId, CREDIT_COST[metric], `${metric} (gekaufte Credits)`);
    if (!spent.ok) return null;
    return {
      ok: true,
      plan,
      used,
      limit,
      source: "credits",
      creditsRemaining: spent.remaining,
      metric,
    };
  };

  if (SPEND_ORDER === "quota") {
    if (quotaLeft) return takeFromQuota();
    const fromCredits = await takeFromCredits();
    if (fromCredits) return fromCredits;
  } else {
    const fromCredits = await takeFromCredits();
    if (fromCredits) return fromCredits;
    if (quotaLeft) return takeFromQuota();
  }

  return {
    ok: false,
    plan,
    used,
    limit,
    source: "quota",
    creditsRemaining: await getPurchasedCredits(userId),
    metric,
  };
}

/** Documents are capped by total count, not per month. */
export async function canAddDocument(userId: string): Promise<QuotaResult> {
  const plan = await getPlan(userId);
  const limit = LIMITS[plan].documents;
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(document)
    .where(eq(document.userId, userId));
  const used = Number(rows[0]?.n ?? 0);
  return { ok: used < limit, plan, used, limit };
}

/** Body returned with HTTP 402 so every client can react the same way. */
export function quotaError(r: QuotaResult) {
  return {
    // Historischer Name, damit bestehende Clients weiter funktionieren.
    error: "QUOTA_EXCEEDED" as const,
    /** Neuer, sprechenderer Code für die Oberfläche. */
    code: "INSUFFICIENT_CREDITS" as const,
    plan: r.plan,
    used: r.used,
    limit: r.limit,
    creditsRemaining: r.creditsRemaining ?? 0,
    /** Le compteur atteint (chat, exercise, video, formulas) ou "documents". */
    metric: r.metric ?? (r.source === undefined ? ("documents" as const) : null),
    /** Crédits nécessaires pour cette action (null : non payable en crédits). */
    creditCost: r.metric ? CREDIT_COST[r.metric] : null,
    /**
     * Paywall intelligent : au lieu d'un simple mur, le client propose
     * « Premium » OU « une vidéo de 15 s pour 1 crédit ». La vidéo n'est
     * proposée qu'au tarif gratuit et quand la régie est activée — le
     * plafond du jour, lui, est vérifié par ads.status / ads.claim.
     */
    // `source` n'existe que pour un compteur payable en crédits (consume) :
    // un crédit ne lève pas la limite de DOCUMENTS (canAddDocument).
    // Une vidéo publicitaire rapporte un crédit : elle n'est proposée que
    // pour une action qui en coûte autant, sinon elle ne débloquerait rien.
    rewardedAd:
      r.plan === "free" && r.source !== undefined && rewardedEnabled() &&
      (r.metric ? CREDIT_COST[r.metric] <= REWARD.credits : true)
        ? { seconds: REWARD.seconds, credits: REWARD.credits }
        : null,
    /** Mode bêta : la fenêtre de limite ne propose aucun paiement. */
    beta: betaFree(),
    message:
      r.plan === "beta"
        ? "Du hast die Sicherheitsgrenze der Beta für diesen Monat erreicht. Sie wird am 1. zurückgesetzt."
        : r.plan === "free"
        ? "Dein Freikontingent für diesen Monat ist aufgebraucht."
        : "Dein Monatskontingent ist aufgebraucht.",
  };
}


/* ── Token-Deckel ────────────────────────────────────────────────────────── */
/*
 * Gezählt wird in derselben Tabelle wie alles andere (`usage_counter`), unter
 * der Metrik "tokens_out". Kein neues Schema, keine Migration: die Spalte
 * `metric` ist freier Text, und der Monatsschlüssel `period` sorgt bereits
 * dafür, dass am 1. automatisch bei null begonnen wird.
 */

/** Verbrauchte Ausgabe-Tokens im laufenden Monat. */
export async function getOutputTokens(userId: string): Promise<number> {
  const rows = await db
    .select()
    .from(usageCounter)
    .where(
      and(
        eq(usageCounter.userId, userId),
        eq(usageCounter.period, currentPeriod()),
        eq(usageCounter.metric, TOKEN_METRIC),
      ),
    )
    .limit(1);
  return rows[0]?.count ?? 0;
}

/**
 * Prüft den Deckel VOR dem Modellaufruf.
 * Wirft nie: ein Fehler beim Lesen darf keinen zahlenden Nutzer aussperren.
 */
export async function withinTokenCap(userId: string): Promise<{
  ok: boolean;
  used: number;
  cap: number;
}> {
  try {
    const [used, plan, admin] = await Promise.all([
      getOutputTokens(userId),
      getPlan(userId),
      isAdmin(userId),
    ]);
    const cap = admin ? null : TOKEN_CAPS[plan];
    if (cap === null) return { ok: true, used, cap: Number.POSITIVE_INFINITY };
    return { ok: used < cap, used, cap };
  } catch (error) {
    console.error("[plan] token cap read failed", error);
    return { ok: true, used: 0, cap: OUTPUT_TOKEN_CAP };
  }
}

/**
 * Zählt verbrauchte Ausgabe-Tokens dazu. NACH dem Aufruf, feuern und vergessen:
 * ein Schreibfehler darf die bereits erzeugte Antwort nicht zunichtemachen.
 */
export async function addOutputTokens(userId: string, tokens: number): Promise<void> {
  const amount = Math.max(0, Math.round(tokens || 0));
  if (amount === 0) return;
  const period = currentPeriod();

  try {
    await db
      .insert(usageCounter)
      .values({ userId, period, metric: TOKEN_METRIC, count: amount })
      .onConflictDoUpdate({
        target: [usageCounter.userId, usageCounter.period, usageCounter.metric],
        set: { count: sql`${usageCounter.count} + ${amount}` },
      });
  } catch (error) {
    console.error("[plan] token accounting failed", error);
  }
}

/** Antwortkörper für HTTP 402, wenn der Token-Deckel greift. */
export function tokenCapError(used: number, cap: number) {
  return {
    error: "TOKEN_CAP_REACHED" as const,
    used,
    cap,
    message:
      "Du hast das monatliche Nutzungsmaximum erreicht. Es wird am 1. des Monats zurückgesetzt.",
  };
}
