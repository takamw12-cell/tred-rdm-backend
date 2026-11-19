import { randomBytes } from "node:crypto";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { verifyAssertion, verifyAttestation } from "./app-attest";
import { decodePlayToken, evaluatePlayVerdict, parseServiceAccount } from "./play-integrity";
import { issueIntegrityToken, issueKeyTicket, readIntegrityToken, readKeyTicket } from "./token";

/**
 * Intégrité de l'app mobile (19 nov. 2026) : Apple App Attest et Google Play
 * Integrity. Voir app-attest.ts, play-integrity.ts, token.ts.
 *
 *   POST /api/app-integrity/challenge     défi à usage unique (5 min)
 *   POST /api/app-integrity/ios/attest    1ʳᵉ fois : attestation de la clé
 *   POST /api/app-integrity/ios/assert    ensuite : assertion signée
 *   POST /api/app-integrity/android       jeton Play Integrity
 *   GET  /api/app-integrity/status        ce qui est configuré
 *
 * Chaque réussite rend un jeton de 24 h que l'app envoie dans X-App-Integrity.
 *
 * MODE (APP_INTEGRITY_MODE) — « report » par défaut :
 *   off      rien n'est vérifié ;
 *   report   les requêtes de l'app sont classées (valide / absent / invalide)
 *            et comptées dans les journaux ; rien n'est bloqué ;
 *   enforce  une requête qui se dit venir de l'app (X-TRED-Platform) sans
 *            jeton valide est refusée (403) sur les routes coûteuses.
 * Le site web n'envoie ni l'un ni l'autre : il n'est jamais touché. Limite
 * honnête : comme le site expose la même API, un script peut toujours se
 * faire passer pour le navigateur ; l'intégrité protège l'app, pas l'API.
 *
 * Configuration (au fondateur) :
 *   APPLE_TEAM_ID                      identifiant d'équipe Apple (10 caractères)
 *   PLAY_INTEGRITY_SERVICE_ACCOUNT     clé JSON du compte de service Google Cloud
 *   APP_BUNDLE_ID / APP_PACKAGE_NAME   défaut de.tred.app
 *   APP_ATTEST_ALLOW_DEVELOPMENT=true  accepte les builds de développement iOS
 */

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_CHALLENGES = 20_000;
const challenges = new Map<string, number>();

export function newChallenge(now = Date.now()): string {
  if (challenges.size >= MAX_CHALLENGES) {
    for (const [c, exp] of challenges) if (exp <= now) challenges.delete(c);
    if (challenges.size >= MAX_CHALLENGES) challenges.delete(challenges.keys().next().value!);
  }
  const c = randomBytes(24).toString("base64url");
  challenges.set(c, now + CHALLENGE_TTL_MS);
  return c;
}

/** Un défi ne sert qu'une fois, même si la vérification échoue ensuite. */
export function consumeChallenge(c: unknown, now = Date.now()): c is string {
  if (typeof c !== "string" || c.length > 100) return false;
  const exp = challenges.get(c);
  challenges.delete(c);
  return exp !== undefined && exp > now;
}

export type IntegrityMode = "off" | "report" | "enforce";
export const integrityMode = (): IntegrityMode => {
  const m = (process.env.APP_INTEGRITY_MODE ?? "report").trim().toLowerCase();
  return m === "off" || m === "enforce" ? m : "report";
};
const appleAppId = () => (process.env.APPLE_TEAM_ID ? `${process.env.APPLE_TEAM_ID.trim()}.${(process.env.APP_BUNDLE_ID ?? "de.tred.app").trim()}` : null);
const packageName = () => (process.env.APP_PACKAGE_NAME ?? "de.tred.app").trim();

type Body = Record<string, unknown>;
async function body(c: Context): Promise<Body> {
  const b = (await c.req.json().catch(() => null)) as unknown;
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Body) : {};
}
const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

