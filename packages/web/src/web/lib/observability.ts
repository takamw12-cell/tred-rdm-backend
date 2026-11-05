import { initAnalytics } from "./analytics";

/**
 * Monitoring front : Sentry (erreurs) et PostHog (analytics produit).
 *
 * Ne fait RIEN tant que les variables ne sont pas définies. Les SDK sont
 * chargés en import dynamique : sans clé, ils n'alourdissent pas le bundle
 * initial.
 *
 * RGPD (utilisateurs en Allemagne) :
 *  - Sentry : dataCollection tout à false (ni utilisateur, cookies, en-têtes, corps).
 *  - PostHog : hébergement EU, chargé UNIQUEMENT après consentement explicite
 *    (bannière components/analytics-consent.tsx, logique lib/analytics.ts).
 */

export function initObservability() {
  const env = import.meta.env;

  const sentryDsn = env.VITE_SENTRY_DSN;
  if (sentryDsn) {
    void import("@sentry/react").then((Sentry) =>
      Sentry.init({
        dsn: sentryDsn,
        environment: env.MODE,
        // Sentry v11 : tout est collecté par défaut, on coupe explicitement.
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          genAI: { inputs: false, outputs: false },
        },
        tracesSampleRate: 0.1,
      }),
    );
  }

  // PostHog : chargé SEULEMENT après consentement (lib/analytics.ts).
  initAnalytics();
}
