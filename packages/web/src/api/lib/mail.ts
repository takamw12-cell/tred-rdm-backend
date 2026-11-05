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
/* Gabarits — charte TRED (crème, encre, jaune), de / fr / en                  */
/* -------------------------------------------------------------------------- */

export type MailLang = "de" | "fr" | "en";

/** La langue de l'interface choisie par l'étudiant → celle de l'e-mail. */
export function mailLang(locale?: string | null): MailLang {
  return locale === "fr" ? "fr" : locale === "de" || !locale ? "de" : "en";
}

const C = {
  page: "#F6F1E7", // crème
  card: "#FFFDF7",
  border: "#EADFC8",
  ink: "#0F172A", // encre (bleu nuit)
  muted: "#475569",
  faint: "#94A3B8",
  yellow: "#EAB308",
};

interface Copy {
  subject: string;
  hello: (name: string | null) => string;
  lines: string[];
  button: string;
  validity: string;
  ignore: string;
  fallback: string;
}

/**
 * Mise en page commune. HTML volontairement simple : tableaux et styles en
 * ligne (Gmail supprime <style>, Outlook ignore le CSS moderne). Le logo est
 * une image servie par l'app elle-même (icon-192.png) : un client qui bloque
 * les images voit le mot « TRED » écrit juste à côté, rien ne manque.
 */
