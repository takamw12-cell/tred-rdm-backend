import type { de } from "./messages/de";

export type Locale =
  | "de" | "en" | "fr" | "es"
  | "it" | "pt" | "ru" | "ar"
  | "zh" | "hi" | "bn" | "ja";

type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

export type Messages = DeepString<typeof de>;

/**
 * Un paquet de langue n'a pas besoin d'être complet.
 *
 * Il est fusionné par-dessus l'allemand au chargement : une clé absente
 * affiche donc l'allemand, jamais son chemin technique. C'est ce qui rend
 * l'ajout d'une langue possible en une heure au lieu d'une journée — et
 * impossible à casser.
 */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]>;
};

export type PartialMessages = DeepPartial<Messages>;
