/**
 * Diagnostic PostHog — fonctions pures (testées sans base de données).
 */

export function posthogQueryConfigured(): boolean {
  return Boolean(process.env.POSTHOG_PERSONAL_API_KEY?.trim() && process.env.POSTHOG_PROJECT_ID?.trim());
}

/** Diagnostic sans secret : QUELLES variables le processus voit (oui/non, jamais la valeur). */
export function posthogEnvReport(): Record<string, boolean> {
  return {
    POSTHOG_PERSONAL_API_KEY: Boolean(process.env.POSTHOG_PERSONAL_API_KEY?.trim()),
    POSTHOG_PROJECT_ID: Boolean(process.env.POSTHOG_PROJECT_ID?.trim()),
    POSTHOG_API_HOST_custom: Boolean(process.env.POSTHOG_API_HOST?.trim()),
    // Au runtime, VITE_* ne sert à rien (déjà figée dans le bundle au build) :
    // la voir ici dit seulement qu'elle existe sur le service.
    VITE_POSTHOG_KEY_runtime: Boolean(process.env.VITE_POSTHOG_KEY?.trim()),
  };
}
/** Le type d'erreur PostHog (authentication_failed, permission_denied…), sans écho de la requête. */
export function posthogErrorSummary(status: number, body: string): string {
  let code = "";
  try {
    const j = JSON.parse(body) as { type?: string; code?: string; detail?: string };
    code = [j.type, j.code].filter(Boolean).join("/");
    if (j.detail) code += `${code ? " — " : ""}${String(j.detail).slice(0, 160)}`;
  } catch {
    code = body.replace(/\s+/g, " ").slice(0, 160);
  }
  const hint =
    status === 401
      ? "clé personnelle invalide, révoquée ou d'une autre région (eu/us)"
      : status === 403
        ? "clé sans le scope query:read, ou pas d'accès à ce projet"
        : status === 404
          ? "POSTHOG_PROJECT_ID inexistant pour cette clé / cet hôte"
          : status === 429
            ? "limite de requêtes PostHog"
            : "";
  return `PostHog HTTP ${status}${hint ? ` (${hint})` : ""}${code ? `: ${code}` : ""}`;
}
