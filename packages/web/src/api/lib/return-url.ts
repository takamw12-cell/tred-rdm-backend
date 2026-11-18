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
