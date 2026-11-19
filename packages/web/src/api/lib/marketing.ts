import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../database";
import { marketingConsent, marketingEmailLog, userAccess } from "../database/schema";
import { user } from "../database/auth-schema";
import { linkOnWebsite, mailLang, sendMail, type MailLang } from "./mail";

/**
 * E-mails « Tipps & Neuigkeiten » (19 nov. 2026) — seulement avec un
 * consentement PROUVÉ (UWG § 7, RGPD art. 6 et 7) :
 *
 *   1. case décochée par défaut à l'inscription (ou dans les réglages) ;
 *   2. statut « pending » + e-mail de confirmation (double opt-in) ;
 *   3. « confirmed » au clic — la date est la preuve ;
 *   4. chaque e-mail de campagne porte un lien de désinscription en un clic
 *      (et l'en-tête List-Unsubscribe) ; la désinscription vaut tout de suite.
 *
 * Jetons signés (HMAC, clé dérivée de BETTER_AUTH_SECRET) : le lien porte le
 * compte et l'action, rien d'autre. Sans table (migre-marketing.mjs pas encore
 * lancé), rien n'est envoyé et rien ne casse.
 */
export const MARKETING_HEADER = "x-tred-marketing";
export const CONFIRM_TTL_MS = 7 * 24 * 3600_000;
export type ConsentStatus = "none" | "pending" | "confirmed" | "revoked";

/* ── Jetons ─────────────────────────────────────────────────────────────── */

function key(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET ?? "";
  if (base.length < 16) throw new Error("BETTER_AUTH_SECRET manquant");
  return Buffer.from(hkdfSync("sha256", base, "tred", "marketing-v1", 32));
}

export function signToken(purpose: "confirm" | "unsub", userId: string, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ p: purpose, u: userId, e: purpose === "confirm" ? now + CONFIRM_TTL_MS : 0 })).toString("base64url");
  return `${body}.${createHmac("sha256", key()).update(body).digest("base64url")}`;
}

export function readToken(purpose: "confirm" | "unsub", token: unknown, now = Date.now()): string | null {
  if (typeof token !== "string" || token.length > 600) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", key()).update(body).digest();
  } catch {
    return null;
  }
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const d = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p?: string; u?: string; e?: number };
    if (d.p !== purpose || typeof d.u !== "string") return null;
    if (purpose === "confirm" && (typeof d.e !== "number" || d.e < now)) return null;
    return d.u;
  } catch {
    return null;
  }
}

const site = () => (process.env.WEBSITE_URL ?? "https://www.tred-tutor.de").replace(/\/$/, "");
export const confirmUrl = (userId: string) => linkOnWebsite(`${site()}/api/emails/confirm?t=${signToken("confirm", userId)}`);
export const unsubscribeUrl = (userId: string) => linkOnWebsite(`${site()}/api/emails/unsubscribe?t=${signToken("unsub", userId)}`);

/* ── Consentement ───────────────────────────────────────────────────────── */

const missingTable = (e: unknown) => /no such table/i.test(String((e as Error)?.message ?? e));

export async function consentOf(userId: string): Promise<ConsentStatus | "not_migrated"> {
  try {
    const [row] = await db.select({ status: marketingConsent.status }).from(marketingConsent).where(eq(marketingConsent.userId, userId)).limit(1);
    return (row?.status as ConsentStatus) ?? "none";
  } catch (e) {
    if (missingTable(e)) return "not_migrated";
    throw e;
  }
}

/** Demande de consentement : « pending » + e-mail de confirmation. Déjà confirmé : rien ne change. */
export async function requestConsent(u: { id: string; email: string; name?: string | null }, source: "signup" | "settings", locale?: string | null): Promise<ConsentStatus | "not_migrated"> {
  const now = new Date();
  try {
    const current = await consentOf(u.id);
    if (current === "confirmed") return "confirmed";
    if (current === "not_migrated") return current;
    await db
      .insert(marketingConsent)
      .values({ userId: u.id, status: "pending", source, requestedAt: now })
      .onConflictDoUpdate({ target: marketingConsent.userId, set: { status: "pending", source, requestedAt: now, revokedAt: null } });
  } catch (e) {
    if (missingTable(e)) return "not_migrated";
    throw e;
  }
  const mail = confirmMail(confirmUrl(u.id), u.name, mailLang(locale));
  await sendMail({ to: u.email, ...mail });
  return "pending";
}

export async function confirmConsent(userId: string): Promise<boolean> {
  const res = await db.update(marketingConsent).set({ status: "confirmed", confirmedAt: new Date(), revokedAt: null }).where(and(eq(marketingConsent.userId, userId), inArray(marketingConsent.status, ["pending", "confirmed"]))).returning({ id: marketingConsent.userId });
  return res.length > 0;
}

