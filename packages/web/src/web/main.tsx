// Entry point referenced by index.html — composition only, real bootstrap
// lives in __main.tsx (template-managed).
import "./__main";
import { initObservability } from "./lib/observability";
import { captureUtm } from "./lib/attribution";

// Les paramètres UTM du lien d'arrivée (quelle vidéo a amené ce visiteur),
// lus avant que le routeur ne change l'adresse.
captureUtm();

// Sentry + PostHog : no-op tant que VITE_SENTRY_DSN / VITE_POSTHOG_KEY sont vides.
initObservability();
