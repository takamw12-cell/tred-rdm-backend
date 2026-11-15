/**
 * Le résumé du matin (2026-11-15, lancement TikTok) : ce que le fondateur veut
 * lire à 8 h —
 *
 *     « X visiteurs, Y inscriptions, Z imports, W vidéos générées »
 *
 * sur les dernières 24 h, puis le détail par lien de campagne, c'est-à-dire
 * par vidéo (`utm_content`) : quelle vidéo amène du trafic, laquelle amène des
 * inscriptions.
 *
 * ── D'où viennent les chiffres ────────────────────────────────────────────
 *
 *   - Inscriptions, imports, vidéos : NOTRE base. Exacts, pour tous les comptes.
 *   - Visiteurs : PostHog, donc seulement les personnes qui ont accepté la
 *     mesure d'audience. Un minimum, pas un total — l'e-mail le dit.
 *
 * ── Ce module ─────────────────────────────────────────────────────────────
 *
 * Pur : ni base importée, ni réseau, ni e-mail. `collectCounts` reçoit la base,
 * `renderDigest` rend le texte. La boucle, le verrou du jour et l'envoi sont
 * dans morning-digest-job.ts. Aucune donnée personnelle ne passe ici : des
 * comptes et des libellés de campagne, jamais une adresse ni un nom.
 */
import { sql, type SQL } from "drizzle-orm";
import { attributionSummary, type AttributionDb, type AttributionRow } from "./attribution";

export const DIGEST_TIMEZONE = "Europe/Berlin";
/** 8 h à Berlin. Rattrapage jusqu'à midi si le serveur redémarrait à ce moment-là. */
export const SEND_FROM_HOUR = 8;
export const SEND_UNTIL_HOUR = 12;

const HOUR_MS = 3_600_000;

/** L'heure locale à Berlin (Railway tourne en UTC ; `Intl` connaît l'heure d'été). */
export function berlinHour(now: Date): number {
  return Number.parseInt(new Intl.DateTimeFormat("de-DE", { timeZone: DIGEST_TIMEZONE, hour: "numeric", hour12: false }).format(now), 10);
}

export function inSendWindow(now: Date): boolean {
  const h = berlinHour(now);
  return h >= SEND_FROM_HOUR && h < SEND_UNTIL_HOUR;
}

/* ── Les comptes, lus en base ─────────────────────────────────────────── */

export interface DigestDb {
  all: <T = unknown>(query: SQL) => Promise<T[]>;
}

export interface DigestCounts {
  signups24: number;
  signups7: number;
  imports24: number;
  /** Vidéos terminées. `null` : la table generated_video n'existe pas sur cette base. */
  videos24: number | null;
  videosFailed24: number;
  /** `null` : colonnes utm_* absentes (migre-utm.mjs pas lancé). */
  signupsByVideo24: AttributionRow[] | null;
  signupsByVideo7: AttributionRow[] | null;
}

const missingTable = (e: unknown) => /no such table/i.test(String((e as Error)?.message ?? e) + String((e as { cause?: unknown })?.cause ?? ""));
const n = (v: unknown) => Number(v ?? 0) || 0;

export async function collectCounts(db: DigestDb, now: number): Promise<DigestCounts> {
  const since24 = now - 24 * HOUR_MS;
  const since7 = now - 7 * 24 * HOUR_MS;

  // `user.created_at` est en millisecondes.
  const [users] = await db.all<{ d: number; w: number }>(sql`
    SELECT sum(created_at >= ${since24}) AS d, count(*) AS w
      FROM user
     WHERE created_at >= ${since7} AND created_at < ${now}`);

  // `document.created_at` est en SECONDES (colonne « timestamp » de Drizzle).
  const [docs] = await db.all<{ c: number }>(sql`
    SELECT count(*) AS c
      FROM document
     WHERE created_at >= ${Math.floor(since24 / 1000)} AND created_at <= ${Math.ceil(now / 1000)}`);

  // `generated_video.created_at` est en millisecondes ; la table est créée par
  // un script à part (migre-generated-video.mjs) et peut manquer.
  let videos24: number | null = null;
  let videosFailed24 = 0;
  try {
    const [videos] = await db.all<{ done: number; failed: number }>(sql`
      SELECT sum(status = 'done') AS done, sum(status = 'failed') AS failed
        FROM generated_video
       WHERE created_at >= ${since24} AND created_at < ${now}`);
    videos24 = n(videos?.done);
    videosFailed24 = n(videos?.failed);
  } catch (error) {
    if (!missingTable(error)) throw error;
  }

  // Les inscriptions par lien : même lecture que /admin/analytics.
  const attribution = db as unknown as AttributionDb;
  const [signupsByVideo24, signupsByVideo7] = await Promise.all([attributionSummary(attribution, since24), attributionSummary(attribution, since7)]);

  return { signups24: n(users?.d), signups7: n(users?.w), imports24: n(docs?.c), videos24, videosFailed24, signupsByVideo24, signupsByVideo7 };
}

