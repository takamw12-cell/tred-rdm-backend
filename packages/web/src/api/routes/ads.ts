import { z } from "zod";
import { and, eq, like, sql } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { authed } from "../middleware/auth";
import { db } from "../database";
import { creditTransaction } from "../database/schema";
import { grantCredits } from "../lib/credits";
import { getPlan } from "../lib/plan";
import {
  REWARD,
  rewardDay,
  rewardedEnabled,
  rewardTransactionId,
  signRewardToken,
  verifyRewardToken,
} from "../lib/ad-reward";

/**
 * Publicité récompensée (oRPC, /api/rpc/ads.*) — voir lib/ad-reward.ts.
 *
 *   status → l'option « regarder une vidéo » peut-elle s'afficher ?
 *   start  → jeton signé, au moment où la vidéo commence
 *   claim  → +1 crédit, si le jeton est valide et la durée respectée
 *
 * Inerte tant que ADS_REWARDED_ENABLED (ou ADS_TEST_MODE) n'est pas posé :
 * start et claim répondent 503 not_configured, status dit enabled:false.
 */

const secret = () => {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "not_configured" });
  return `ads-reward:${s}`;
};

async function claimedToday(userId: string, day: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)` })
    .from(creditTransaction)
    .where(
      and(
        eq(creditTransaction.userId, userId),
        like(creditTransaction.id, `${rewardTransactionId(day, "")}%`),
      ),
    );
  return Number(rows[0]?.n ?? 0);
}

async function eligibility(userId: string) {
  const enabled = rewardedEnabled();
  const plan = await getPlan(userId);
  const used = enabled ? await claimedToday(userId, rewardDay(Date.now())) : 0;
  return {
    enabled,
    // Les abonnés ne voient jamais de pub, récompensée comprise.
    eligible: enabled && plan === "free",
    remainingToday: Math.max(0, REWARD.dailyCap - used),
    seconds: REWARD.seconds,
    credits: REWARD.credits,
  };
}

export const ads = {
  status: authed.handler(async ({ context }) => eligibility(context.user.id)),

  start: authed.handler(async ({ context }) => {
    const e = await eligibility(context.user.id);
    if (!e.enabled) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "not_configured" });
    if (!e.eligible) throw new ORPCError("FORBIDDEN", { message: "not_eligible" });
    if (e.remainingToday <= 0) throw new ORPCError("TOO_MANY_REQUESTS", { message: "daily_cap" });
    return { token: signRewardToken(context.user.id, Date.now(), secret()), seconds: REWARD.seconds };
  }),

  claim: authed
    .input(z.object({ token: z.string().min(10).max(1000) }))
    .handler(async ({ input, context }) => {
      const userId = context.user.id;
      const e = await eligibility(userId);
      if (!e.enabled) throw new ORPCError("SERVICE_UNAVAILABLE", { message: "not_configured" });
      if (!e.eligible) throw new ORPCError("FORBIDDEN", { message: "not_eligible" });

      const now = Date.now();
      const check = verifyRewardToken(input.token, userId, now, secret());
      if (!check.ok) {
        console.warn(`[ads] réclamation refusée (${check.reason}) user=${userId}`);
        throw new ORPCError("BAD_REQUEST", { message: check.reason });
      }
      if (e.remainingToday <= 0) throw new ORPCError("TOO_MANY_REQUESTS", { message: "daily_cap" });

      // Idempotent : le même jeton réclamé deux fois ne paie qu'une fois.
      const result = await grantCredits({
        userId,
        amount: REWARD.credits,
        // Jour d'ÉMISSION : un jeton réclamé de part et d'autre de minuit garde la même clé.
        transactionId: rewardTransactionId(rewardDay(check.issuedAt), check.nonce),
        description: "Werbevideo angesehen (+1 Credit)",
        type: "grant",
      });
      console.log(`[ads] récompense ${result.granted ? "créditée" : "déjà payée"} user=${userId} solde=${result.balance}`);
      return {
        granted: result.granted,
        balance: result.balance,
        remainingToday: Math.max(0, e.remainingToday - (result.granted ? 1 : 0)),
      };
    }),
};
