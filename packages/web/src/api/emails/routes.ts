import type { Hono } from "hono";
import { checkAdmin, adminDenialStatus } from "../lib/admin-guard";
import { CAMPAIGNS, confirmConsent, readToken, revokeConsent, sendCampaign, type Campaign } from "../lib/marketing";
import { isMissingTable } from "../lib/db-missing-table";

/**
 * E-mails « Tipps & Neuigkeiten » (lib/marketing.ts) :
 *   GET  /api/emails/confirm?t=…       double opt-in : le clic du lien de confirmation
 *   GET  /api/emails/unsubscribe?t=…   page « se désinscrire » (un bouton)
 *   POST /api/emails/unsubscribe?t=…   désinscription (bouton, ou un clic du client mail — RFC 8058)
 *   POST /api/emails/discovery         envoie une campagne aux consentements CONFIRMÉS (admin seulement)
 */
const page = (title: string, body: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#0B0F19;color:#F8FAFC;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;">
<main style="max-width:440px;margin:24px;padding:28px;border-radius:18px;background:#111827;border:1px solid #1F2937;">
<p style="font-weight:800;letter-spacing:1px;margin:0 0 14px;">TRED</p>${body}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );

export function registerEmailRoutes(app: Hono) {
  app.get("/api/emails/confirm", async (c) => {
    const userId = readToken("confirm", c.req.query("t"));
    if (!userId) return page("Link ungültig", `<h1 style="font-size:20px">Dieser Link ist abgelaufen oder ungültig.</h1><p style="color:#CBD5E1">Du kannst Tipps & Neuigkeiten in den Einstellungen erneut anfordern.</p>`, 400);
    const ok = await confirmConsent(userId).catch(() => false);
    return ok
      ? page("Bestätigt", `<h1 style="font-size:20px;color:#EAB308">Danke – bestätigt!</h1><p style="color:#CBD5E1">Du bekommst ab und zu Tipps & Neuigkeiten von TRED. Abmelden geht jederzeit mit einem Klick, in jeder E-Mail oder in den Einstellungen.</p><p><a href="/dashboard" style="color:#22D3EE">Zu TRED</a></p>`)
      : page("Nicht möglich", `<h1 style="font-size:20px">Diese Anfrage wurde zurückgezogen.</h1><p style="color:#CBD5E1">Du kannst Tipps & Neuigkeiten in den Einstellungen erneut anfordern.</p>`, 409);
  });

  app.get("/api/emails/unsubscribe", (c) => {
    const token = c.req.query("t") ?? "";
    if (!readToken("unsub", token)) return page("Link ungültig", `<h1 style="font-size:20px">Dieser Link ist ungültig.</h1>`, 400);
    // Pas de désinscription sur un simple GET : les antivirus de messagerie ouvrent les liens.
    return page(
      "Abmelden",
      `<h1 style="font-size:20px">Keine Tipps & Neuigkeiten mehr?</h1><form method="post"><button style="margin-top:12px;background:#EAB308;color:#0F172A;border:0;border-radius:12px;padding:12px 22px;font-weight:800;font-size:15px;cursor:pointer">Abmelden</button></form>`,
    );
  });

  app.post("/api/emails/unsubscribe", async (c) => {
    const userId = readToken("unsub", c.req.query("t"));
    if (!userId) return page("Link ungültig", `<h1 style="font-size:20px">Dieser Link ist ungültig.</h1>`, 400);
    await revokeConsent(userId).catch(() => {});
    return page("Abgemeldet", `<h1 style="font-size:20px;color:#EAB308">Du bist abgemeldet.</h1><p style="color:#CBD5E1">Du bekommst keine Tipps & Neuigkeiten mehr. E-Mails zu deinem Konto (Passwort, Zahlungen) erhältst du weiterhin.</p>`);
  });

  app.post("/api/emails/discovery", async (c) => {
    const admin = await checkAdmin(c.req.raw.headers);
    if (admin.state !== "admin") return c.json({ error: "not_found" }, adminDenialStatus(admin));
    const body = ((await c.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const campaign = (CAMPAIGNS as readonly string[]).includes(String(body.campaign ?? "arcade-did-you-know")) ? (String(body.campaign ?? "arcade-did-you-know") as Campaign) : null;
    if (!campaign) return c.json({ error: "unknown_campaign" }, 400);
    // Par défaut : compter seulement. Il faut « dryRun: false » pour envoyer.
    const dryRun = body.dryRun !== false;
    try {
      return c.json({ campaign, dryRun, ...(await sendCampaign(campaign, dryRun)) });
    } catch (error) {
      if (isMissingTable(error)) return c.json({ error: "not_migrated" }, 503);
      throw error;
    }
  });
}
