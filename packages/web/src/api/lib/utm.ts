/**
 * Paramètres UTM : lecture et nettoyage. Module pur, sans aucun import : il est
 * utilisé par le serveur ET par le navigateur (web/lib/attribution.ts).
 *
 * Un lien de campagne ressemble à
 *   https://www.tred-tutor.de/?utm_source=tiktok&utm_medium=social&utm_campaign=survive-klausur&utm_content=sk1
 * `utm_content` désigne la vidéo : c'est lui qui dit quelle vidéo a amené
 * quelle inscription.
 */

export const UTM_KEYS = ["source", "medium", "campaign", "content", "term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Partial<Record<UtmKey, string>>;

/** En-tête porté par la requête d'inscription. */
export const UTM_HEADER = "x-tred-utm";

const MAX_LENGTH = 80;

/**
 * Une valeur UTM vient de l'URL, donc de n'importe qui. On ne garde que des
 * lettres, des chiffres, l'espace et « . _ ~ - », sur 80 caractères : rien qui
 * puisse devenir du HTML, du SQL ou un en-tête.
 */
export function cleanUtmValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N} ._~-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LENGTH);
  return cleaned || null;
}

/** Un objet quelconque → les seules clés UTM, nettoyées. `null` s'il n'en reste aucune. */
export function cleanUtm(input: unknown): Utm | null {
  if (!input || typeof input !== "object") return null;
  const out: Utm = {};
  for (const key of UTM_KEYS) {
    const value = cleanUtmValue((input as Record<string, unknown>)[key]);
    if (value) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** `?utm_source=tiktok&utm_content=sk1` → { source: "tiktok", content: "sk1" }. */
export function utmFromSearch(search: string): Utm | null {
  const params = new URLSearchParams(search);
  return cleanUtm(Object.fromEntries(UTM_KEYS.map((key) => [key, params.get(`utm_${key}`)])));
}

/** L'inverse : pour faire suivre les UTM dans une adresse de retour (connexion Google / Apple). */
export function utmToSearch(utm: Utm | null): string {
  if (!utm) return "";
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) if (utm[key]) params.set(`utm_${key}`, utm[key] as string);
  return params.toString();
}

export function utmToHeader(utm: Utm): string {
  return encodeURIComponent(JSON.stringify(utm));
}

export function utmFromHeader(value: string | null | undefined): Utm | null {
  if (!value || value.length > 2000) return null;
  try {
    return cleanUtm(JSON.parse(decodeURIComponent(value)));
  } catch {
    return null;
  }
}
