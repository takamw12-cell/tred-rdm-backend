// Entry point referenced by index.html — composition only, real bootstrap
// lives in __main.tsx (template-managed).
import "./__main";
import { initObservability } from "./lib/observability";

// Sentry + PostHog : no-op tant que VITE_SENTRY_DSN / VITE_POSTHOG_KEY sont vides.
initObservability();
