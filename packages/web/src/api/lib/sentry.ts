/**
 * Erreurs du serveur → Sentry.
 *
 * Inerte sans `SENTRY_DSN` : rien n'est chargé, rien ne part, le serveur se
 * comporte exactement comme avant (les erreurs restent dans les journaux).
 *
 * RGPD : seul l'identifiant pseudonyme du compte accompagne une erreur —
 * jamais le nom, l'e-mail, l'adresse IP, les en-têtes, ni le contenu d'une
 * question ou d'un document (`dataCollection` tout à false, et le message d'erreur
 * est borné). Même règle que le SDK du navigateur (web/lib/observability.ts).
 *
 * Trois étiquettes pour retrouver une panne dans Sentry :
 *   feature = pdf_parsing        l'extraction d'un document a échoué
 *   feature = video_generation   « Als Video erklären » a échoué
 *   feature = http               une route a répondu 500
 */

import { scrubbedError } from "./db-retry";

export type ServerFeature = "pdf_parsing" | "video_generation" | "http";

export interface ServerErrorContext {
  feature: ServerFeature;
  /** Identifiant pseudonyme du compte. */
  userId?: string | null;
  /** Ce que le serveur faisait : « POST /api/documents/upload », « import job »… */
  action?: string;
  /** Étiquettes supplémentaires, courtes (code d'erreur, extension du fichier). */
  tags?: Record<string, string>;
}

type SentryModule = typeof import("@sentry/bun");
let ready: Promise<SentryModule | null> | null = null;

export const sentryConfigured = (): boolean => Boolean(process.env.SENTRY_DSN);

function load(): Promise<SentryModule | null> {
  if (!sentryConfigured()) return Promise.resolve(null);
  ready ??= import("@sentry/bun")
    .then((Sentry) => {
      Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV ?? "development",
        // Sentry v11 : tout est collecté par défaut, on coupe explicitement
        // (mêmes réglages que le navigateur, web/lib/observability.ts).
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          genAI: { inputs: false, outputs: false },
        },
        // Seulement les erreurs : aucune trace de performance, aucun corps de requête.
        tracesSampleRate: 0,
      });
      return Sentry;
    })
    .catch((err) => {
      console.error("[sentry] indisponible :", err instanceof Error ? err.message : String(err));
      return null;
    });
  return ready;
}

/** Ce qui part : étiquettes et contexte, à partir du contexte d'appel. Pur, testé. */
export function sentryScope(ctx: ServerErrorContext): { tags: Record<string, string>; user: { id: string } | null } {
  const tags: Record<string, string> = { feature: ctx.feature };
  if (ctx.action) tags.action = ctx.action.slice(0, 120);
  for (const [k, v] of Object.entries(ctx.tags ?? {})) tags[k] = String(v).slice(0, 120);
  return { tags, user: ctx.userId ? { id: ctx.userId } : null };
}

/** Signale une erreur du serveur. Ne lève jamais, ne retarde jamais la réponse. */
export function captureServerError(err: unknown, ctx: ServerErrorContext): void {
  if (!sentryConfigured()) return;
  void load().then((Sentry) => {
    if (!Sentry) return;
    const { tags, user } = sentryScope(ctx);
    Sentry.withScope((scope) => {
      scope.setTags(tags);
      if (user) scope.setUser(user);
      // Une requête refusée porte ses paramètres dans son message : ils ne partent pas (lib/db-retry.ts).
      Sentry.captureException(scrubbedError(err));
    });
  });
}
