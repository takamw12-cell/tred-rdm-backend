import { and, eq, sql } from "drizzle-orm";
import { db } from "../database";
import { document, usageCounter, userPlan } from "../database/schema";
import {
  getPurchasedCredits,
  logTransaction,
  spendPurchasedCredits,
  SPEND_ORDER,
} from "./credits";

export type PlanId = "founder" | "free" | "standard" | "premium";
export type Metric = "chat" | "exercise" | "video" | "formulas";

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
  free: { chat: 20, exercise: 5, video: 2, formulas: 3, documents: 10 },
  // Eine einzige zahlende Stufe (monatlich oder halbjährlich). "Fair use",
  // nicht unbegrenzt: siehe OUTPUT_TOKEN_CAP.
  standard: { chat: 500, exercise: 100, video: 40, formulas: 60, documents: 200 },
  premium: { chat: 500, exercise: 100, video: 40, formulas: 60, documents: 200 },
  founder: { chat: 500, exercise: 100, video: 40, formulas: 60, documents: 200 },
};

const PLAN_IDS: PlanId[] = ["founder", "free", "standard", "premium"];

/** Current billing period, e.g. "2026-07". Counters reset on the 1st. */
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Effective plan for a user. Falls back to "free" when nothing is stored or
 * when a paid period has expired, so access can never be granted by accident.
 */
export async function getPlan(userId: string): Promise<PlanId> {
  const rows = await db
    .select()
    .from(userPlan)
    .where(eq(userPlan.userId, userId))
    .limit(1);
  if (rows.length === 0) return "free";

  const row = rows[0];
  const plan = PLAN_IDS.includes(row.plan as PlanId) ? (row.plan as PlanId) : "free";
  if (plan === "free") return "free";
  if (row.validUntil && row.validUntil.getTime() < Date.now()) return "free";
  return plan;
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
    return { ok: true, plan, used: used + 1, limit, source: "quota" };
  };

  const takeFromCredits = async (): Promise<QuotaResult | null> => {
    const spent = await spendPurchasedCredits(userId, 1, `${metric} (gekaufte Credits)`);
    if (!spent.ok) return null;
    return {
      ok: true,
      plan,
      used,
      limit,
      source: "credits",
      creditsRemaining: spent.remaining,
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
    message:
      r.plan === "free"
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
    const used = await getOutputTokens(userId);
    return { ok: used < OUTPUT_TOKEN_CAP, used, cap: OUTPUT_TOKEN_CAP };
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
