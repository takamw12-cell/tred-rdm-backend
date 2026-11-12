import { authed } from "../middleware/auth";
import { featureDisabled } from "../lib/feature-disabled";

/**
 * Les cours partagés — FERMÉS depuis le 12 nov. 2026.
 *
 * Un polycopié est une œuvre protégée (UrhG) : TRED ne diffuse plus aucun
 * document d'un étudiant à un autre. Toutes les routes ci-dessous répondent
 * 403 « Feature disabled ». Les tables `course` et `course_member` restent en
 * base, intactes, pour une réouverture future sous un autre régime (documents
 * libres de droits, accord de l'enseignant). L'ancienne implémentation est
 * dans l'historique git (avant ce commit).
 *
 * Ce qui suit décrit l'ancien comportement, conservé pour mémoire.
 *
 * ── Le problème mesuré ────────────────────────────────────────────────────
 *
 * Treize comptes, onze n'ayant jamais déposé un seul document. Un nouvel
 * inscrit arrivait devant un tableau de bord vide : rien à lire, donc rien à
 * demander, donc aucune raison de revenir. Aucun écran d'accueil ne répare ça,
 * parce que ce n'est pas un problème d'explication — il n'y a réellement rien.
 *
 * À la FH Aachen, tous les étudiants d'une même Vorlesung ont le même Skript.
 * Le premier qui le dépose rend l'application utile pour les trente suivants.
 *
 * ── Ce que ces routes garantissent ────────────────────────────────────────
 *
 * Un document partagé reste la propriété de celui qui l'a déposé. `share` ne
 * copie rien : il bascule `visibility`. `unshare` le remet à "private" et le
 * document disparaît de la bibliothèque à l'instant même, pour tout le monde.
 * C'est la seule construction dans laquelle un retrait est certain — et un
 * polycopié de cours est une œuvre protégée, donc le retrait doit l'être.
 *
 * Personne ne peut partager le document d'un autre, ni retirer celui d'un
 * autre : chaque écriture recoupe `document.userId`.
 */

/**
 * L'identité réelle d'un cours.
 *
 * Sans normalisation, « Elektrotechnik 2 », « elektrotechnik 2 » et
 * « Elektrotechnik  2 » feraient trois cours d'un membre chacun : le partage
 * n'aurait jamais lieu et le problème resterait entier, en donnant l'illusion
 * du contraire.
 *
 * On enlève les accents (NFD puis suppression des diacritiques), on abaisse la
 * casse, on réduit toute suite de caractères non alphanumériques à un tiret.
 * « Elektrotechnik II » et « Elektrotechnik 2 » restent DEUX cours : les
 * confondre demanderait de comprendre les chiffres romains dans un nom libre,
 * et fusionner à tort deux cours différents est bien pire que d'en avoir deux.
 */
export function normalizeCourseKey(university: string, name: string): string {
  const nettoie = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  return `${nettoie(university)}/${nettoie(name)}`;
}

/**
 * Les cours de l'appelant : plus aucun, pour personne.
 *
 * La signature est conservée (les appelants la passent à `visibleDocuments`),
 * mais la table `course_member` n'est plus lue.
 */
export async function myCourseIds(_userId: string): Promise<string[]> {
  return [];
}

/** Toute route de partage : authentifiée, puis refusée. */
const ferme = authed.handler(() => featureDisabled());

export const courses = {
  mine: ferme,
  search: ferme,
  create: ferme,
  join: ferme,
  leave: ferme,
  documents: ferme,
  shareable: ferme,
  share: ferme,
  unshare: ferme,
};
