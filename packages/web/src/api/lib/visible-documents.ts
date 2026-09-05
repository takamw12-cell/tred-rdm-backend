import { and, eq, inArray, or, type SQL } from "drizzle-orm";

import { document } from "../database/schema";

/**
 * Ce qu'un étudiant a le droit de lire.
 *
 * ── Pourquoi cette fonction existe, et pourquoi elle est seule ────────────
 *
 * Avant la bibliothèque partagée, la règle tenait en `eq(document.userId, moi)`
 * et elle était recopiée dans le chat, les exercices, les formules et la
 * recherche. Maintenant qu'un document peut aussi être visible parce qu'il est
 * publié dans un cours suivi, la règle a deux branches — et une règle à deux
 * branches recopiée à cinq endroits finit toujours par diverger.
 *
 * Le jour où l'une des copies oublie la condition `visibility = "course"`,
 * chaque étudiant lit les documents privés de tous les autres. C'est la panne
 * dont on ne se relève pas : elle ne se voit pas, elle ne fait pas d'erreur,
 * et elle ne se découvre que de l'extérieur.
 *
 * D'où une fonction unique, testée, que tout appelant utilise.
 *
 * ── La règle ──────────────────────────────────────────────────────────────
 *
 *   je peux lire un document si
 *     il est à moi
 *     OU  il est publié (`visibility = "course"`) dans un cours dont je suis
 *         membre
 *
 * `visibility = "course"` n'est PAS redondant avec `courseId != null` : un
 * document retiré du partage garde son rattachement pour pouvoir y revenir
 * (voir le commentaire de la colonne). Sans cette condition, tout retrait
 * serait sans effet.
 */
export function visibleDocuments(userId: string, courseIds: string[]): SQL {
  const mien = eq(document.userId, userId);
  if (courseIds.length === 0) return mien;

  const partage = and(
    inArray(document.courseId, courseIds),
    eq(document.visibility, "course"),
  );

  // `or` peut renvoyer undefined selon les surcharges de Drizzle ; le `??`
  // garantit qu'un cas dégénéré retombe sur « seulement les miens », jamais
  // sur « tout ». Se tromper dans ce sens ne fait perdre qu'un document.
  return or(mien, partage) ?? mien;
}

/**
 * La même règle, appliquée à une ligne déjà lue.
 *
 * Sert aux vérifications ponctuelles — ouvrir un document par son identifiant,
 * par exemple — où l'on tient la ligne et non une requête.
 */
export function canRead(
  row: { userId: string; courseId: string | null; visibility: string },
  userId: string,
  courseIds: string[],
): boolean {
  if (row.userId === userId) return true;
  if (row.visibility !== "course") return false;
  if (row.courseId === null) return false;
  return courseIds.includes(row.courseId);
}
