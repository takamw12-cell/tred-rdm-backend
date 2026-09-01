import type { Locale } from "@/i18n/types";

/**
 * Un texte de contenu, dans les langues où il existe.
 *
 * ── Pourquoi ce type plutôt que `Record<Locale, string>` ──────────────────
 *
 * Les tables de contenu — dictionnaire technique, ADN des cours, réponses
 * d'exemple — ont été écrites en allemand, français et anglais. Quand la liste
 * des langues est passée à douze, `Record<Locale, string>` a exigé les douze
 * de chacune des quatre-vingts entrées. Quatre-vingt-quatre erreurs de type
 * d'un coup, pour un défaut qui n'en est pas un : personne n'a jamais promis
 * que le dictionnaire de mécanique existerait en bengali.
 *
 * L'allemand reste obligatoire. C'est la langue du cours, celle des termes
 * techniques, et donc le seul repli qui ne laisse jamais un écran vide.
 */
export type LocalizedText = { de: string } & Partial<Record<Locale, string>>;

/** Le texte dans la langue demandée, sinon l'allemand. */
export function pick(text: LocalizedText, locale: Locale): string {
  return text[locale] ?? text.de;
}
