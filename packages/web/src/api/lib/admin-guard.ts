/**
 * L'accès à l'administration : UNE règle, appliquée partout (page /admin,
 * routes REST /api/admin/*, procédures oRPC `adminOnly`).
 *
 * ── Double protection, côté serveur uniquement ────────────────────────────
 *
 *   1. LISTE BLANCHE : l'e-mail de la session doit figurer, exactement, dans
 *      `ADMIN_EMAILS` (séparés par des virgules). Liste vide, absente ou mal
 *      écrite : PERSONNE n'entre (« fail closed »).
 *   2. RÔLE : la ligne `user_access` du compte doit porter le rôle "admin",
 *      et le compte doit être actif. Le rôle est lu en base ; rien de ce que
 *      le navigateur envoie n'est pris en compte.
 *
 * Les deux conditions sont exigées ENSEMBLE : retirer une adresse de
 * `ADMIN_EMAILS` ferme l'accès tout de suite, même si le rôle est resté en
 * base ; et un rôle "admin" posé par erreur sur un autre compte n'ouvre rien.
 *
 * ── Ce que voit quelqu'un qui n'est pas admin ─────────────────────────────
 *
 *   - sans session : 401 sur l'API, 404 sur la page ;
 *   - avec une session d'étudiant : 404 partout. Pas 403 : un 403 confirme
 *     que la page existe.
 */
import { auth, emailVerificationActive } from "../auth";
import { getAccess } from "./access";

const EMAIL = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/;

/** Les adresses autorisées, normalisées. Tout ce qui n'est pas une adresse est ignoré. */
export function adminWhitelist(raw: string | undefined = process.env.ADMIN_EMAILS): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => EMAIL.test(e));
}

export interface AdminCandidate {
  email?: string | null;
  /** L'adresse a-t-elle été confirmée par e-mail ? */
  emailVerified?: boolean | null;
  /** `user_access.role`, lu en base. */
  role?: string | null;
  /** `user_access.is_active`. */
  isActive?: boolean | null;
}

/**
 * La règle elle-même. Fonction pure (testée).
 * `requireVerified` : quand le serveur vérifie les adresses par e-mail, une
 * adresse non confirmée n'entre pas — sinon il suffirait de s'inscrire avec
 * l'adresse du fondateur avant lui.
 */
export function isAdminAllowed(candidate: AdminCandidate, whitelist: string[], requireVerified: boolean): boolean {
  if (whitelist.length === 0) return false;
  const email = (candidate.email ?? "").trim().toLowerCase();
  if (!email || !whitelist.includes(email)) return false;
  if (requireVerified && candidate.emailVerified !== true) return false;
  return candidate.role === "admin" && candidate.isActive === true;
}

export type AdminCheck = { state: "anonymous" } | { state: "denied" } | { state: "admin"; userId: string };

/** Qui frappe à la porte ? Aucune donnée d'administration n'est lue ici. */
export async function checkAdmin(headers: Headers): Promise<AdminCheck> {
  const session = await auth.api.getSession({ headers }).catch(() => null);
  if (!session) return { state: "anonymous" };
  const whitelist = adminWhitelist();
  // Liste vide : inutile d'aller plus loin, et surtout aucun rôle n'est attribué.
  if (whitelist.length === 0) return { state: "denied" };
  const access = await getAccess(session.user.id, session.user.email).catch(() => null);
  const ok =
    access !== null &&
    isAdminAllowed(
      { email: session.user.email, emailVerified: session.user.emailVerified, role: access.role, isActive: access.isActive },
      whitelist,
      emailVerificationActive,
    );
  return ok ? { state: "admin", userId: session.user.id } : { state: "denied" };
}

/** Le code HTTP d'un refus sur l'API : 401 sans session, 404 pour tout autre compte. */
export const adminDenialStatus = (check: AdminCheck): 401 | 404 => (check.state === "anonymous" ? 401 : 404);

/** Les chemins de la page d'administration. */
export const isAdminPath = (pathname: string): boolean => pathname === "/admin" || pathname.startsWith("/admin/");

/**
 * Garde de la PAGE, appelée par le serveur avant de servir quoi que ce soit
 * (src/__server.ts). Renvoie la réponse 404 à envoyer, ou null si la page
 * peut être servie. Visiteur ou étudiant : la même réponse, mot pour mot.
 */
export async function adminPageDenial(request: Request): Promise<Response | null> {
  if (!isAdminPath(new URL(request.url).pathname)) return null;
  const check = await checkAdmin(request.headers);
  if (check.state === "admin") return null;
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", Vary: "Cookie" },
  });
}
