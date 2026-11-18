/**
 * Nouvelle tentative quand la base refuse une écriture — et ce qu'une erreur
 * de la base a le droit de laisser dans un journal.
 *
 * ── Pourquoi (test de charge du 18 nov. 2026) ───────────────────────────────
 *
 * Cent étudiants simulés : chaque fois que la base a refusé une écriture
 * (« database is locked »), l'inscription a répondu 422 et la question au
 * tuteur 500, sans second essai. Turso aussi peut refuser ponctuellement une
 * requête (délai dépassé, connexion coupée). Une panne d'un quart de seconde
 * ne doit pas coûter son inscription à un étudiant.
 *
 * ── Ce qui est rejoué, ce qui ne l'est pas ──────────────────────────────────
 *
 * Rejoué : verrou (SQLITE_BUSY / SQLITE_LOCKED), délai dépassé, connexion
 * coupée ou refusée, erreur 5xx du serveur de base. Jamais rejoué : une erreur
 * de validation (400), d'accès (401, 403), toute réponse 4xx, une contrainte
 * (adresse déjà prise…) — la rejouer donnerait le même refus, trois fois.
 *
 * À n'utiliser que sur une écriture qu'on peut refaire sans dégât : un INSERT
 * à identifiant fixe avec `onConflictDoNothing`, un compteur dont le pire cas
 * est d'être compté une fois de trop après un délai dépassé.
 *
 * ── Journaux ────────────────────────────────────────────────────────────────
 *
 * Le message d'une erreur Drizzle est « Failed query: … params: … » : il porte
 * les PARAMÈTRES de la requête, donc le texte d'un cours ou une adresse
 * e-mail. `safeErrorMessage` et `dbErrorCode` n'en gardent que le code et la
 * requête (avec ses « ? »). C'est la seule forme qui a le droit de partir dans
 * un journal ou dans Sentry.
 *
 * Module pur : aucune base, aucun réseau. Testé dans tests/db-retry.test.ts.
 */

export interface DbRetryOptions {
  /** Essais au total, le premier compris. */
  maxAttempts?: number;
  /** Attente avant le 2e essai ; elle double ensuite. */
  baseDelayMs?: number;
  /** Remplaçables pour les tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  onRetry?: (info: { attempt: number; delayMs: number; error: unknown }) => void;
}

/** Une panne passagère signalée par notre propre code (ex. : la réponse 422 de Better Auth après un refus de la base). */
export class TransientDbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransientDbError";
  }
}

const TRANSIENT_CODE = /^(SQLITE_BUSY|SQLITE_LOCKED|SQLITE_PROTOCOL|SQLITE_IOERR|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|EPIPE|EAI_AGAIN|UND_ERR_|SERVER_ERROR|HRANA_WEBSOCKET_ERROR|WEBSOCKET_ERROR)/;
const TRANSIENT_NAME = /^(TimeoutError|ConnectionError|TransientDbError)$/;
const TRANSIENT_MESSAGE = /database (table )?is locked|timed? ?out|fetch failed|socket hang up|connection (was )?(closed|reset|refused|terminated|lost)|network error/i;
/** Le message de Drizzle : la requête puis ses paramètres. On n'y cherche RIEN — il cite le contenu. */
const isQueryWrapper = (message: string) => message.startsWith("Failed query");

/** L'erreur et ses causes, de la plus récente à la plus profonde (5 niveaux au plus). */
function chain(err: unknown): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  let current: unknown = err;
  while (current && typeof current === "object" && out.length < 5) {
    out.push(current as Record<string, unknown>);
    current = (current as { cause?: unknown }).cause;
  }
  return out;
}

const httpStatus = (e: Record<string, unknown>): number | null => {
  for (const key of ["status", "statusCode"]) {
    const v = e[key];
    if (typeof v === "number" && v >= 100 && v < 600) return v;
  }
  return null;
};

