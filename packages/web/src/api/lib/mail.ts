/**
 * Envoi d'e-mails transactionnels — sans dépendance.
 *
 * Resend expose une API HTTP et `fetch` est intégré à Bun. Ajouter un SDK pour
 * un seul appier POST ne se justifie pas, et t'a déjà coûté assez de soirées
 * de résolution de modules.
 *
 * Variables d'environnement :
 *   RESEND_API_KEY   obligatoire — sans elle, rien n'est envoyé, mais le
 *                    serveur continue de tourner.
 *   MAIL_FROM        ex. "TRED <noreply@tred.de>". Le domaine doit être
 *                    vérifié chez Resend, sinon l'envoi est refusé.
 */

const ENDPOINT = "https://api.resend.com/emails";

export interface MailResult {
  ok: boolean;
  id?: string;
  error?: string;
}

export function mailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;

  if (!key) {
    // Pas de clé : on trace et on continue. Un serveur qui refuse de démarrer
    // parce qu'un e-mail ne partira pas est pire que l'e-mail manquant.
    console.warn(`[mail] RESEND_API_KEY absente — e-mail non envoyé à ${opts.to}`);
    return { ok: false, error: "RESEND_API_KEY manquante" };
  }

  const from = process.env.MAIL_FROM || "TRED <onboarding@resend.dev>";

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      }),
    });

    const body = await res.text();

    if (!res.ok) {
      console.error(`[mail] échec ${res.status} pour ${opts.to} — ${body.slice(0, 300)}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const json = JSON.parse(body) as { id?: string };
    return { ok: true, id: json.id };
  } catch (error) {
    console.error("[mail] erreur réseau", error);
    return { ok: false, error: String(error) };
  }
}

/* -------------------------------------------------------------------------- */
/* Gabarit : réinitialisation du mot de passe                                 */
/* -------------------------------------------------------------------------- */

/**
 * Le texte est en allemand : c'est la langue de l'écrasante majorité de tes
 * utilisateurs, et un e-mail transactionnel arrive AVANT toute connexion —
 * on ne connaît donc pas encore la langue choisie dans l'app.
 */
export function resetPasswordMail(url: string, name?: string | null): {
  subject: string;
  html: string;
  text: string;
} {
  const hello = name?.trim() ? `Hallo ${name.trim()},` : "Hallo,";

  const text = [
    hello,
    "",
    "du hast ein neues Passwort für TRED angefordert. Öffne diesen Link, um es zu setzen:",
    "",
    url,
    "",
    "Der Link ist eine Stunde lang gültig und funktioniert nur einmal.",
    "",
    "Wenn du das nicht warst, kannst du diese E-Mail ignorieren — dein Passwort bleibt unverändert.",
    "",
    "TRED",
  ].join("\n");

  // HTML volontairement simple : tableaux et styles en ligne. Les clients de
  // messagerie ignorent une bonne partie du CSS moderne, et Gmail supprime
  // les balises <style>. Ce qui est écrit ici s'affiche partout.
  const html = `<!doctype html>
<html lang="de"><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td style="font-size:20px;font-weight:800;letter-spacing:1px;color:#1A1A1A;padding-bottom:24px;">TRED</td></tr>
        <tr><td style="font-size:15px;line-height:22px;color:#1A1A1A;">${escapeHtml(hello)}</td></tr>
        <tr><td style="font-size:15px;line-height:22px;color:#444;padding-top:12px;">
          du hast ein neues Passwort für TRED angefordert.
        </td></tr>
        <tr><td style="padding:24px 0;">
          <a href="${escapeAttr(url)}" style="display:inline-block;background:#1A1A1A;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;">Neues Passwort setzen</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:19px;color:#777;">
          Der Link ist eine Stunde lang gültig und funktioniert nur einmal.
        </td></tr>
        <tr><td style="font-size:13px;line-height:19px;color:#777;padding-top:12px;">
          Wenn du das nicht warst, ignoriere diese E-Mail — dein Passwort bleibt unverändert.
        </td></tr>
        <tr><td style="font-size:12px;color:#999;padding-top:24px;border-top:1px solid #eee;margin-top:24px;">
          Falls der Knopf nicht funktioniert, kopiere diese Adresse:<br>
          <span style="word-break:break-all;">${escapeHtml(url)}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: "Neues Passwort für TRED", html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Pour un attribut href : on échappe aussi l'apostrophe. */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
