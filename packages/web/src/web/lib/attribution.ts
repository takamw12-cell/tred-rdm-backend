import { getConsent, onConsentChange, type Consent } from "@/lib/analytics";
import { UTM_HEADER, utmFromSearch, utmToHeader, utmToSearch, type Utm } from "../../api/lib/utm";

/**
 * D'où vient ce visiteur : les paramètres UTM du lien qui l'a amené.
 *
 * ── Ce qui est gardé, et où ───────────────────────────────────────────────
 *
 * § 25 TDDDG : rien de non nécessaire ne s'écrit sur l'appareil sans
 * consentement (voir lib/analytics.ts). Donc :
 *
 *   - SANS consentement à l'analyse : les UTM restent dans la mémoire de la
 *     page. Ils survivent à la navigation dans l'app, pas à un rechargement.
 *   - AVEC consentement : ils sont aussi dans sessionStorage, jusqu'à la
 *     fermeture de l'onglet.
 *
 * Dans les deux cas ils partent avec l'inscription (en-tête `x-tred-utm`) et
 * sont rangés sur le compte (api/lib/attribution.ts). C'est le PREMIER lien
 * de la visite qui compte.
 */

const STORE = "tred-utm";
let memory: Utm | null = null;

function readStore(): Utm | null {
  try {
    const raw = sessionStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Utm) : null;
  } catch {
    return null;
  }
}

/** sessionStorage suit le consentement : écrit s'il est donné, vidé sinon. */
function syncStore(consent: Consent | null): void {
  try {
    if (consent === "granted" && memory) sessionStorage.setItem(STORE, JSON.stringify(memory));
    else if (consent !== "granted") sessionStorage.removeItem(STORE);
  } catch {
    /* navigation privée : la mémoire de la page suffit */
  }
}

/** Les UTM de cette visite, s'il y en a. */
export function currentUtm(): Utm | null {
  return memory ?? (getConsent() === "granted" ? readStore() : null);
}

/** En-tête à joindre à la requête d'inscription. */
export function utmHeaders(): Record<string, string> {
  const utm = currentUtm();
  return utm ? { [UTM_HEADER]: utmToHeader(utm) } : {};
}

/** `/dashboard` → `/dashboard?utm_source=…` : les UTM traversent l'aller-retour chez Google / Apple dans l'adresse, sans rien écrire sur l'appareil. */
export function withUtm(path: string): string {
  const query = utmToSearch(currentUtm());
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}

/**
 * À l'ouverture de la page : lit les UTM de l'adresse. De retour d'une
 * inscription Google / Apple (on arrive connecté sur /dashboard avec les UTM
 * dans l'adresse), les envoie au serveur, qui ne les garde que pour un compte
 * tout neuf et encore sans origine.
 */
export function captureUtm(location: Pick<Location, "search" | "pathname"> = window.location): void {
  const found = utmFromSearch(location.search);
  if (found && !currentUtm()) memory = found;
  syncStore(getConsent());
  if (found && location.pathname.startsWith("/dashboard")) {
    void fetch("/api/attribution", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(found) }).catch(() => {});
  }
}

onConsentChange(syncStore);
