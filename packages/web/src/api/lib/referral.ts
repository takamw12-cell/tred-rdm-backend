import { eq, sql } from "drizzle-orm";
import { referral, referralCode } from "../database/schema";
import { missingTable } from "./concept-mastery";
import { grantCredits } from "./credits";
import { CREDIT_GRANTS } from "./plan";

/**
 * Parrainage (décision du 18 nov. 2026) : un code par compte ; quand un
 * nouveau compte l'utilise, le parrain ET le filleul reçoivent 15 crédits.
 *
 * Deux tables à part (migre-referral.mjs), pas de colonne dans `user` : cette
 * table appartient à Better Auth, qui en réécrit le schéma.
 *
 *   referral_code   user_id → code (« TRED-7K2QXM »)
 *   referral        referee_id (clé primaire : UN parrain par filleul) → referrer_id
 *
 * ── Anti-abus ───────────────────────────────────────────────────────────────
 * Quinze crédits valent quinze questions au modèle. Sans garde, il suffirait
 * de créer des comptes jetables.
 *  · le filleul doit avoir CONFIRMÉ son adresse e-mail ;
 *  · son compte a moins de 7 jours (un code ne se « rattrape » pas plus tard) ;
 *  · un seul parrain par filleul, jamais soi-même, jamais la même adresse ;
 *  · un parrain ne peut pas parrainer plus de 20 comptes ;
 *  · les crédits sont écrits par le journal, une fois par filleul.
 */

export const MAX_REFERRALS = 20;
export const REFEREE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Sans 0/O, 1/I/L : un code se dicte et se recopie. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE = /^TRED-[A-HJKMNP-Z2-9]{6}$/;

export function newReferralCode(random: () => number = Math.random): string {
  let out = "TRED-";
  for (let i = 0; i < 6; i += 1) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

/** Le code tel qu'il est stocké, ou null s'il n'a pas la forme d'un code. */
export function normalizeReferralCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase().replace(/\s+/g, "");
  return CODE.test(code) ? code : null;
}

/** L'adresse sans les variantes qui désignent la même boîte (majuscules, « +étiquette », points de Gmail). */
export function sameMailbox(a: string | null | undefined, b: string | null | undefined): boolean {
  const norm = (mail: string | null | undefined) => {
    const [local = "", domain = ""] = (mail ?? "").trim().toLowerCase().split("@");
    const gmail = domain === "gmail.com" || domain === "googlemail.com";
    const box = local.split("+")[0]!;
    return domain ? `${gmail ? box.replace(/\./g, "") : box}@${gmail ? "gmail.com" : domain}` : "";
  };
  const x = norm(a);
  return x !== "" && x === norm(b);
}

export type RedeemRefusal = "invalid_code" | "unknown_code" | "own_code" | "same_email" | "email_not_verified" | "account_too_old" | "already_referred" | "referrer_limit" | "not_migrated";

export interface RedeemInput {
  referee: { id: string; email: string; emailVerified: boolean; createdAt: Date };
  referrer: { id: string; email: string } | null;
  alreadyReferred: boolean;
  referrerCount: number;
  now?: number;
}

/** Pur : ce parrainage est-il recevable ? null = oui. */
export function redeemRefusal(input: RedeemInput): RedeemRefusal | null {
  const now = input.now ?? Date.now();
  if (!input.referrer) return "unknown_code";
  if (input.referrer.id === input.referee.id) return "own_code";
  if (sameMailbox(input.referrer.email, input.referee.email)) return "same_email";
  if (!input.referee.emailVerified) return "email_not_verified";
  if (now - input.referee.createdAt.getTime() > REFEREE_MAX_AGE_MS) return "account_too_old";
  if (input.alreadyReferred) return "already_referred";
  if (input.referrerCount >= MAX_REFERRALS) return "referrer_limit";
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/** Le code du compte, créé à la première demande. null : tables pas encore créées. */
export async function referralCodeOf(db: Db, userId: string): Promise<string | null> {
  try {
    const rows = (await db.select({ code: referralCode.code }).from(referralCode).where(eq(referralCode.userId, userId)).limit(1)) as Array<{ code: string }>;
    if (rows[0]) return rows[0].code;
    // Collision improbable (31^6 codes) : on réessaie avec un autre code.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newReferralCode();
      const inserted = (await db.insert(referralCode).values({ userId, code }).onConflictDoNothing().returning({ code: referralCode.code })) as Array<{ code: string }>;
      if (inserted[0]) return inserted[0].code;
      const again = (await db.select({ code: referralCode.code }).from(referralCode).where(eq(referralCode.userId, userId)).limit(1)) as Array<{ code: string }>;
      if (again[0]) return again[0].code;
    }
    return null;
  } catch (error) {
    if (!missingTable(error)) throw error;
    return null;
  }
}

export async function referralStats(db: Db, userId: string): Promise<{ count: number; left: number }> {
  try {
    const rows = (await db.select({ n: sql<number>`count(*)` }).from(referral).where(eq(referral.referrerId, userId))) as Array<{ n: number }>;
    const count = Number(rows[0]?.n ?? 0);
    return { count, left: Math.max(0, MAX_REFERRALS - count) };
  } catch (error) {
    if (!missingTable(error)) throw error;
    return { count: 0, left: MAX_REFERRALS };
  }
}

/**
 * Applique un code de parrainage pour le compte `referee`. La ligne
 * `referral` (clé primaire = filleul) est le verrou : deux appels simultanés
 * n'écrivent qu'une fois, donc les crédits ne partent qu'une fois.
 */
export async function redeemReferral(
  db: Db,
  referee: RedeemInput["referee"],
  rawCode: unknown,
  findUser: (id: string) => Promise<{ id: string; email: string } | null>,
): Promise<{ ok: true; credits: number } | { ok: false; reason: RedeemRefusal }> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return { ok: false, reason: "invalid_code" };
  try {
    const owner = (await db.select({ userId: referralCode.userId }).from(referralCode).where(eq(referralCode.code, code)).limit(1)) as Array<{ userId: string }>;
    const referrer = owner[0] ? await findUser(owner[0].userId) : null;
    const [existing, stats] = await Promise.all([
      db.select({ id: referral.refereeId }).from(referral).where(eq(referral.refereeId, referee.id)).limit(1) as Promise<Array<{ id: string }>>,
      referrer ? referralStats(db, referrer.id) : Promise.resolve({ count: 0, left: MAX_REFERRALS }),
    ]);
    const refusal = redeemRefusal({ referee, referrer, alreadyReferred: existing.length > 0, referrerCount: stats.count });
    if (refusal || !referrer) return { ok: false, reason: refusal ?? "unknown_code" };

    const locked = (await db.insert(referral).values({ refereeId: referee.id, referrerId: referrer.id }).onConflictDoNothing().returning({ id: referral.refereeId })) as Array<{ id: string }>;
    if (locked.length === 0) return { ok: false, reason: "already_referred" };

    const amount = CREDIT_GRANTS.referral;
    await Promise.all([
      grantCredits({ userId: referee.id, amount, transactionId: `referral:${referee.id}:referee`, description: "Einladung angenommen", type: "grant" }),
      grantCredits({ userId: referrer.id, amount, transactionId: `referral:${referee.id}:referrer`, description: "Freund eingeladen", type: "grant" }),
    ]);
    return { ok: true, credits: amount };
  } catch (error) {
    if (!missingTable(error)) throw error;
    return { ok: false, reason: "not_migrated" };
  }
}
