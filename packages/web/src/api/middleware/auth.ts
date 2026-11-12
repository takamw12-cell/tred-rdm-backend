import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { auth } from "../auth";
import { getAccess } from "../lib/access";
import { checkAdmin } from "../lib/admin-guard";

/** Optional auth — `context.user` is the session user or null. */
export const withUser = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  // Compte bloqué : traité comme un visiteur anonyme.
  const active = session ? (await getAccess(session.user.id, session.user.email)).isActive : false;
  return next({
    context: { user: active ? session!.user : null, session: active ? session!.session : null },
  });
});

/** Protected procedures — rejects unauthenticated calls; `context.user` is non-null. */
export const authed = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session) throw new ORPCError("UNAUTHORIZED");
  // Compte bloqué : refusé ICI aussi. Le gestionnaire RPC est monté avant la
  // garde « Sperre » d'api/index.ts (createApp, __core/app.ts) : sans cette
  // vérification, un compte bloqué qui se reconnectait gardait l'accès à
  // toutes les procédures /api/rpc/* (constaté et corrigé le 2026-11-09).
  const access = await getAccess(session.user.id, session.user.email);
  if (!access.isActive) throw new ORPCError("FORBIDDEN", { message: "ACCOUNT_DISABLED" });
  return next({ context: { user: session.user, session: session.session, access } });
});

/**
 * Procédures réservées à l'administration. Même règle que la garde REST et
 * que la page : lib/admin-guard.ts (e-mail dans ADMIN_EMAILS ET rôle admin).
 * Un compte qui n'est pas admin reçoit NOT_FOUND — jamais FORBIDDEN, qui
 * confirmerait que la procédure existe — et jamais les données.
 */
export const adminOnly = authed.use(async ({ context, next }) => {
  const check = await checkAdmin(context.headers);
  if (check.state !== "admin") throw new ORPCError("NOT_FOUND");
  return next();
});
