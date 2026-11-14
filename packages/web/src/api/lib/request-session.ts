import { auth } from "../auth";

/**
 * La session d'une requête, lue UNE fois.
 *
 * Le garde-fou global (api/index.ts : compte désactivé → 403) lit la session
 * de chaque appel ; la route la relisait ensuite pour elle-même. Deux allers-
 * retours en base pour la même réponse, sur chaque requête — et sur le suivi
 * d'un import, c'est une requête par seconde et par étudiant.
 *
 * Ici, la première lecture est gardée le temps de la requête (clé : l'objet
 * Request, donc rien ne survit à la réponse) ; les suivantes la réutilisent.
 */
export type RequestSession = Awaited<ReturnType<typeof auth.api.getSession>>;

const sessions = new WeakMap<Request, Promise<RequestSession>>();

export function requestSession(request: Request): Promise<RequestSession> {
  let pending = sessions.get(request);
  if (!pending) {
    pending = auth.api.getSession({ headers: request.headers });
    sessions.set(request, pending);
  }
  return pending;
}
