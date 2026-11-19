/**
 * L'adresse de retour après un paiement Stripe — choisie par le serveur.
 *
 * Avant (audit du 18 nov. 2026) : `successUrl` et `cancelUrl` venaient du
 * client et partaient tels quels chez Stripe. N'importe quel site pouvait
 * donc fabriquer un lien de paiement TRED authentique qui, une fois payé,
 * renvoyait l'étudiant chez lui (hameçonnage « ton paiement a échoué,
 * ressaisis ta carte »).
 *
 * Maintenant : une adresse n'est gardée que si elle pointe vers TRED —
 * tred-tutor.de (et ses sous-domaines), l'hôte de WEBSITE_URL, ou localhost
 * pour le développement. Toute autre adresse est IGNORÉE, sans erreur : le
 * paiement démarre quand même, avec l'adresse de retour par défaut.
 *
 * Module pur : tests/stripe-foundations.test.ts.
 */

const OWN_DOMAIN = "tred-tutor.de";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

export function isOwnReturnUrl(value: unknown, websiteUrl: string | undefined = process.env.WEBSITE_URL): boolean {
  if (typeof value !== "string" || value.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  // Pas d'identifiants dans l'adresse (« https://tred-tutor.de@evil.example »).
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(host)) return url.protocol === "http:" || url.protocol === "https:";
  if (url.protocol !== "https:") return false;
  if (host === OWN_DOMAIN || host.endsWith(`.${OWN_DOMAIN}`)) return true;
  try {
    return !!websiteUrl && host === new URL(websiteUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
}

/** L'adresse demandée si elle est à nous, sinon celle par défaut. */
export function safeReturnUrl(requested: unknown, fallback: string, websiteUrl: string | undefined = process.env.WEBSITE_URL): string {
  return isOwnReturnUrl(requested, websiteUrl) ? (requested as string) : fallback;
}

/**
 * L'adresse publique du site, prête pour Stripe (success_url, cancel_url,
 * return_url) et les e-mails. Incident du 19 nov. 2026 : Stripe refusait
 * chaque paiement (« Not a valid URL », success_url) parce que WEBSITE_URL
 * ne formait pas une adresse complète. On tolère espaces, guillemets,
 * « https:// » oublié et barre finale ; sinon le domaine public.
 */
export const PUBLIC_SITE = "https://www.tred-tutor.de";
let warned = false;
export function publicSiteUrl(raw: string | undefined = process.env.WEBSITE_URL): string {
  let value = (raw ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (value && !/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" ? url.hostname.includes(".") : url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname)) return url.origin;
  } catch {
    /* repli ci-dessous */
  }
  if (!warned) {
    warned = true;
    console.error(`[config] WEBSITE_URL absent ou invalide (« ${(raw ?? "").slice(0, 60)} ») : ${PUBLIC_SITE} utilisé pour les retours de paiement`);
  }
  return PUBLIC_SITE;
}
