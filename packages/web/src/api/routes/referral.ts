import { z } from "zod";
import { eq } from "drizzle-orm";
import { authed } from "../middleware/auth";
import { db } from "../database";
import { user } from "../database/auth-schema";
import { MAX_REFERRALS, redeemReferral, referralCodeOf, referralStats } from "../lib/referral";
import { CREDIT_GRANTS } from "../lib/plan";

/**
 * Parrainage (lib/referral.ts).
 *
 *   me       mon code, mon lien, combien de comptes j'ai parrainés
 *   redeem   j'ai reçu un code : l'appliquer à MON compte (filleul = la session)
 */
const findUser = async (id: string) => {
  const [row] = await db.select({ id: user.id, email: user.email }).from(user).where(eq(user.id, id)).limit(1);
  return row ?? null;
};

export const referralRoutes = {
  me: authed.handler(async ({ context }) => {
    const [code, stats] = await Promise.all([referralCodeOf(db, context.user.id), referralStats(db, context.user.id)]);
    const site = (process.env.WEBSITE_URL ?? "").replace(/\/$/, "");
    return {
      /** null : les tables du parrainage ne sont pas encore créées (migre-referral.mjs). */
      code,
      link: code ? `${site}/?ref=${code}` : null,
      count: stats.count,
      left: stats.left,
      max: MAX_REFERRALS,
      credits: CREDIT_GRANTS.referral,
    };
  }),

  redeem: authed.input(z.object({ code: z.string().max(40) })).handler(async ({ context, input }) => {
    const [me] = await db.select({ id: user.id, email: user.email, emailVerified: user.emailVerified, createdAt: user.createdAt }).from(user).where(eq(user.id, context.user.id)).limit(1);
    if (!me) return { ok: false as const, reason: "unknown_code" as const };
    return redeemReferral(db, { id: me.id, email: me.email, emailVerified: Boolean(me.emailVerified), createdAt: new Date(me.createdAt) }, input.code, findUser);
  }),
};
