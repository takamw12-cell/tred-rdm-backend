/**
 * Monitoring front : Sentry (erreurs) et PostHog (analytics produit).
 *
 * Ne fait RIEN tant que les variables ne sont pas définies. Les SDK sont
 * chargés en import dynamique : sans clé, ils n'alourdissent pas le bundle
 * initial.
 *
 * RGPD (utilisateurs en Allemagne) :
 *  - Sentry : dataCollection tout à false (ni utilisateur, cookies, en-têtes, corps).
 *  - PostHog : hébergement EU par défaut et capture DÉSACTIVÉE par défaut.
 *    Rien n'est envoyé tant que l'utilisateur n'a pas consenti
 *    (`posthog.opt_in_capturing()` à appeler depuis la bannière de consentement).
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

  const posthogKey = env.VITE_POSTHOG_KEY;
  if (posthogKey) {
    void import("posthog-js").then(({ default: posthog }) =>
      posthog.init(posthogKey, {
        api_host: env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com",
        person_profiles: "identified_only",
        opt_out_capturing_by_default: true,
      }),
    );
  }
}
