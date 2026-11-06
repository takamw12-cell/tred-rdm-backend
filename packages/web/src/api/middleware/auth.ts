import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { auth } from "../auth";
import { getAccess } from "../lib/access";

/** Optional auth — `context.user` is the session user or null. */
export const withUser = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  return next({
    context: { user: session?.user ?? null, session: session?.session ?? null },
  });
});

/** Protected procedures — rejects unauthenticated calls; `context.user` is non-null. */
export const authed = base.use(async ({ context, next }) => {
  const session = await auth.api.getSession({ headers: context.headers });
  if (!session) throw new ORPCError("UNAUTHORIZED");
  return next({ context: { user: session.user, session: session.session } });
});

/**
 * Procédures réservées au rôle admin. Même source de vérité que la garde REST
 * `requireAdmin()` d'api/index.ts : `getAccess` (table user_access, puis
 * ADMIN_EMAILS). Un compte non admin reçoit FORBIDDEN — jamais les données.
 */
export const adminOnly = authed.use(async ({ context, next }) => {
  const access = await getAccess(context.user.id, context.user.email);
  if (access.role !== "admin" || !access.isActive) throw new ORPCError("FORBIDDEN");
  return next();
});
