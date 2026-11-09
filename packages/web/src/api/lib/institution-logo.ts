/**
 * Logos des établissements — servis par NOTRE serveur (GET /api/logo/:domain).
 *
 * Pourquoi un relais et pas l'image de Google directement dans la page :
 * charger un service de Google depuis le navigateur lui transmet l'adresse IP
 * de l'étudiant — exactement ce que LG München (2022, Google Fonts) a jugé
 * contraire au RGPD. Ici, c'est le SERVEUR qui demande le logo une fois, le
 * garde en mémoire, et le navigateur ne parle qu'à tred-tutor.de.
 *
 * Garde-fous :
 *   • liste fermée : seuls les domaines de lib/universities.ts (pas de relais
 *     ouvert, pas de SSRF) ;
 *   • PNG / ICO / JPEG / WebP seulement — jamais de SVG (il peut contenir du
 *     script) ; 256 Ko au plus ; délai de 6 s ;
 *   • qualité : une icône de moins de 32 px serait floue → « pas de logo »,
 *     le navigateur affiche le monogramme, net.
 *
 * Clearbit Logo API (logo.clearbit.com) n'existe plus : le domaine ne répond
 * plus (vérifié le 2026-11-09). Sources : le service de favicons de Google
 * (domaine puis www.), puis l'apple-touch-icon publiée par le site lui-même.
 * Bilan au 2026-11-09 : 43 logos nets sur 50 ; les autres (dont la FH Aachen,
 * dont le site refuse les robots et n'a qu'une icône 16 px) → monogramme.
 */

import { LOGO_DOMAINS } from "../../web/lib/universities";

const MAX_BYTES = 256 * 1024;
const MIN_SIDE = 32;
const TIMEOUT_MS = 6000;
const OK_TTL_MS = 7 * 24 * 3600 * 1000;
const MISS_TTL_MS = 24 * 3600 * 1000;
const ALLOWED_TYPES = new Set(["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/jpeg", "image/webp"]);

export type LogoResult = { ok: true; body: Uint8Array<ArrayBuffer>; type: string } | { ok: false };

export function isAllowedLogoDomain(domain: string): boolean {
  return /^[a-z0-9.-]{3,80}$/.test(domain) && LOGO_DOMAINS.has(domain);
}

/** Largeur d'un PNG (en-tête IHDR) ; null si ce n'est pas un PNG. */
export function pngWidth(b: Uint8Array): number | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || sig.some((v, i) => b[i] !== v)) return null;
  return ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
}

/** Les sources, dans l'ordre : favicon HD de Google, puis l'icône du site lui-même. */
const sources = (domain: string) => [
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(`www.${domain}`)}&sz=128`,
  `https://${domain}/apple-touch-icon.png`,
  `https://www.${domain}/apple-touch-icon.png`,
];

/** Une tentative : l'image si elle est utilisable, sinon null. */
async function tryUrl(url: string, fetchImpl: typeof fetch): Promise<LogoResult | null> {
  try {
    const res = await fetchImpl(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "TRED-logo-fetcher/1.0" },
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(type)) return null;
    const body = new Uint8Array(await res.arrayBuffer());
    if (body.length === 0 || body.length > MAX_BYTES) return null;
    const w = pngWidth(body);
    if (w !== null && w < MIN_SIDE) return null; // icône 16 px : floue → monogramme
    return { ok: true, body, type };
  } catch {
    return null;
  }
}

const cache = new Map<string, { at: number; result: LogoResult }>();

/** Le logo d'un domaine de la liste : domaine, puis www.domaine. Mis en cache. */
export async function fetchInstitutionLogo(domain: string, fetchImpl: typeof fetch = fetch): Promise<LogoResult> {
  if (!isAllowedLogoDomain(domain)) return { ok: false };
  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < (hit.result.ok ? OK_TTL_MS : MISS_TTL_MS)) return hit.result;
  let result: LogoResult = { ok: false };
  for (const url of sources(domain)) {
    const r = await tryUrl(url, fetchImpl);
    if (r) {
      result = r;
      break;
    }
  }
  cache.set(domain, { at: Date.now(), result });
  return result;
}

/** Pour les tests. */
export function clearLogoCache() {
  cache.clear();
}
