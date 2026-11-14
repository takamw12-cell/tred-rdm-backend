import { sql } from "drizzle-orm";
import type { Hono } from "hono";
import { db } from "../database";
import { posthogEnvReport, posthogErrorSummary, posthogQueryConfigured } from "./posthog-diagnostic";
import { computeCoreMetrics, isoDay, type ActivityRow, type SignupRow } from "./metrics";
import { attributionSummary, type AttributionDb } from "../lib/attribution";

/**
 * GET /api/admin/analytics — Betreiber-Dashboard (nur Rolle admin).
 *
 * Zwei Quellen, getrennt ausgewiesen:
 *
 *   • EIGENE DATENBANK — Registrierungen, aktive Nutzer, Rückkehrquoten.
 *     Immer verfügbar, für ALLE Konten, ohne Tracking (es sind die Daten,
 *     die der Dienst ohnehin braucht).
 *
 *   • POSTHOG (HogQL-Abfrage-API) — Zeit im Hörsaal, meistgeklickte Elemente,
 *     Abbruch beim Dokument-Import. Nur Nutzer, die der Analyse ZUGESTIMMT
 *     haben; braucht POSTHOG_PERSONAL_API_KEY (Scope query:read) und
 *     POSTHOG_PROJECT_ID. Der Schlüssel bleibt auf dem Server.
 *
 * Ergebnis 5 Minuten im Speicher: das Dashboard wird oft neu geladen, die
 * Zahlen ändern sich nicht im Sekundentakt, und PostHog begrenzt Abfragen.
 */

type Guard = (c: { req: { raw: Request } }) => Promise<{ ok: true; userId: string } | { ok: false; status: 401 | 404 }>;

const CACHE_MS = 5 * 60_000;
let cache: { at: number; body: unknown } | null = null;

const POSTHOG_API = () => (process.env.POSTHOG_API_HOST || "https://eu.posthog.com").replace(/\/$/, "");

/** Une fois par processus : un redéploiement relance le diagnostic, un rechargement du tableau de bord non. */
let configLogged = false;
function logConfigOnce() {
  if (configLogged) return;
  configLogged = true;
  console.log("[analytics] PostHog config", JSON.stringify(posthogEnvReport()));
}

async function hogql(query: string): Promise<unknown[][]> {
  const res = await fetch(`${POSTHOG_API()}/api/projects/${encodeURIComponent(process.env.POSTHOG_PROJECT_ID!)}/query/`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const summary = posthogErrorSummary(res.status, await res.text().catch(() => ""));
    // Statut + type d'erreur seulement : ni la clé, ni l'en-tête, ni la requête.
    console.error(`[analytics] ${summary} — host=${POSTHOG_API()}`);
    throw new Error(summary);
  }
  const body = (await res.json()) as { results?: unknown[][] };
  return body.results ?? [];
}

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0)) || 0;

