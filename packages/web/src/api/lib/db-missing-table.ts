/**
 * « La table n'existe pas encore » (migration pas lancée), quelle que soit la
 * façon dont l'erreur arrive. Drizzle 0.45 emballe l'erreur de la base :
 * le message dit « Failed query: … » et le vrai motif (« no such table ») est
 * dans `cause` — parfois deux niveaux plus bas. Constaté le 19 nov. 2026 :
 * l'enregistrement du professeur répondait 500 au lieu de « bientôt
 * disponible ».
 */
export function isMissingTable(error: unknown): boolean {
  let e: unknown = error;
  for (let depth = 0; e && depth < 5; depth++) {
    const message = typeof e === "object" ? String((e as { message?: unknown }).message ?? "") : String(e);
    if (/no such table/i.test(message)) return true;
    e = typeof e === "object" ? (e as { cause?: unknown }).cause : undefined;
  }
  return false;
}

/** Le motif d'une erreur de base, sans données : première ligne du message le plus profond, 160 caractères. */
export function dbErrorReason(error: unknown): string {
  let e: unknown = error;
  let last = "";
  for (let depth = 0; e && depth < 5; depth++) {
    const m = typeof e === "object" ? String((e as { message?: unknown }).message ?? "") : String(e);
    if (m) last = m;
    e = typeof e === "object" ? (e as { cause?: unknown }).cause : undefined;
  }
  return last.split("\n")[0]!.slice(0, 160);
}
