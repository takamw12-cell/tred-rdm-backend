import { z } from "zod";
import { ORPCError } from "@orpc/server";

import { authed } from "../middleware/auth";
import { registerPushToken, sendNotification, unregisterPushToken } from "../lib/push";

/**
 * Push-Prozeduren (oRPC, erreichbar unter /api/rpc/notifications.*).
 *
 * Der eigentliche Versand ist KEINE Route, sondern `sendNotification` in
 * lib/push.ts — aufgerufen vom Server an der Stelle, an der das Ereignis
 * entsteht. Eine offene Sende-Route wäre ein Werkzeug zum Spammen fremder
 * Geräte; `test` unten sendet ausschließlich an die eigenen Geräte.
 */
export const notifications = {
  registerToken: authed
    .input(
      z.object({
        token: z.string().min(1),
        platform: z.enum(["ios", "android"]),
        deviceName: z.string().max(120).optional(),
        appVersion: z.string().max(40).optional(),
      }),
    )
    .handler(async ({ input, context }) => {
      try {
        await registerPushToken({
          userId: context.user.id,
          token: input.token,
          platform: input.platform,
          deviceName: input.deviceName,
          appVersion: input.appVersion,
        });
        return { ok: true };
      } catch (error) {
        console.error("[notifications] registerToken failed", error);
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Token konnte nicht gespeichert werden.",
        });
      }
    }),

  /** Beim Abmelden aufrufen, sonst bekommt das Gerät weiter Nachrichten. */
  unregisterToken: authed
    .input(z.object({ token: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      await unregisterPushToken(context.user.id, input.token);
      return { ok: true };
    }),

  /** Sendet nur an die eigenen Geräte — zum Prüfen des Setups. */
  test: authed.handler(async ({ context }) => {
    return sendNotification({
      userId: context.user.id,
      title: "TRED",
      body: "Push-Benachrichtigungen funktionieren 🎉",
      data: { type: "test" },
    });
  }),
};
