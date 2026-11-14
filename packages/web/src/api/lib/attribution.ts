/**
 * D'où vient une inscription : les paramètres UTM du lien, rangés sur le compte.
 *
 * ── La règle ──────────────────────────────────────────────────────────────
 *
 *   - PREMIER contact : les colonnes ne sont écrites qu'une fois (`utm_at`
 *     vide). Un compte déjà attribué à une vidéo ne change plus de vidéo.
 *   - Le navigateur les envoie avec la requête d'inscription (en-tête
 *     `x-tred-utm`), ou juste après une inscription Google / Apple
 *     (POST /api/attribution). Voir web/lib/attribution.ts pour ce que le
 *     navigateur garde, et quand (rien sur l'appareil sans consentement).
 *
 * ── SQL direct ────────────────────────────────────────────────────────────
 *
 * Même raison que lib/trial.ts : les colonnes ne sont PAS dans le schéma
 * Drizzle, car le code est déployé avant que le fondateur lance
 * `migre-utm.mjs`. Tant qu'elles manquent, rien n'est enregistré et
 * l'inscription se passe exactement comme avant.
 */
import { sql, type SQL } from "drizzle-orm";
import type { Utm } from "./utm";

export interface AttributionDb {
  all: <T = unknown>(query: SQL) => Promise<T[]>;
  run: (query: SQL) => Promise<unknown>;
}

const missingColumn = (e: unknown) =>
  /no such column|has no column/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ""));

let warned = false;
function warnOnce() {
  if (warned) return;
  warned = true;
  console.warn("[attribution] colonnes utm_* absentes de la table user — lancer migre-utm.mjs");
}

/** Range les UTM sur le compte s'il n'en a pas encore. Ne lève jamais pour une migration manquante. */
export async function saveAttribution(db: AttributionDb, userId: string, utm: Utm, now = Date.now()): Promise<"saved" | "kept" | "not_migrated"> {
  try {
    const rows = await db.all<{ id: string }>(sql`
      UPDATE user
         SET utm_source = ${utm.source ?? null},
             utm_medium = ${utm.medium ?? null},
             utm_campaign = ${utm.campaign ?? null},
             utm_content = ${utm.content ?? null},
             utm_term = ${utm.term ?? null},
             utm_at = ${now}
       WHERE id = ${userId} AND utm_at IS NULL
   RETURNING id`);
    return rows.length > 0 ? "saved" : "kept";
  } catch (error) {
    if (!missingColumn(error)) throw error;
    warnOnce();
    return "not_migrated";
  }
}

export interface StoredAttribution extends Utm {
  /** Instant de l'enregistrement (ms). */
  at: number;
}

/** Les UTM d'un compte (export RGPD). `null` : aucun, ou migration pas encore lancée. */
export async function readAttribution(db: AttributionDb, userId: string): Promise<StoredAttribution | null> {
  try {
    const [row] = await db.all<{ utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; utm_term: string | null; utm_at: number | null }>(
      sql`SELECT utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_at FROM user WHERE id = ${userId}`,
    );
    if (!row?.utm_at) return null;
    const out: StoredAttribution = { at: Number(row.utm_at) };
    if (row.utm_source) out.source = row.utm_source;
    if (row.utm_medium) out.medium = row.utm_medium;
    if (row.utm_campaign) out.campaign = row.utm_campaign;
    if (row.utm_content) out.content = row.utm_content;
    if (row.utm_term) out.term = row.utm_term;
    return out;
  } catch (error) {
    if (!missingColumn(error)) throw error;
    return null;
  }
}

export interface AttributionRow {
  source: string | null;
  campaign: string | null;
  content: string | null;
  signups: number;
}

/**
 * Inscriptions par source / campagne / vidéo depuis `since` (ms), les plus
 * nombreuses d'abord. `null` : la migration n'a pas tourné.
 */
export async function attributionSummary(db: AttributionDb, since: number): Promise<AttributionRow[] | null> {
  try {
    const rows = await db.all<{ source: string | null; campaign: string | null; content: string | null; n: number }>(sql`
      SELECT utm_source AS source, utm_campaign AS campaign, utm_content AS content, count(*) AS n
        FROM user
       WHERE utm_at IS NOT NULL AND utm_at >= ${since}
    GROUP BY utm_source, utm_campaign, utm_content
    ORDER BY n DESC
       LIMIT 50`);
    return rows.map((r) => ({ source: r.source, campaign: r.campaign, content: r.content, signups: Number(r.n) }));
  } catch (error) {
    if (!missingColumn(error)) throw error;
    return null;
  }
}