/** Panne passagère de la base ou du réseau : la même requête a une chance de passer dans un instant. */
export function isTransientDbError(err: unknown): boolean {
  const levels = chain(err);
  // Une réponse 4xx (validation, accès) ou une contrainte : jamais rejouée, quoi que dise le reste.
  for (const e of levels) {
    const status = httpStatus(e);
    if (status !== null && status >= 400 && status < 500) return false;
    if (typeof e.code === "string" && e.code.startsWith("SQLITE_CONSTRAINT")) return false;
  }
  for (const e of levels) {
    if (typeof e.code === "string" && TRANSIENT_CODE.test(e.code)) return true;
    if (typeof e.name === "string" && TRANSIENT_NAME.test(e.name)) return true;
    const status = httpStatus(e);
    if (status !== null && status >= 502 && status <= 504) return true;
    const message = typeof e.message === "string" ? e.message : "";
    if (message && !isQueryWrapper(message) && TRANSIENT_MESSAGE.test(message)) return true;
  }
  return false;
}

/** Attente avant l'essai suivant : elle double à chaque fois, et le hasard l'étale entre la moitié et le tout. */
export function retryDelayMs(attempt: number, baseDelayMs = 200, random: () => number = Math.random): number {
  const full = baseDelayMs * 2 ** (attempt - 1);
  return Math.round(full * (0.5 + 0.5 * random()));
}

/** Lance `fn` ; sur une panne passagère, attend et recommence, `maxAttempts` essais au plus. */
export async function withDbRetry<T>(fn: () => Promise<T>, options: DbRetryOptions = {}): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 200;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientDbError(error)) throw error;
      const delayMs = retryDelayMs(attempt, baseDelayMs, options.random);
      options.onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
}

/**
 * L'inscription : Better Auth attrape lui-même l'erreur de la base et répond
 * 422 « FAILED_TO_CREATE_USER ». On rejoue donc sur cette RÉPONSE. Une adresse
 * déjà prise, un mot de passe trop court ou une limite de débit ont un autre
 * code : ils reviennent tels quels, au premier essai. Après le dernier refus,
 * la réponse de Better Auth est rendue sans changement.
 */
export async function retryWriteRefusal(handle: () => Promise<Response>, options: DbRetryOptions = {}): Promise<Response> {
  let last: Response | null = null;
  try {
    return await withDbRetry(async () => {
      const res = await handle();
      last = res;
      if (res.status === 422) {
        const body = (await res.clone().json().catch(() => null)) as { code?: unknown } | null;
        if (body?.code === "FAILED_TO_CREATE_USER") throw new TransientDbError("write_refused");
      }
      return res;
    }, options);
  } catch (error) {
    if (error instanceof TransientDbError && last) return last;
    throw error;
  }
}

/** Le code de l'erreur de base (« SQLITE_BUSY »), sinon son nom. Jamais son message. */
export function dbErrorCode(err: unknown): string {
  const levels = chain(err);
  for (const e of levels) {
    if (typeof e.code === "string" && /^[A-Z][A-Z0-9_]{1,48}$/.test(e.code)) return e.code;
  }
  const deepest = levels[levels.length - 1];
  const name = typeof deepest?.name === "string" ? deepest.name : "";
  return /^[A-Za-z]{2,40}$/.test(name) && name !== "Error" ? name : "unknown";
}

const failedQuery = (err: unknown): string | null => {
  for (const e of chain(err)) {
    if (typeof e.message === "string" && isQueryWrapper(e.message)) return e.message;
  }
  return null;
};

/**
 * Le message d'une erreur, tel qu'il peut partir dans un journal : pour une
 * requête refusée, le code et la requête SANS ses paramètres ; sinon le
 * message, borné.
 */
export function safeErrorMessage(err: unknown, max = 300): string {
  const query = failedQuery(err);
  if (query !== null) {
    const sql = query.slice("Failed query".length).replace(/^[:\s]+/, "").split(/\r?\n\s*params\s*:/i)[0]!.replace(/\s+/g, " ").trim();
    return `requête refusée (${dbErrorCode(err)}) : ${sql}`.slice(0, max);
  }
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, max);
}

/**
 * La même erreur, sans les paramètres de la requête ni dans le message, ni
 * dans la pile, ni dans une cause : c'est elle qui part dans Sentry.
 */
export function scrubbedError(err: unknown): Error {
  if (failedQuery(err) === null) return err instanceof Error ? err : new Error(String(err).slice(0, 300));
  const clean = new Error(safeErrorMessage(err));
  clean.name = "DatabaseError";
  const frames = (err instanceof Error ? (err.stack ?? "") : "").split("\n").filter((line) => /^\s+at /.test(line));
  clean.stack = [`${clean.name}: ${clean.message}`, ...frames].join("\n");
  return clean;
}
