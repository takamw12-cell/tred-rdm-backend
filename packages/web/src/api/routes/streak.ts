import { authed } from "../middleware/auth";
import { db } from "../database";
import { readStreak } from "../lib/streak";

/** La série de jours d'étude du compte de la session (lib/streak.ts). */
export const streak = {
  me: authed.handler(({ context }) => readStreak(db, context.user.id)),
};
