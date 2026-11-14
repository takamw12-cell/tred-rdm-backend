import { sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { db } from "../database";
import { rateLimit } from "../database/schema";

/**
 * Limitation de débit, adossée à Turso.
 *
 * Pourquoi en base et non en mémoire : Railway peut faire tourner plusieurs
 * instances, et chaque redéploiement remet la mémoire à zéro. Un compteur en
 * mémoire ne protège donc rien de sérieux.
 *
 * La fenêtre est FIXE, pas glissante. Une fenêtre glissante demande de garder
 * l'horodatage de chaque requête ; une fenêtre fixe tient en une ligne par
 * clé. Le défaut connu — jusqu'à 2× la limite à cheval sur deux fenêtres —
 * est sans importance ici : on protège une facture, pas un scrutin.
 */

/** Durée d'une fenêtre. */
const WINDOW_MS = 60_000;

/** Une ligne sur cent déclenche le ménage. Évite un cron pour si peu. */
const CLEANUP_ODDS = 0.01;

/**
 * Âge au-delà duquel une fenêtre est supprimée. Plus long que la plus longue
 * fenêtre utilisée (un jour, pour les vidéos) : à une heure, le ménage
 * effaçait le compteur du jour en cours et la limite quotidienne ne tenait pas.
 */
const SWEEP_AFTER_MS = 25 * 60 * 60 * 1000;

export interface RateLimitOptions {
  /** Requêtes autorisées par fenêtre. */
  limit: number;
  /** Préfixe de clé — sépare les compteurs de deux règles différentes. */
  scope: string;
  windowMs?: number;
  /**
   * "ip" : ignorer le cookie de session. Obligatoire sur /api/auth/* — là, le
   * cookie n'est vérifié par personne avant la tentative de connexion : un
   * attaquant qui forge un cookie différent à chaque essai aurait un compteur
   * neuf à chaque fois (bruteforce de mot de passe sans limite).
   */
  by?: "session" | "ip";
}

/**
 * Identité de l'appelant, SANS toucher la base.
 *
 * L'ordre compte. Si on ne prenait que l'IP, toute une Lerngruppe derrière le
 * même NAT du campus partagerait un compteur : le troisième étudiant serait
 * bloqué parce que les deux premiers travaillent. On préfère donc le cookie de
 * session, qui est propre à chaque personne.
 *
 * Le cookie n'est PAS vérifié ici — le vérifier coûterait une requête en base
 * à chaque appel. Un attaquant peut donc forger des cookies au hasard pour
 * échapper au compteur ; il tombera alors sur le 401 de la route, qui ne
 * coûte qu'une lecture, jamais un appel au modèle. La dépense reste protégée.
 */
function callerKey(headers: Headers, by: "session" | "ip" = "session"): string {
  const cookie = headers.get("cookie") ?? "";
  const match = cookie.match(/(?:better-auth\.)?session[_.-]?token=([^;]+)/i);
  if (by === "session" && match?.[1]) return `s:${fingerprint(match[1])}`;

  // Railway place l'IP du client en tête de x-forwarded-for.
  const xff = headers.get("x-forwarded-for") ?? "";
  const ip =
    xff.split(",")[0]?.trim() ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    "unknown";
  return `i:${ip}`;
}

/** Empreinte courte et stable. On ne stocke jamais le jeton lui-même. */
function fingerprint(value: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 16);
}

/**
 * Incrémente le compteur et renvoie sa valeur — en UNE instruction.
 *
 * Lire puis écrire laisserait passer deux requêtes simultanées : les deux
 * liraient 4, les deux écriraient 5. L'UPSERT ci-dessous est atomique côté
 * SQLite, donc deux requêtes concurrentes obtiennent bien 5 puis 6.
 */
async function bump(key: string, windowStart: number): Promise<number> {
  const now = new Date();
  const rows = await db
    .insert(rateLimit)
    .values({ key, windowStart, count: 1, updatedAt: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        // Même fenêtre : on incrémente. Fenêtre suivante : on repart à 1.
        count: sql`CASE WHEN ${rateLimit.windowStart} = excluded.window_start
                        THEN ${rateLimit.count} + 1 ELSE 1 END`,
        windowStart: sql`excluded.window_start`,
        updatedAt: sql`excluded.updated_at`,
      },
    })
    .returning({ count: rateLimit.count });

  return rows[0]?.count ?? 1;
}