/* ── Par vidéo : visites et inscriptions sur le même lien ─────────────── */

export interface VisitRow {
  source: string | null;
  campaign: string | null;
  content: string | null;
  visitors24: number;
  visitors7: number;
}

export interface VideoRow {
  source: string | null;
  campaign: string | null;
  content: string | null;
  /** `null` : PostHog n'a pas pu être interrogé. */
  visitors24: number | null;
  visitors7: number | null;
  signups24: number;
  signups7: number;
}

const MAX_ROWS = 12;
const none = (v: string | null | undefined) => (v === undefined || v === null || v === "" ? null : v);
const keyOf = (r: { source: string | null; campaign: string | null; content: string | null }) => JSON.stringify([none(r.source), none(r.campaign), none(r.content)]);

/**
 * Une ligne par lien de campagne. La ligne « sans lien » (tout à `null`) porte
 * les visites directes et les inscriptions non attribuées ; elle vient en dernier.
 * Liste vide si la migration UTM n'a pas tourné : pas de détail inventé.
 */
export function mergeVideoRows(input: { signups24: AttributionRow[] | null; signups7: AttributionRow[] | null; visits: VisitRow[] | null; totalSignups24: number; totalSignups7: number }): VideoRow[] {
  if (!input.signups24 || !input.signups7) return [];
  const rows = new Map<string, VideoRow>();
  const blank = input.visits ? 0 : null;
  const row = (r: { source: string | null; campaign: string | null; content: string | null }) => {
    const key = keyOf(r);
    let hit = rows.get(key);
    if (!hit) {
      hit = { source: none(r.source), campaign: none(r.campaign), content: none(r.content), visitors24: blank, visitors7: blank, signups24: 0, signups7: 0 };
      rows.set(key, hit);
    }
    return hit;
  };
  for (const v of input.visits ?? []) {
    const hit = row(v);
    hit.visitors24 = (hit.visitors24 ?? 0) + v.visitors24;
    hit.visitors7 = (hit.visitors7 ?? 0) + v.visitors7;
  }
  for (const s of input.signups24) row(s).signups24 += s.signups;
  for (const s of input.signups7) row(s).signups7 += s.signups;

  const direct = row({ source: null, campaign: null, content: null });
  const attributed = [...rows.values()].filter((r) => r !== direct);
  direct.signups24 = Math.max(0, input.totalSignups24 - attributed.reduce((sum, r) => sum + r.signups24, 0));
  direct.signups7 = Math.max(0, input.totalSignups7 - attributed.reduce((sum, r) => sum + r.signups7, 0));

  attributed.sort((a, b) => (b.visitors7 ?? 0) - (a.visitors7 ?? 0) || b.signups7 - a.signups7 || (b.visitors24 ?? 0) - (a.visitors24 ?? 0));
  return [...attributed.slice(0, MAX_ROWS), direct];
}

/* ── Le texte ─────────────────────────────────────────────────────────── */

export interface DigestData {
  /** Fin de la fenêtre (ms) : l'instant de l'envoi. */
  until: number;
  /** `null` : PostHog pas configuré côté serveur, ou en échec. */
  visitors24: number | null;
  visitors7: number | null;
  signups24: number;
  signups7: number;
  imports24: number;
  videos24: number | null;
  videosFailed24: number;
  utmMigrated: boolean;
  byVideo: VideoRow[];
}

