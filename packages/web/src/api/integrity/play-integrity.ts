import { createSign } from "node:crypto";

/**
 * Google Play Integrity — vérification côté serveur (19 nov. 2026).
 *
 * L'app demande un jeton à Google Play (requête « standard », avec comme
 * requestHash le défi du serveur). Le serveur ne peut PAS lire ce jeton
 * lui-même : il le fait décoder par Google
 * (POST playintegrity.googleapis.com/v1/<package>:decodeIntegrityToken),
 * avec un compte de service Google Cloud lié à l'app dans la Play Console
 * (variable PLAY_INTEGRITY_SERVICE_ACCOUNT, JSON ou JSON en base64).
 *
 * Verdict exigé :
 *   · requestPackageName = de.tred.app, requestHash = le défi, moins de 5 min ;
 *   · appRecognitionVerdict = PLAY_RECOGNIZED (binaire signé par Google Play,
 *     non modifié) ;
 *   · deviceRecognitionVerdict contient MEETS_DEVICE_INTEGRITY (appareil
 *     Android certifié) — MEETS_BASIC_INTEGRITY seul donne le niveau « basic ».
 * La licence (LICENSED) n'est pas exigée : l'app est gratuite.
 */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw?.trim()) return null;
  for (const text of [raw, Buffer.from(raw, "base64").toString("utf8")]) {
    try {
      const sa = JSON.parse(text) as Partial<ServiceAccount>;
      if (sa.client_email && sa.private_key) return sa as ServiceAccount;
    } catch {
      /* essai suivant */
    }
  }
  return null;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const SCOPE = "https://www.googleapis.com/auth/playintegrity";
let cached: { token: string; expiresAt: number; email: string } | null = null;

/** Jeton OAuth du compte de service (JWT RS256 → oauth2.googleapis.com/token), gardé jusqu'à 1 min avant son expiration. */
export async function googleAccessToken(sa: ServiceAccount, fetchImpl: FetchLike, now = Date.now()): Promise<string> {
  if (cached && cached.email === sa.client_email && cached.expiresAt - 60_000 > now) return cached.token;
  const aud = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const iat = Math.floor(now / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: sa.client_email, scope: SCOPE, aud, iat, exp: iat + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(sa.private_key).toString("base64url");
  const res = await fetchImpl(aud, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) throw new Error(`google oauth ${res.status}`);
  cached = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000, email: sa.client_email };
  return body.access_token;
}

export interface PlayVerdictPayload {
  requestDetails?: { requestPackageName?: string; requestHash?: string; timestampMillis?: string | number };
  appIntegrity?: { appRecognitionVerdict?: string; packageName?: string; versionCode?: string };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
  accountDetails?: { appLicensingVerdict?: string };
}

export async function decodePlayToken(integrityToken: string, packageName: string, sa: ServiceAccount, fetchImpl: FetchLike): Promise<PlayVerdictPayload> {
  const access = await googleAccessToken(sa, fetchImpl);
  const res = await fetchImpl(`https://playintegrity.googleapis.com/v1/${encodeURIComponent(packageName)}:decodeIntegrityToken`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ integrity_token: integrityToken }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await res.json().catch(() => ({}))) as { tokenPayloadExternal?: PlayVerdictPayload };
  if (!res.ok || !body.tokenPayloadExternal) throw new Error(`play integrity ${res.status}`);
  return body.tokenPayloadExternal;
}

export type PlayRefusal = "package" | "request_hash" | "stale" | "app_not_recognized" | "device";

export function evaluatePlayVerdict(
  payload: PlayVerdictPayload,
  expected: { packageName: string; requestHash: string; now?: number; maxAgeMs?: number },
): { ok: true; level: "device" | "basic"; versionCode: string | null } | { ok: false; reason: PlayRefusal } {
  const now = expected.now ?? Date.now();
  const req = payload.requestDetails ?? {};
  if (req.requestPackageName !== expected.packageName) return { ok: false, reason: "package" };
  if (req.requestHash !== expected.requestHash) return { ok: false, reason: "request_hash" };
  const ts = Number(req.timestampMillis);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (expected.maxAgeMs ?? 5 * 60_000)) return { ok: false, reason: "stale" };
  if (payload.appIntegrity?.appRecognitionVerdict !== "PLAY_RECOGNIZED") return { ok: false, reason: "app_not_recognized" };
  const device = payload.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  const level = device.includes("MEETS_DEVICE_INTEGRITY") || device.includes("MEETS_STRONG_INTEGRITY") ? "device" : device.includes("MEETS_BASIC_INTEGRITY") ? "basic" : null;
  if (!level) return { ok: false, reason: "device" };
  return { ok: true, level, versionCode: payload.appIntegrity?.versionCode ?? null };
}