/** Supprime les fenêtres périmées. Appelé au hasard, jamais bloquant. */
function sweep(before: number): void {
  void db
    .delete(rateLimit)
    .where(sql`${rateLimit.windowStart} < ${before}`)
    .catch(() => {
      /* le ménage n'est pas critique */
    });
}

/**
 * Middleware Hono. À monter AVANT les routes concernées.
 *
 * ```ts
 * app.use("/api/agent/*", rateLimitMiddleware({ limit: 5, scope: "agent" }));
 * ```
 */
export function rateLimitMiddleware(opts: RateLimitOptions): MiddlewareHandler {
  const windowMs = opts.windowMs ?? WINDOW_MS;

  return async (c, next) => {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const key = `${opts.scope}:${callerKey(c.req.raw.headers, opts.by)}`;

    let count: number;
    try {
      count = await bump(key, windowStart);
    } catch (error) {
      // EN CAS DE PANNE, ON LAISSE PASSER. Un limiteur qui coupe le service
      // quand Turso hoquette fait plus de dégâts que l'abus qu'il empêche.
      console.error("[rate-limit] compteur indisponible, requête autorisée", error);
      return next();
    }

    if (Math.random() < CLEANUP_ODDS) sweep(now - SWEEP_AFTER_MS);

    const remaining = Math.max(0, opts.limit - count);
    const resetAt = windowStart + windowMs;

    c.header("X-RateLimit-Limit", String(opts.limit));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    if (count > opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfter));
      return c.json(
        {
          error: "RATE_LIMITED",
          retryAfter,
          message: `Zu viele Anfragen. Versuch es in ${retryAfter} Sekunden erneut.`,
        },
        429,
      );
    }

    return next();
  };
}

/* ── Limites par COMPTE ──────────────────────────────────────────────────── */

export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;

const envInt = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

/**
 * Les deux limites par compte. Réglables par variable d'environnement, sans
 * redéploiement de code : un semestre d'examens peut demander plus d'imports.
 */
export const USER_LIMITS = {
  /** Imports de documents : 10 par heure. */
  import: () => ({ scope: "user-import", limit: envInt("IMPORT_RATE_PER_HOUR", 10), windowMs: HOUR_MS }),
  /** Vidéos explicatives : 5 par jour. */
  video: () => ({ scope: "user-video", limit: envInt("VIDEO_RATE_PER_DAY", 5), windowMs: DAY_MS }),
} as const;

/**
 * Limite par compte, à appeler DANS la route, une fois la session vérifiée.
 *
 * Le middleware ci-dessus compte par cookie de session, sans le vérifier : il
 * arrête une rafale, mais un étudiant qui se reconnecte obtient un cookie neuf
 * et donc un compteur neuf. Ici la clé est l'identifiant du compte : dix
 * imports par heure, quel que soit le nombre d'appareils ou de sessions.
 *
 * Renvoie la réponse 429 à retourner, ou `null` si la requête peut continuer.
 */
export async function userRateLimit(c: Context, userId: string, rule: { scope: string; limit: number; windowMs: number }): Promise<Response | null> {
  const now = Date.now();
  const windowStart = Math.floor(now / rule.windowMs) * rule.windowMs;
  let count: number;
  try {
    count = await bump(`${rule.scope}:u:${userId}`, windowStart);
  } catch (error) {
    // Même règle que le middleware : en cas de panne du compteur, on laisse passer.
    console.error("[rate-limit] compteur indisponible, requête autorisée", error);
    return null;
  }
  if (count <= rule.limit) return null;

  const retryAfter = Math.max(1, Math.ceil((windowStart + rule.windowMs - now) / 1000));
  c.header("Retry-After", String(retryAfter));
  const wait = retryAfter >= 3600 ? `${Math.ceil(retryAfter / 3600)} Stunden` : `${Math.ceil(retryAfter / 60)} Minuten`;
  return c.json(
    {
      error: "RATE_LIMITED",
      scope: rule.scope,
      limit: rule.limit,
      retryAfter,
      message: `Limit erreicht (${rule.limit}). Versuch es in ${wait} erneut.`,
    },
    429,
  );
}