/** Die PostHog-Kennzahlen. Jede Abfrage scheitert für sich, nie das Ganze. */
async function posthogMetrics() {
  logConfigOnce();
  if (!posthogQueryConfigured()) {
    const missing = Object.entries(posthogEnvReport())
      .filter(([k, v]) => !v && (k === "POSTHOG_PERSONAL_API_KEY" || k === "POSTHOG_PROJECT_ID"))
      .map(([k]) => k);
    console.warn(`[analytics] PostHog-Abfrage nicht eingerichtet — fehlt im laufenden Prozess: ${missing.join(", ")}`);
    return { configured: false as const, missing };
  }

  const settle = async <T>(p: Promise<T>): Promise<T | { error: string }> => {
    try {
      return await p;
    } catch (err) {
      // Les erreurs HTTP sont déjà journalisées dans hogql() ; ici, réseau/délai.
      if (!(err instanceof Error && err.message.startsWith("PostHog HTTP"))) console.error("[analytics] PostHog", err);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  };

  const [hoersaal, clicks, funnel] = await Promise.all([
    // Minuten im Hörsaal (Chat) je Person und Tag: Mittelwert und Median.
    settle(
      hogql(`
        SELECT round(avg(s) / 60, 1), round(quantile(0.5)(s) / 60, 1), count()
        FROM (
          SELECT person_id, toDate(timestamp) AS d, sum(toFloat(properties.seconds)) AS s
          FROM events
          WHERE event = 'hoersaal_time' AND timestamp > now() - INTERVAL 30 DAY
          GROUP BY person_id, d
        )`).then(([r]) => ({ avgMinutes: num(r?.[0]), medianMinutes: num(r?.[1]), sessions: num(r?.[2]) })),
    ),
    // Meistgeklickte Elemente (Autocapture), mit Seite.
    settle(
      hogql(`
        SELECT properties.$el_text AS label, properties.$pathname AS page, count() AS c
        FROM events
        WHERE event = '$autocapture' AND properties.$event_type = 'click'
          AND timestamp > now() - INTERVAL 14 DAY
          AND label IS NOT NULL AND label != ''
        GROUP BY label, page
        ORDER BY c DESC
        LIMIT 15`).then((rows) =>
        rows.map((r) => ({ label: String(r[0]).slice(0, 80), page: String(r[1] ?? ""), count: num(r[2]) })),
      ),
    ),
    // Import-Trichter: Personen je Stufe (30 Tage).
    settle(
      hogql(`
        SELECT event, count(DISTINCT person_id)
        FROM events
        WHERE event IN ('upload_opened', 'upload_started', 'upload_completed', 'upload_failed')
          AND timestamp > now() - INTERVAL 30 DAY
        GROUP BY event`).then((rows) => {
        const m = Object.fromEntries(rows.map((r) => [String(r[0]), num(r[1])]));
        return {
          opened: m.upload_opened ?? 0,
          started: m.upload_started ?? 0,
          completed: m.upload_completed ?? 0,
          failed: m.upload_failed ?? 0,
        };
      }),
    ),
  ]);

  return {
    configured: true as const,
    hoersaal,
    clicks,
    funnel,
    heatmapUrl: `${POSTHOG_API()}/project/${process.env.POSTHOG_PROJECT_ID}/heatmaps`,
    replayUrl: `${POSTHOG_API()}/project/${process.env.POSTHOG_PROJECT_ID}/replay/home`,
  };
}

async function dbMetrics() {
  const since = Date.now() - 120 * 86_400_000;
  const signups = (await db.all(sql`
    SELECT id AS userId, date(created_at / 1000, 'unixepoch') AS day
    FROM user
  `)) as SignupRow[];

  // Aktivität: eigene Fragen an den Tutor + hochgeladene Dokumente.
  const activity = (await db.all(sql`
    SELECT c.user_id AS userId, date(m.created_at, 'unixepoch') AS day
    FROM chat_message m JOIN chat_conversation c ON c.id = m.conversation_id
    WHERE m.role = 'user' AND m.created_at >= ${Math.floor(since / 1000)}
    GROUP BY c.user_id, day
    UNION
    SELECT user_id AS userId, date(created_at, 'unixepoch') AS day
    FROM document
    WHERE created_at >= ${Math.floor(since / 1000)}
    GROUP BY user_id, day
  `)) as ActivityRow[];

  const uploads = (await db.all(sql`
    SELECT COUNT(*) AS n FROM document WHERE created_at >= ${Math.floor((Date.now() - 30 * 86_400_000) / 1000)}
  `)) as { n: number }[];

  return { ...computeCoreMetrics(signups, activity, isoDay(new Date())), uploads30d: num(uploads[0]?.n) };
}

export function registerAnalyticsRoutes(app: Hono, requireAdmin: Guard) {
  app.get("/api/admin/analytics", async (c) => {
    const guard = await requireAdmin(c);
    if (!guard.ok) return c.json({ error: "NOT_FOUND" }, guard.status);
    if (cache && Date.now() - cache.at < CACHE_MS && c.req.query("refresh") !== "1") {
      return c.json(cache.body);
    }
    // Inscriptions par lien de campagne (UTM), 90 jours. null : migre-utm.mjs n'a pas tourné.
    const [core, posthog, attribution] = await Promise.all([
      dbMetrics(),
      posthogMetrics(),
      attributionSummary(db as unknown as AttributionDb, Date.now() - 90 * 24 * 60 * 60 * 1000).catch(() => null),
    ]);
    const body = { generatedAt: new Date().toISOString(), core, posthog, attribution };
    cache = { at: Date.now(), body };
    return c.json(body);
  });
}
