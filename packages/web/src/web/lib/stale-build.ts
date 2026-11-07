/**
 * Onglet ouvert AVANT un déploiement → il réclame d'anciens fichiers.
 *
 * Les pages (chat, dashboard…) sont chargées à la demande sous un nom haché
 * (`chat-BkBOnR7-.js`). Après un déploiement, ces noms n'existent plus ; le
 * serveur répond par index.html, et le navigateur refuse :
 *   « 'text/html' is not a valid JavaScript MIME type ».
 * Constaté le 7 nov. 2026 à 14:34 : le chat affichait « Etwas ist
 * schiefgelaufen » et AUCUNE question n'atteignait le serveur. « Erneut
 * versuchen » ne servait à rien : il redemandait le même fichier disparu.
 *
 * Le remède est un rechargement complet (le nouvel index.html pointe vers les
 * nouveaux fichiers). Une fois seulement par minute, pour ne jamais boucler
 * si le problème est ailleurs.
 */
const STALE_CHUNK =
  /not a valid JavaScript MIME type|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk \d+ failed/i;

export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error ?? "");
  return STALE_CHUNK.test(message);
}

const KEY = "tred:stale-reload-at";
const MIN_GAP_MS = 60_000;

/** Recharge la page une fois. Renvoie false si un rechargement vient d'avoir lieu (on n'insiste pas). */
export function reloadForNewBuild(
  storage: Pick<Storage, "getItem" | "setItem"> | null = safeSession(),
  reload: () => void = () => window.location.reload(),
  now = Date.now(),
): boolean {
  try {
    const last = Number(storage?.getItem(KEY) ?? 0);
    if (last && now - last < MIN_GAP_MS) return false;
    storage?.setItem(KEY, String(now));
  } catch {
    /* stockage bloqué : on recharge quand même, une fois */
  }
  reload();
  return true;
}

function safeSession(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}
