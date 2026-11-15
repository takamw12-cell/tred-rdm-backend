/**
 * Sessions de chat par document, côté navigateur (2026-11-15).
 * Fonctions pures : l'adresse, le tri du tiroir d'historique, et la règle qui
 * protège une question déjà posée. La page (pages/chat.tsx) les assemble ;
 * le serveur garde les droits (api/lib/chat-sessions.ts).
 */

/** `/chat?doc=<id>` : le document de la session ouverte. Absent = « Alle Materialien ». */
export const DOC_PARAM = "doc";

/** Les identifiants sont des UUID ; tout le reste est ignoré plutôt que transmis. */
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function docFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(DOC_PARAM);
  return value && DOC_ID.test(value) ? value : null;
}

/** La même adresse avec ce document — ou sans (portée globale). Les autres paramètres restent. */
export function searchWithDoc(search: string, docId: string | null): string {
  const params = new URLSearchParams(search);
  if (docId) params.set(DOC_PARAM, docId);
  else params.delete(DOC_PARAM);
  const out = params.toString();
  return out ? `?${out}` : "";
}

export interface ScopeRef {
  documentId: string | null;
  semesterId: string | null;
}

/**
 * Les conversations de la portée ouverte, dans l'ordre de la liste (la plus
 * récente d'abord). Un document : les siennes. Global : celles sans document,
 * du même semestre.
 */
export function conversationsOfScope<T extends ScopeRef>(list: readonly T[], scope: ScopeRef): T[] {
  if (scope.documentId) return list.filter((c) => c.documentId === scope.documentId);
  return list.filter((c) => !c.documentId && (c.semesterId ?? null) === (scope.semesterId ?? null));
}

/**
 * La session d'un document arrive du serveur un instant après le clic. On ne
 * l'affiche que si rien n'a bougé entre-temps : même demande, même tableau
 * vide, pas un mot écrit. Sinon l'historique attend dans le tiroir — il
 * n'écrase jamais une question que l'étudiant vient de poser.
 */
export function mayApplyResume(state: { requestToken: number; currentToken: number; freshSessionId: string; currentSessionId: string; messageCount: number }): boolean {
  return state.requestToken === state.currentToken && state.freshSessionId === state.currentSessionId && state.messageCount === 0;
}