export async function revokeConsent(userId: string): Promise<void> {
  await db.update(marketingConsent).set({ status: "revoked", revokedAt: new Date() }).where(eq(marketingConsent.userId, userId));
}

/* ── Campagne « Did you know? » ─────────────────────────────────────────── */

export const CAMPAIGNS = ["arcade-did-you-know"] as const;
export type Campaign = (typeof CAMPAIGNS)[number];
export const BATCH_MAX = 200;

/** Destinataires : consentement CONFIRMÉ, adresse vérifiée, pas encore reçu cette campagne. */
export async function recipients(campaign: Campaign, limit = BATCH_MAX) {
  const rows = await db
    .select({ id: user.id, email: user.email, name: user.name, verified: user.emailVerified, locale: userAccess.locale, sent: marketingEmailLog.id })
    .from(marketingConsent)
    .innerJoin(user, eq(user.id, marketingConsent.userId))
    .leftJoin(userAccess, eq(userAccess.userId, marketingConsent.userId))
    .leftJoin(marketingEmailLog, and(eq(marketingEmailLog.userId, marketingConsent.userId), eq(marketingEmailLog.campaign, campaign)))
    .where(and(eq(marketingConsent.status, "confirmed"), isNull(marketingEmailLog.id)))
    .limit(limit);
  return rows.filter((r) => r.verified);
}

