import type { de } from "./messages/de";

export type Locale = "de" | "fr" | "en";

type DeepString<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepString<T[K]>;
};

export type Messages = DeepString<typeof de>;
