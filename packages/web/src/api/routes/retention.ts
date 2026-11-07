import { z } from "zod";
import { inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";

import { adminOnly, authed } from "../middleware/auth";
import { db } from "../database";
import { user } from "../database/auth-schema";
import { runRetentionCycle } from "../lib/retention/heartbeat";
import { adminOverview, listInbox, markOpened, respond, setPaused } from "../lib/retention/store";

/**
 * Agent de rétention (oRPC, /api/rpc/retention.*).
 *
 * Étudiant (human-in-the-loop) :
 *   retention.inbox    — ses suggestions et rappels, les plus récents d'abord
 *   retention.open     — « ouverte » (clic web, ou push tapé sur le mobile)
 *   retention.respond  — accepter ou refuser une suggestion
 *
 * Admin (/admin/retention) :
 *   retention.overview — qui a été relancé, taux d'ouverture, pause
 *   retention.setPaused
 *   retention.preview  — le prochain cycle À BLANC : qui recevrait quoi, rien n'est envoyé
 *
 * Aucune procédure n'envoie à quelqu'un d'autre que soi : c'est le battement
 * (lib/retention/heartbeat.ts) qui envoie, selon ses règles.
 */
const id = z.string().min(1).max(64);

export const retention = {
  inbox: authed.handler(async ({ context }) => listInbox(context.user.id)),

  open: authed.input(z.object({ id })).handler(async ({ input, context }) => {
    await markOpened(context.user.id, input.id).catch(() => false);
    return { ok: true as const };
  }),

  respond: authed
    .input(z.object({ id, response: z.enum(["accept", "dismiss"]) }))
    .handler(async ({ input, context }) => {
      const ok = await respond(context.user.id, input.id, input.response).catch(() => false);
      if (!ok) throw new ORPCError("NOT_FOUND", { message: "notification_not_found" });
      return { ok: true as const };
    }),

  overview: adminOnly.handler(async () => adminOverview()),

  setPaused: adminOnly.input(z.object({ paused: z.boolean() })).handler(async ({ input }) => {
    try {
      await setPaused(input.paused);
    } catch {
      throw new ORPCError("PRECONDITION_FAILED", { message: "Tabellen fehlen — zuerst migre-retention.mjs ausführen." });
    }
    return { ok: true as const, paused: input.paused };
  }),

  preview: adminOnly.handler(async () => {
    let s;
    try {
      s = await runRetentionCycle({ dryRun: true });
    } catch {
      throw new ORPCError("PRECONDITION_FAILED", { message: "Tabellen fehlen — zuerst migre-retention.mjs ausführen." });
    }
    const acting = s.decisions.filter((d) => d.decision.action !== "none").slice(0, 200);
    const ids = acting.map((d) => d.userId);
    const people = ids.length ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, ids)) : [];
    const who = new Map(people.map((p) => [p.id, p]));
    return {
      scanned: s.scanned,
      actions: s.actions,
      skipped: s.skipped,
      items: acting.map(({ userId, decision }) => ({
        userId,
        userName: who.get(userId)?.name ?? null,
        userEmail: who.get(userId)?.email ?? null,
        action: decision.action,
        reason: decision.reason,
        channel: decision.action === "none" ? null : decision.channel,
        title: decision.action === "none" ? "" : decision.message.title,
        body: decision.action === "none" ? "" : decision.message.body,
      })),
    };
  }),
};
