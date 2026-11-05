/**
 * Produkt-Analyse (PostHog) — NUR mit Einwilligung.
 *
 * Rechtslage (Deutschland): § 25 TDDDG (ex-TTDSG) verlangt eine Einwilligung, bevor
 * nicht notwendige Informationen auf dem Gerät gespeichert oder gelesen
 * werden; Art. 6 Abs. 1 lit. a DSGVO für die Verarbeitung. Deshalb:
 *
 *   • PostHog startet mit `opt_out_capturing_by_default` und ohne
 *     Persistenz (memory) — vor der Zustimmung wird nichts gesendet und
 *     nichts gespeichert (lib/observability.ts).
 *   • Erst "Analyse erlauben" schaltet Autocapture, Heatmaps und
 *     Sitzungsaufzeichnung ein. Widerruf jederzeit in den Einstellungen.
 *   • Aufzeichnungen maskieren ALLE Eingabefelder sowie Chat, Tafel und
 *     Dokumente (`data-ph-mask`): man sieht, WO geklickt wird, nicht WAS
 *     jemand fragt oder hochlädt.
 *   • Identifiziert wird mit der pseudonymen Konto-ID — nie Name/E-Mail.
 *
 * Die Wahl liegt in localStorage (sie selbst ist technisch notwendig, um
 * die Entscheidung zu respektieren).
 */

export type Consent = "granted" | "denied";

const KEY = "tred-analytics-consent";
const listeners = new Set<(c: Consent | null) => void>();

type PostHog = typeof import("posthog-js").default;
let ready: Promise<PostHog | null> | null = null;

export const analyticsAvailable = (): boolean => Boolean(import.meta.env.VITE_POSTHOG_KEY);

export function getConsent(): Consent | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

export function onConsentChange(fn: (c: Consent | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** PostHog laden (einmal). Ohne Schlüssel: null, alles bleibt still. */
function load(): Promise<PostHog | null> {
  if (!analyticsAvailable()) return Promise.resolve(null);
  ready ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(import.meta.env.VITE_POSTHOG_KEY as string, {
      api_host: import.meta.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
      person_profiles: "identified_only",
      opt_out_capturing_by_default: true,
      // Vor der Zustimmung kein Cookie, kein localStorage.
      persistence: getConsent() === "granted" ? "localStorage+cookie" : "memory",
      capture_pageview: "history_change",
      capture_pageleave: true,
      autocapture: true,
      enable_heatmaps: true,
      disable_session_recording: getConsent() !== "granted",
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: "[data-ph-mask], [data-ph-mask] *",
      },
    } as Parameters<PostHog["init"]>[1]);
    if (getConsent() === "granted") posthog.opt_in_capturing();
    return posthog;
  });
  return ready;
}

/** Beim Start: nur wenn bereits zugestimmt wurde, PostHog überhaupt laden. */
export function initAnalytics() {
  if (getConsent() === "granted") void load();
}

export function setConsent(c: Consent) {
  try {
    localStorage.setItem(KEY, c);
  } catch {
    /* privates Fenster: gilt dann nur für diese Sitzung */
  }
  for (const fn of listeners) fn(c);
  if (c === "granted") {
    void load().then((ph) => {
      if (!ph) return;
      ph.set_config({ persistence: "localStorage+cookie", disable_session_recording: false });
      ph.opt_in_capturing();
      ph.startSessionRecording();
      if (pendingId) ph.identify(pendingId);
    });
  } else if (ready) {
    void ready.then((ph) => {
      ph?.stopSessionRecording();
      ph?.opt_out_capturing();
      ph?.reset();
    });
  }
}

let pendingId: string | null = null;

/** Pseudonyme Konto-ID verknüpfen (nach Login). Nie Name oder E-Mail. */
export function identifyUser(userId: string | null | undefined) {
  pendingId = userId ?? null;
  if (!userId || getConsent() !== "granted") return;
  void load().then((ph) => ph?.identify(userId));
}

/** Ereignis senden — ohne Zustimmung ein No-op. */
export function track(event: string, props?: Record<string, string | number | boolean>, beacon = false) {
  if (getConsent() !== "granted") return;
  void load().then((ph) => ph?.capture(event, props, beacon ? { transport: "sendBeacon" } : undefined));
}

/**
 * Zeit im Hörsaal: zählt nur, solange der Tab sichtbar ist, und sendet die
 * Sekunden beim Verlassen (Seitenwechsel, Tab verborgen, Schließen).
 * Gibt die Aufräumfunktion zurück (für useEffect).
 */
export function startHoersaalTimer(): () => void {
  let acc = 0;
  let since = document.visibilityState === "visible" ? Date.now() : null;
  const flush = () => {
    if (since !== null) {
      acc += Date.now() - since;
      since = null;
    }
    const seconds = Math.round(acc / 1000);
    acc = 0;
    if (seconds >= 5) track("hoersaal_time", { seconds }, true);
  };
  const onVis = () => {
    if (document.visibilityState === "visible") since = Date.now();
    else flush();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("pagehide", flush);
  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("pagehide", flush);
    flush();
  };
}