/** « 0 visiteur », « 1 visiteur », « 2 visiteurs ». */
const count = (value: number, singular: string, plural: string) => `${value} ${value >= 2 ? plural : singular}`;
const visitors = (v: number) => count(v, "visiteur", "visiteurs");
const signups = (v: number) => count(v, "inscription", "inscriptions");

export function headline(d: DigestData): string {
  return [
    d.visitors24 === null ? "visiteurs non disponibles" : visitors(d.visitors24),
    signups(d.signups24),
    count(d.imports24, "import", "imports"),
    d.videos24 === null ? "vidéos non disponibles" : count(d.videos24, "vidéo générée", "vidéos générées"),
  ].join(", ");
}

const label = (r: VideoRow) => [r.source, r.campaign, r.content].filter(Boolean).join(" · ") || "sans lien de campagne";
const cell = (v: number | null, s: number) => `${v === null ? "visiteurs n. d." : visitors(v)}, ${signups(s)}`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderDigest(d: DigestData): { subject: string; text: string; html: string } {
  const at = new Date(d.until);
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone: DIGEST_TIMEZONE, day: "numeric", month: "short" }).format(at);
  const time = new Intl.DateTimeFormat("fr-FR", { timeZone: DIGEST_TIMEZONE, hour: "2-digit", minute: "2-digit" }).format(at);
  const line = headline(d);

  const notes: string[] = [];
  if (d.videosFailed24 > 0) notes.push(`${count(d.videosFailed24, "vidéo en échec", "vidéos en échec")} sur la même période.`);
  if (d.visitors24 === null) {
    notes.push("Visiteurs non disponibles : le serveur n'a pas pu interroger PostHog (variables POSTHOG_PERSONAL_API_KEY et POSTHOG_PROJECT_ID). Les chiffres se lisent dans PostHog, Web analytics.");
  } else {
    notes.push("Visiteurs : PostHog, uniquement les personnes qui ont accepté la mesure d'audience — un minimum, pas un total.");
  }
  notes.push("Inscriptions, imports et vidéos : base de données de TRED, chiffres exacts.");
  if (!d.utmMigrated) notes.push("Détail par vidéo indisponible : les colonnes utm_* manquent en base — lancer migre-utm.mjs.");
  else notes.push("Une vidéo = un lien : donner à chaque vidéo son propre utm_content (sk1, sk2, sk3…) pour les comparer.");

  const rows = d.byVideo.map((r) => `- ${label(r)} : ${cell(r.visitors24, r.signups24)} (7 jours : ${cell(r.visitors7, r.signups7)})`);
  const text = [
    `TRED — résumé des dernières 24 h (jusqu'au ${day} à ${time}, heure de Berlin)`,
    "",
    line,
    ...(rows.length > 0 ? ["", "Par lien de campagne (par vidéo) :", ...rows] : []),
    "",
    ...notes,
  ].join("\n");

  const td = 'style="padding:6px 10px;border-bottom:1px solid #EADFC8;text-align:left;font-size:14px"';
  const table =
    rows.length === 0
      ? ""
      : `<table style="border-collapse:collapse;margin:16px 0"><tr><th ${td}>Lien de campagne (vidéo)</th><th ${td}>24 h</th><th ${td}>7 jours</th></tr>${d.byVideo
          .map((r) => `<tr><td ${td}>${esc(label(r))}</td><td ${td}>${esc(cell(r.visitors24, r.signups24))}</td><td ${td}>${esc(cell(r.visitors7, r.signups7))}</td></tr>`)
          .join("")}</table>`;
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#0F172A;background:#F6F1E7;padding:24px"><div style="max-width:640px;margin:0 auto;background:#FFFDF7;border:1px solid #EADFC8;border-radius:12px;padding:24px"><p style="margin:0 0 6px;font-size:13px;color:#475569">TRED — dernières 24 h, jusqu'au ${esc(day)} à ${esc(time)} (heure de Berlin)</p><p style="margin:0;font-size:20px;font-weight:700">${esc(line)}</p>${table}${notes.map((note) => `<p style="margin:8px 0 0;font-size:13px;color:#475569">${esc(note)}</p>`).join("")}</div></div>`;

  return { subject: `TRED · ${day} : ${line}`, text, html };
}
