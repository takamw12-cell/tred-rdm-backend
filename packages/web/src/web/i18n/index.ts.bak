import { useCallback } from "react";
import { de } from "./messages/de";
import { fr } from "./messages/fr";
import { en } from "./messages/en";
import type { Locale, Messages } from "./types";
import { useLocaleStore } from "@/stores/locale";

export type { Locale, Messages };

export const messages: Record<Locale, Messages> = { de, fr, en };

export const localeMeta: { code: Locale; flag: string; label: string }[] = [
  { code: "de", flag: "🇩🇪", label: "DE" },
  { code: "fr", flag: "🇫🇷", label: "FR" },
  { code: "en", flag: "🇬🇧", label: "EN" },
];

// Resolve a dot-path against the message tree.
function resolve(obj: unknown, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>((acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), obj);
  return typeof value === "string" ? value : path;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

export type TranslateFn = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

/**
 * Reactive translation hook. Reading the locale from the store makes every
 * consumer re-render instantly on language switch — no reload, sub-100ms.
 */
export function useT(): { t: TranslateFn; locale: Locale } {
  const locale = useLocaleStore((s) => s.locale);
  const t = useCallback<TranslateFn>(
    (key, vars) => interpolate(resolve(messages[locale], key), vars),
    [locale],
  );
  return { t, locale };
}