export function registerAppIntegrityRoutes(app: Hono) {
  app.get("/api/app-integrity/status", (c) =>
    c.json({ mode: integrityMode(), ios: Boolean(appleAppId()), android: Boolean(parseServiceAccount(process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT)) }),
  );

  app.post("/api/app-integrity/challenge", (c) => c.json({ challenge: newChallenge(), expiresIn: CHALLENGE_TTL_MS / 1000 }));

  app.post("/api/app-integrity/ios/attest", async (c) => {
    const appId = appleAppId();
    if (!appId) return c.json({ error: "not_configured" }, 503);
    const b = await body(c);
    const keyId = str(b.keyId, 100);
    const attestation = str(b.attestation, 20_000);
    if (!keyId || !attestation || !consumeChallenge(b.challenge)) return c.json({ error: "invalid_challenge" }, 400);
    const res = verifyAttestation({ attestation, keyId, challenge: b.challenge as string, appId, allowDevelopment: process.env.APP_ATTEST_ALLOW_DEVELOPMENT === "true" });
    if (!res.ok) {
      console.warn(`[intégrité] App Attest refusé : ${res.reason}`);
      return c.json({ error: "attestation_refused", reason: res.reason }, 403);
    }
    const ticket = issueKeyTicket({ k: res.key.keyId, pk: res.key.publicKey, c: 0 });
    return c.json({ ...issueIntegrityToken("ios", "device"), ticket });
  });

  app.post("/api/app-integrity/ios/assert", async (c) => {
    const appId = appleAppId();
    if (!appId) return c.json({ error: "not_configured" }, 503);
    const b = await body(c);
    const ticket = readKeyTicket(str(b.ticket, 4096));
    const assertion = str(b.assertion, 5000);
    if (!ticket) return c.json({ error: "invalid_ticket" }, 400);
    if (!assertion || !consumeChallenge(b.challenge)) return c.json({ error: "invalid_challenge" }, 400);
    const res = verifyAssertion({ assertion, challenge: b.challenge as string, appId, publicKey: ticket.pk, previousCounter: ticket.c });
    if (!res.ok) {
      console.warn(`[intégrité] assertion App Attest refusée : ${res.reason}`);
      return c.json({ error: "assertion_refused", reason: res.reason }, 403);
    }
    return c.json({ ...issueIntegrityToken("ios", "device"), ticket: issueKeyTicket({ ...ticket, c: res.counter }) });
  });

  app.post("/api/app-integrity/android", async (c) => {
    const sa = parseServiceAccount(process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT);
    if (!sa) return c.json({ error: "not_configured" }, 503);
    const b = await body(c);
    const integrityToken = str(b.integrityToken, 20_000);
    if (!integrityToken || !consumeChallenge(b.challenge)) return c.json({ error: "invalid_challenge" }, 400);
    let verdict;
    try {
      const payload = await decodePlayToken(integrityToken, packageName(), sa, (url, init) => fetch(url, init));
      verdict = evaluatePlayVerdict(payload, { packageName: packageName(), requestHash: b.challenge as string });
    } catch (error) {
      console.error("[intégrité] Play Integrity injoignable", error instanceof Error ? error.message.slice(0, 120) : "erreur");
      return c.json({ error: "unavailable" }, 502);
    }
    if (!verdict.ok) {
      console.warn(`[intégrité] Play Integrity refusé : ${verdict.reason}`);
      return c.json({ error: "verdict_refused", reason: verdict.reason }, 403);
    }
    return c.json(issueIntegrityToken("android", verdict.level));
  });
}

/* ── Contrôle des requêtes de l'app ────────────────────────────────────────── */

export type GateVerdict = "web" | "valid" | "missing" | "invalid";

/** Classe une requête : le site (pas d'en-tête de plateforme) n'est jamais concerné. */
export function classifyRequest(platform: string | undefined, token: string | undefined, now = Date.now()): GateVerdict {
  if (platform !== "ios" && platform !== "android") return "web";
  if (!token) return "missing";
  const claims = readIntegrityToken(token, now);
  return claims && claims.p === platform ? "valid" : "invalid";
}

const stats: Record<Exclude<GateVerdict, "web">, number> = { valid: 0, missing: 0, invalid: 0 };
let lastReport = Date.now();

export function appIntegrityGate(): MiddlewareHandler {
  return async (c, next) => {
    const mode = integrityMode();
    if (mode === "off") return next();
    const verdict = classifyRequest(c.req.header("x-tred-platform"), c.req.header("x-app-integrity"));
    if (verdict === "web") return next();
    stats[verdict] += 1;
    if (Date.now() - lastReport > 15 * 60_000) {
      lastReport = Date.now();
      console.log(`[intégrité] mode=${mode} requêtes app (15 min) : valides=${stats.valid} sans_jeton=${stats.missing} invalides=${stats.invalid}`);
      stats.valid = stats.missing = stats.invalid = 0;
    }
    if (mode === "enforce" && verdict !== "valid") return c.json({ error: "app_integrity_required" }, 403);
    return next();
  };
}
