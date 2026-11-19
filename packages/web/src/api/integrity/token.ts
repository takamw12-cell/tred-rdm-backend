import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

/**
 * Jetons signés du serveur pour l'intégrité de l'app (19 nov. 2026).
 *
 *   « integrity » : la preuve, valable 24 h, que cette installation a passé
 *                   App Attest ou Play Integrity. L'app l'envoie dans
 *                   l'en-tête X-App-Integrity.
 *   « key »       : sur iOS, la clé publique attestée et son dernier
 *                   compteur ; l'app la renvoie pour chaque assertion (pas
 *                   de table à migrer).
 *
 * HMAC-SHA256 avec une clé dérivée (HKDF) de BETTER_AUTH_SECRET : rien de
 * nouveau à configurer, et une clé différente de celle des sessions.
 */
export const INTEGRITY_TTL_MS = 24 * 60 * 60 * 1000;

function secret(): Buffer {
  const base = process.env.BETTER_AUTH_SECRET ?? "";
  if (base.length < 16) throw new Error("BETTER_AUTH_SECRET manquant");
  return Buffer.from(hkdfSync("sha256", base, "tred", "app-integrity-v1", 32));
}

function sign(purpose: string, payload: object): string {
  const body = Buffer.from(JSON.stringify({ ...payload, u: purpose })).toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

function open<T>(purpose: string, token: string | null | undefined): T | null {
  if (!token || token.length > 4096) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", secret()).update(body).digest();
  } catch {
    return null;
  }
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { u?: string };
    return data.u === purpose ? (data as T) : null;
  } catch {
    return null;
  }
}

export interface IntegrityClaims {
  /** ios | android */
  p: "ios" | "android";
  /** Niveau : « device » (appareil certifié / Secure Enclave), « basic » (Android sans certification complète). */
  l: "device" | "basic";
  /** Expiration (ms). */
  e: number;
}

export function issueIntegrityToken(platform: "ios" | "android", level: "device" | "basic", now = Date.now()): { token: string; expiresAt: number } {
  const e = now + INTEGRITY_TTL_MS;
  return { token: sign("integrity", { p: platform, l: level, e }), expiresAt: e };
}

export function readIntegrityToken(token: string | null | undefined, now = Date.now()): IntegrityClaims | null {
  const claims = open<IntegrityClaims>("integrity", token);
  return claims && typeof claims.e === "number" && claims.e > now ? claims : null;
}

export interface KeyTicket {
  k: string;
  pk: string;
  c: number;
}

export function issueKeyTicket(ticket: KeyTicket): string {
  return sign("key", ticket);
}

export function readKeyTicket(token: string | null | undefined): KeyTicket | null {
  const t = open<KeyTicket>("key", token);
  return t && typeof t.k === "string" && typeof t.pk === "string" && Number.isInteger(t.c) ? t : null;
}