export async function sendCampaign(campaign: Campaign, dryRun: boolean): Promise<{ eligible: number; sent: number; failed: number }> {
  const list = await recipients(campaign);
  if (dryRun) return { eligible: list.length, sent: 0, failed: 0 };
  let sent = 0;
  let failed = 0;
  for (const r of list) {
    const unsub = unsubscribeUrl(r.id);
    const mail = didYouKnowMail(`${site()}/arcade`, unsub, r.name, mailLang(r.locale));
    const res = await sendMail({ to: r.email, ...mail, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
    if (res.ok) {
      sent += 1;
      await db.insert(marketingEmailLog).values({ id: `${campaign}:${r.id}`, userId: r.id, campaign, sentAt: new Date() }).onConflictDoNothing();
    } else failed += 1;
    // Resend : 2 requêtes par seconde au plus sur l'offre de base.
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  console.log(`[marketing] ${campaign} : ${sent} envoyés, ${failed} échecs, ${list.length} éligibles`);
  return { eligible: list.length, sent, failed };
}

/* ── Gabarits ───────────────────────────────────────────────────────────── */

const C = { page: "#0B0F19", card: "#111827", border: "#1F2937", ink: "#F8FAFC", muted: "#CBD5E1", faint: "#94A3B8", yellow: "#EAB308", cyan: "#22D3EE" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface MailCopy {
  subject: string;
  preheader: string;
  hello: (n: string | null) => string;
  title: string;
  lines: string[];
  button: string;
  footer: string;
  unsubscribe?: string;
}

/** Mise en page commune : tableaux et styles en ligne (Gmail, Outlook), logo servi par TRED. */
export function renderMail(url: string, name: string | null | undefined, lang: MailLang, copy: MailCopy, unsub?: string) {
  const first = name?.trim().split(/\s+/)[0] ?? null;
  const hello = copy.hello(first && !first.includes("@") ? first : null);
  const logo = `${site()}/icon-192.png`;
  const text = [hello, "", copy.title, ...copy.lines, "", `${copy.button}: ${url}`, "", copy.footer, ...(unsub && copy.unsubscribe ? [`${copy.unsubscribe}: ${unsub}`] : []), "", "TRED"].join("\n");
  const html = `<!doctype html>
<html lang="${lang}"><body style="margin:0;padding:0;background:${C.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${esc(copy.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:500px;background:${C.card};border:1px solid ${C.border};border-radius:18px;padding:30px 28px;">
        <tr><td style="padding-bottom:22px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="padding-right:10px;vertical-align:middle;"><img src="${esc(logo)}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;"></td>
            <td style="vertical-align:middle;font-size:22px;font-weight:800;letter-spacing:1px;color:${C.ink};">TRED</td>
          </tr></table>
        </td></tr>
        <tr><td style="font-size:15px;line-height:23px;color:${C.muted};">${esc(hello)}</td></tr>
        <tr><td style="font-size:22px;line-height:30px;color:${C.yellow};font-weight:800;padding-top:12px;">${esc(copy.title)}</td></tr>
        ${copy.lines.map((l) => `<tr><td style="font-size:15px;line-height:23px;color:${C.muted};padding-top:10px;">${esc(l)}</td></tr>`).join("\n        ")}
        <tr><td style="padding:26px 0 8px;">
          <a href="${esc(url)}" style="display:inline-block;background:${C.yellow};color:#0F172A;text-decoration:none;padding:14px 28px;border-radius:12px;font-size:15px;font-weight:800;">${esc(copy.button)}</a>
        </td></tr>
        <tr><td style="font-size:12px;line-height:18px;color:${C.faint};padding-top:22px;border-top:1px solid ${C.border};">
          ${esc(copy.footer)}${unsub && copy.unsubscribe ? `<br><a href="${esc(unsub)}" style="color:${C.cyan};">${esc(copy.unsubscribe)}</a>` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  return { subject: copy.subject, html, text };
}

const CONFIRM: Record<MailLang, MailCopy> = {
  de: {
    subject: "Bitte bestätige: Tipps & Neuigkeiten von TRED",
    preheader: "Ein Klick, dann schicken wir dir ab und zu Lerntipps.",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Möchtest du Tipps & Neuigkeiten erhalten?",
    lines: ["Du hast angegeben, dass du gelegentlich Lerntipps und Neuigkeiten von TRED per E-Mail bekommen möchtest. Bitte bestätige das mit einem Klick."],
    button: "Ja, ich möchte Tipps erhalten",
    footer: "Ohne Bestätigung schicken wir dir nichts. Du kannst dich jederzeit mit einem Klick wieder abmelden. Der Link ist 7 Tage gültig.",
  },
  fr: {
    subject: "Confirme : astuces et nouveautés de TRED",
    preheader: "Un clic, et on t'envoie de temps en temps des astuces.",
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    title: "Tu veux recevoir des astuces et nouveautés ?",
    lines: ["Tu as indiqué vouloir recevoir de temps en temps des astuces et des nouveautés de TRED par e-mail. Confirme d'un clic."],
    button: "Oui, je veux recevoir des astuces",
    footer: "Sans confirmation, nous ne t'envoyons rien. Tu peux te désinscrire à tout moment en un clic. Le lien est valable 7 jours.",
  },
  en: {
    subject: "Please confirm: tips & news from TRED",
    preheader: "One click and we'll send you study tips now and then.",
    hello: (n) => (n ? `Hi ${n},` : "Hi,"),
    title: "Would you like tips & news?",
    lines: ["You said you'd like to receive study tips and news from TRED by email now and then. Please confirm with one click."],
    button: "Yes, send me tips",
    footer: "Without confirmation we won't send you anything. You can unsubscribe anytime with one click. The link is valid for 7 days.",
  },
};

const DID_YOU_KNOW: Record<MailLang, MailCopy> = {
  de: {
    subject: "Wusstest du? Mit der Arcade verdienst du Credits",
    preheader: "Ein Quiz aus deinem eigenen Skript – alles richtig: +2 Credits.",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    title: "Wusstest du, dass du mit der Arcade Credits verdienen kannst?",
    lines: [
      "Die Arcade macht aus deinem eigenen Skript ein schnelles Quiz: 15 Sekunden pro Frage, jede Antwort mit der Stelle im Dokument.",
      "Alles richtig? Dann bekommst du +2 Credits – bis zu dreimal am Tag.",
    ],
    button: "Jetzt spielen",
    footer: "Du bekommst diese E-Mail, weil du Tipps & Neuigkeiten von TRED bestätigt hast.",
    unsubscribe: "Abmelden (ein Klick)",
  },
  fr: {
    subject: "Le savais-tu ? L'Arcade te fait gagner des crédits",
    preheader: "Un quiz tiré de ton propre cours – sans faute : +2 crédits.",
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    title: "Savais-tu que tu peux gagner des crédits avec l'Arcade ?",
    lines: [
      "L'Arcade transforme ton propre cours en quiz rapide : 15 secondes par question, chaque réponse avec le passage du document.",
      "Sans faute ? Tu gagnes +2 crédits, jusqu'à trois fois par jour.",
    ],
    button: "Jouer maintenant",
    footer: "Tu reçois cet e-mail parce que tu as confirmé vouloir les astuces et nouveautés de TRED.",
    unsubscribe: "Se désinscrire (un clic)",
  },
  en: {
    subject: "Did you know? The Arcade earns you credits",
    preheader: "A quiz from your own notes – all correct: +2 credits.",
    hello: (n) => (n ? `Hi ${n},` : "Hi,"),
    title: "Did you know you can earn credits with the Arcade?",
    lines: [
      "The Arcade turns your own notes into a quick quiz: 15 seconds per question, every answer with the passage from your document.",
      "All correct? You get +2 credits – up to three times a day.",
    ],
    button: "Play now",
    footer: "You're getting this email because you confirmed tips & news from TRED.",
    unsubscribe: "Unsubscribe (one click)",
  },
};

export const confirmMail = (url: string, name: string | null | undefined, lang: MailLang) => renderMail(url, name, lang, CONFIRM[lang]);
export const didYouKnowMail = (url: string, unsub: string, name: string | null | undefined, lang: MailLang) => renderMail(url, name, lang, DID_YOU_KNOW[lang], unsub);