function render(url: string, name: string | null | undefined, lang: MailLang, copy: Copy) {
  const first = name?.trim() && !name.includes("@") ? name.trim() : null;
  const hello = copy.hello(first);
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    /* lien relatif : pas de logo, le mot TRED suffit */
  }
  const logo = origin
    ? `<img src="${escapeAttr(`${origin}/icon-192.png`)}" width="40" height="40" alt="" style="display:block;border:0;border-radius:10px;">`
    : "";

  const text = [hello, "", ...copy.lines, "", url, "", copy.validity, copy.ignore, "", "TRED"].join("\n");

  const html = `<!doctype html>
<html lang="${lang}"><body style="margin:0;padding:0;background:${C.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:${C.card};border:1px solid ${C.border};border-radius:14px;padding:32px;">
        <tr><td style="padding-bottom:20px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            ${logo ? `<td style="padding-right:10px;vertical-align:middle;">${logo}</td>` : ""}
            <td style="vertical-align:middle;font-size:22px;font-weight:800;letter-spacing:1px;color:${C.ink};">TRED</td>
          </tr></table>
          <div style="height:3px;width:44px;background:${C.yellow};border-radius:2px;margin-top:14px;"></div>
        </td></tr>
        <tr><td style="font-size:16px;line-height:24px;color:${C.ink};font-weight:600;">${escapeHtml(hello)}</td></tr>
        ${copy.lines
          .map((l) => `<tr><td style="font-size:15px;line-height:23px;color:${C.muted};padding-top:10px;">${escapeHtml(l)}</td></tr>`)
          .join("\n        ")}
        <tr><td style="padding:26px 0;">
          <a href="${escapeAttr(url)}" style="display:inline-block;background:${C.yellow};color:${C.ink};text-decoration:none;padding:13px 26px;border-radius:10px;font-size:15px;font-weight:700;">${escapeHtml(copy.button)}</a>
        </td></tr>
        <tr><td style="font-size:13px;line-height:19px;color:${C.muted};">${escapeHtml(copy.validity)}</td></tr>
        <tr><td style="font-size:13px;line-height:19px;color:${C.muted};padding-top:8px;">${escapeHtml(copy.ignore)}</td></tr>
        <tr><td style="font-size:12px;line-height:18px;color:${C.faint};padding-top:22px;border-top:1px solid ${C.border};">
          ${escapeHtml(copy.fallback)}<br>
          <span style="word-break:break-all;color:${C.muted};">${escapeHtml(url)}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: copy.subject, html, text };
}

const RESET: Record<MailLang, Copy> = {
  de: {
    subject: "Neues Passwort für TRED",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    lines: ["du hast ein neues Passwort für TRED angefordert. Öffne diesen Link, um es zu setzen:"],
    button: "Neues Passwort setzen",
    validity: "Der Link ist eine Stunde lang gültig und funktioniert nur einmal.",
    ignore: "Wenn du das nicht warst, kannst du diese E-Mail ignorieren — dein Passwort bleibt unverändert.",
    fallback: "Falls der Knopf nicht funktioniert, kopiere diese Adresse in deinen Browser:",
  },
  fr: {
    subject: "Nouveau mot de passe pour TRED",
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    lines: ["tu as demandé un nouveau mot de passe pour TRED. Ouvre ce lien pour le choisir :"],
    button: "Choisir un nouveau mot de passe",
    validity: "Le lien est valable une heure et ne fonctionne qu'une seule fois.",
    ignore: "Si ce n'était pas toi, ignore cet e-mail : ton mot de passe ne change pas.",
    fallback: "Si le bouton ne fonctionne pas, copie cette adresse dans ton navigateur :",
  },
  en: {
    subject: "New password for TRED",
    hello: (n) => (n ? `Hi ${n},` : "Hi,"),
    lines: ["you asked for a new TRED password. Open this link to set it:"],
    button: "Set a new password",
    validity: "The link is valid for one hour and works only once.",
    ignore: "If this wasn't you, just ignore this email — your password stays the same.",
    fallback: "If the button doesn't work, copy this address into your browser:",
  },
};

const VERIFY: Record<MailLang, Copy> = {
  de: {
    subject: "Willkommen bei TRED — bitte bestätige deine E-Mail",
    hello: (n) => (n ? `Hallo ${n},` : "Hallo,"),
    lines: [
      "willkommen bei TRED — deinem KI-Tutor fürs Ingenieurstudium.",
      "Bestätige kurz deine E-Mail-Adresse, dann bist du direkt in deinem Dashboard.",
    ],
    button: "E-Mail bestätigen & loslegen",
    validity: "Der Link ist 24 Stunden gültig.",
    ignore: "Wenn du dich nicht bei TRED registriert hast, ignoriere diese E-Mail einfach.",
    fallback: "Falls der Knopf nicht funktioniert, kopiere diese Adresse in deinen Browser:",
  },
  fr: {
    subject: "Bienvenue sur TRED — confirme ton e-mail",
    hello: (n) => (n ? `Bonjour ${n},` : "Bonjour,"),
    lines: [
      "bienvenue sur TRED, ton tuteur IA pour tes études d'ingénieur.",
      "Confirme ton adresse e-mail et tu arrives directement sur ton tableau de bord.",
    ],
    button: "Confirmer et commencer",
    validity: "Le lien est valable 24 heures.",
    ignore: "Si tu ne t'es pas inscrit sur TRED, ignore simplement cet e-mail.",
    fallback: "Si le bouton ne fonctionne pas, copie cette adresse dans ton navigateur :",
  },
  en: {
    subject: "Welcome to TRED — please confirm your email",
    hello: (n) => (n ? `Hi ${n},` : "Hi,"),
    lines: [
      "welcome to TRED, your AI tutor for engineering studies.",
      "Confirm your email address and you'll land straight in your dashboard.",
    ],
    button: "Confirm & get started",
    validity: "The link is valid for 24 hours.",
    ignore: "If you didn't sign up for TRED, simply ignore this email.",
    fallback: "If the button doesn't work, copy this address into your browser:",
  },
};

/** E-mail « mot de passe oublié ». Langue : celle de l'interface (défaut allemand). */
export function resetPasswordMail(url: string, name?: string | null, lang: MailLang = "de") {
  return render(url, name, lang, RESET[lang]);
}

/** Premier e-mail : bienvenue + lien de vérification (Better Auth). */
export function verifyEmailMail(url: string, name?: string | null, lang: MailLang = "de") {
  return render(url, name, lang, VERIFY[lang]);
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
