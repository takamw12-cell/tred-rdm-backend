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

/**
 * Peut-on écrire à N'IMPORTE QUI ? Seulement avec un expéditeur sur un
 * domaine vérifié chez Resend (MAIL_FROM). L'adresse de test
 * « onboarding@resend.dev » n'écrit qu'au propriétaire du compte Resend :
 * tout autre destinataire reçoit un refus 403 (incident du 5 nov. 2026 —
 * des inscrits ne recevaient jamais leur lien et restaient bloqués).
 */
export function mailCanReachAnyone(): boolean {
  const from = process.env.MAIL_FROM?.trim() ?? "";
  return mailConfigured() && from.length > 0 && !/@resend\.dev\b/i.test(from);
}

/** « t***@gmail.com » : assez pour suivre un envoi, sans l'adresse en clair dans les logs. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return domain ? `${user.slice(0, 1)}***@${domain}` : "***";
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
    console.warn(`[mail] RESEND_API_KEY absente — e-mail non envoyé à ${maskEmail(opts.to)}`);
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
      console.error(`[mail] échec ${res.status} pour ${maskEmail(opts.to)} — ${body.slice(0, 300)}`);
      return { ok: false, error: `HTTP ${res.status}` };
    }

    const json = JSON.parse(body) as { id?: string };
    // Trace de succès : c'est elle qu'on cherche dans les logs Railway quand
    // quelqu'un dit « je n'ai rien reçu ».
    console.log(`[mail] envoyé à ${maskEmail(opts.to)} — « ${opts.subject} » (id ${json.id ?? "?"})`);
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

/* -------------------------------------------------------------------------- */
/* Gabarit : bienvenue + vérification de l'adresse                            */
/* -------------------------------------------------------------------------- */

/**
 * Premier e-mail de l'étudiant : il dit bienvenue ET porte le lien de
 * vérification. Un seul e-mail plutôt que deux — le second finirait en spam.
 *
 * Le lien vient de Better Auth (`/api/auth/verify-email?token=…&callbackURL=…`) :
 * un clic vérifie l'adresse, ouvre la session et mène au Dashboard.
 * Allemand d'abord, une ligne en anglais pour les étudiants internationaux.
 */
export function verifyEmailMail(url: string, name?: string | null): {
  subject: string;
  html: string;
  text: string;
} {
  const hello = name?.trim() && !name.includes("@") ? `Hallo ${name.trim()},` : "Hallo,";

  const text = [
    hello,
    "",
    "willkommen bei TRED — deinem KI-Tutor fürs Ingenieurstudium.",
    "Bestätige kurz deine E-Mail-Adresse, dann bist du direkt in deinem Dashboard:",
    "",
    url,
    "",
    "Der Link ist 24 Stunden gültig.",
    "Welcome to TRED! Click the link above to confirm your email and open your dashboard.",
    "",
    "Wenn du dich nicht bei TRED registriert hast, ignoriere diese E-Mail einfach.",
    "",
    "TRED",
  ].join("\n");

  const html = `<!doctype html>
<html lang="de"><body style="margin:0;padding:0;background:#0F172A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0F172A;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#FFFDF7;border-radius:12px;padding:32px;border:1px solid #F1E7CF;">
        <tr><td style="font-size:20px;font-weight:800;letter-spacing:1px;color:#0F172A;padding-bottom:24px;">TRED</td></tr>
        <tr><td style="font-size:15px;line-height:22px;color:#1A1A1A;">${escapeHtml(hello)}</td></tr>
        <tr><td style="font-size:15px;line-height:22px;color:#444;padding-top:12px;">
          willkommen bei TRED — deinem KI-Tutor fürs Ingenieurstudium.
          Bestätige kurz deine E-Mail-Adresse, dann bist du direkt in deinem Dashboard.
        </td></tr>
        <tr><td style="padding:24px 0;">
          <a href="${escapeAttr(url)}" style="display:inline-block;background:#EAB308;color:#0F172A;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:700;">E-Mail bestätigen &amp; loslegen</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:19px;color:#777;">
          Der Link ist 24 Stunden gültig.<br>
          <span style="color:#999;">Welcome to TRED! Click the button to confirm your email and open your dashboard.</span>
        </td></tr>
        <tr><td style="font-size:13px;line-height:19px;color:#777;padding-top:12px;">
          Wenn du dich nicht bei TRED registriert hast, ignoriere diese E-Mail einfach.
        </td></tr>
        <tr><td style="font-size:12px;color:#999;padding-top:24px;border-top:1px solid #eee;margin-top:24px;">
          Falls der Knopf nicht funktioniert, kopiere diese Adresse:<br>
          <span style="word-break:break-all;">${escapeHtml(url)}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: "Willkommen bei TRED — bitte bestätige deine E-Mail", html, text };
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
