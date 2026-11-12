import { eq, type SQL } from "drizzle-orm";

import { document } from "../database/schema";

/**
 * Ce qu'un étudiant a le droit de lire : SES documents, et rien d'autre.
 *
 * ── Décision du 12 nov. 2026 ──────────────────────────────────────────────
 *
 * Le partage de cours est fermé (UrhG : un polycopié est une œuvre protégée).
 * La règle redevient `eq(document.userId, moi)`, sans exception. Même un
 * document resté par erreur en `visibility = "course"` n'est plus lisible que
 * par son propriétaire : la colonne n'est plus consultée.
 *
 * La fonction reste l'unique point de passage (chat, exercices, formules,
 * vidéo, Karteikarten, Klausur-Prognose) : le jour où une règle de partage
 * revient, elle revient ici et nulle part ailleurs. Le paramètre `courseIds`
 * est conservé pour ne pas toucher aux appelants ; il est ignoré.
 */
export function visibleDocuments(userId: string, _courseIds: string[] = []): SQL {
  return eq(document.userId, userId);
}

/**
 * La même règle, appliquée à une ligne déjà lue.
 */
export function canRead(
  row: { userId: string; courseId: string | null; visibility: string },
  userId: string,
  _courseIds: string[] = [],
): boolean {
  return row.userId === userId;
}
