import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * Vidéo récompensée : +1 crédit contre une pub regardée jusqu'au bout.
 *
 * ── Ce que le serveur peut garantir, et ce qu'il ne peut pas ──────────────
 * Sur le WEB, aucune régie ne prévient le serveur qu'une vidéo a été vue
 * (Google Ad Manager le signale seulement au navigateur). Un client modifié
 * peut donc réclamer sans regarder. Ce qui est garanti malgré tout :
 *   • le jeton est signé (HMAC, secret serveur) et lié au compte ;
 *   • il faut attendre la durée de la vidéo entre le début et la réclamation ;
 *   • un jeton ne paie qu'une fois (l'identifiant est la clé primaire du
 *     journal des crédits — même mécanisme que les webhooks Stripe) ;
 *   • 3 récompenses par jour au plus.
 * Le pire abus possible coûte donc 3 messages de tuteur par compte et par
 * jour. Sur MOBILE, AdMob et AppLovin MAX savent appeler le serveur
 * eux-mêmes (« server-side verification ») : c'est l'étape suivante dès que
 * les comptes existent — voir GUIDE_FOUNDER.md.
 *
 * Module pur (secret et horloge injectés), testé dans tests/ad-reward.test.ts.
 */

export const REWARD = {
  seconds: 15,
  credits: 1,
  dailyCap: 3,
  /** Un jeton non réclamé expire au bout de 10 min. */
  ttlMs: 10 * 60_000,
  /** Tolérance d'horloge entre la fin de la vidéo et la requête. */
  slackMs: 1_000,
} as const;

/** La régie récompensée est-elle activée côté serveur ? Sinon : 503 not_configured. */
export function rewardedEnabled(env = process.env): boolean {
  return env.ADS_REWARDED_ENABLED === "true" || env.ADS_TEST_MODE === "true";
}

/** Jour UTC « 2026-11-06 » : sert de préfixe aux identifiants, donc au plafond journalier. */
export function rewardDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Identifiant de transaction : « ad:2026-11-06:<nonce> ». */
export function rewardTransactionId(day: string, nonce: string): string {
  return `ad:${day}:${nonce}`;
}

interface Payload {
  u: string; // userId
  n: string; // nonce
  t: number; // émis à (ms)
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sign = (body: string, secret: string) => createHmac("sha256", secret).update(body).digest("base64url");

export function signRewardToken(userId: string, now: number, secret: string, nonce = randomUUID()): string {
  const body = b64(JSON.stringify({ u: userId, n: nonce, t: now } satisfies Payload));
  return `${body}.${sign(body, secret)}`;
}

export type RewardCheck =
  | { ok: true; nonce: string; issuedAt: number }
  | { ok: false; reason: "malformed" | "bad_signature" | "wrong_user" | "too_early" | "expired" };

export function verifyRewardToken(token: string, userId: string, now: number, secret: string): RewardCheck {
  const [body, mac] = token.split(".");
  if (!body || !mac) return { ok: false, reason: "malformed" };

  const expected = Buffer.from(sign(body, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad_signature" };
  }

  let p: Payload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString()) as Payload;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof p.u !== "string" || typeof p.n !== "string" || typeof p.t !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (p.u !== userId) return { ok: false, reason: "wrong_user" };
  if (now - p.t < REWARD.seconds * 1000 - REWARD.slackMs) return { ok: false, reason: "too_early" };
  if (now - p.t > REWARD.ttlMs) return { ok: false, reason: "expired" };
  return { ok: true, nonce: p.n, issuedAt: p.t };
}
