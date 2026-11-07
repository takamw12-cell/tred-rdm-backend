/**
 * Produkt-Analyse (PostHog) — NUR mit Einwilligung.
 *
 * Rechtslage (Deutschland): § 25 TDDDG (ex-TTDSG) verlangt eine Einwilligung, bevor
 * nicht notwendige Informationen auf dem Gerät gespeichert oder gelesen
 * werden; Art. 6 Abs. 1 lit. a DSGVO für die Verarbeitung. Deshalb:
 *
 *   • PostHog wird vor der Zustimmung nicht geladen — dadurch wird nichts
 *     gesendet und nichts gespeichert.
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

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost = import.meta.env.VITE_POSTHOG_HOST;

export const analyticsAvailable = (): boolean => Boolean(posthogKey && posthogHost);

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
    posthog.init(posthogKey as string, {
      api_host: posthogHost as string,
      person_profiles: "identified_only",
      // Vor der Zustimmung kein Cookie, kein localStorage.
      persistence: getConsent() === "granted" ? "localStorage+cookie" : "memory",
      capture_pageview: "history_change",
      capture_pageleave: true,
      autocapture: true,
      capture_exceptions: {
        capture_unhandled_errors: true,
        capture_unhandled_rejections: true,
        capture_console_errors: false,
      },
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
  if (!analyticsAvailable()) {
    if (import.meta.env.DEV) {
      const missingVariable = posthogKey ? "VITE_POSTHOG_HOST" : "VITE_POSTHOG_KEY";
      console.error(
        `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
      );
    }
    return;
  }
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

/** Pseudonyme Konto-ID bei Login/Registrierung verknüpfen und bei Logout zurücksetzen. */
export function identifyUser(userId: string | null | undefined) {
  const nextId = userId ?? null;
  const previousId = pendingId;
  pendingId = nextId;
  if (getConsent() !== "granted" || previousId === nextId) return;
  if (!nextId) {
    if (previousId) void load().then((ph) => ph?.reset());
    return;
  }
  void load().then((ph) => ph?.identify(nextId));
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
