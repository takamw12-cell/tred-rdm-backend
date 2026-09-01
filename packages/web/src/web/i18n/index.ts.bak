import { useCallback, useSyncExternalStore } from "react";
import { de } from "./messages/de";
import type { Locale, Messages } from "./types";
import { useLocaleStore } from "@/stores/locale";

export type { Locale, Messages };

/**
 * Les paquets de traduction sont chargés À LA DEMANDE.
 *
 * Avant, les 3 langues étaient importées statiquement : 60 Ko de
 * JavaScript téléchargés par CHAQUE visiteur, dont 2 langues qu'il ne lira
 * jamais. Sur le réseau d'un campus, ça se sent au premier affichage.
 *
 * Seul le de est embarqué — il s'affiche immédiatement, sans attente. Les
 * autres arrivent en arrière-plan au moment où on les demande, et restent en
 * mémoire ensuite. Vite les découpe automatiquement en fichiers séparés.
 */
const LOADERS: Record<Locale, () => Promise<Messages>> = {
  de: async () => de,
  fr: () => import("./messages/fr").then((m) => m.fr),
  en: () => import("./messages/en").then((m) => m.en),
};

const loaded: Partial<Record<Locale, Messages>> = { de };
const pending = new Set<Locale>();

/* Abonnement minimal : les composants se redessinent quand un paquet arrive. */
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version += 1;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const getVersion = () => version;

/** Précharge une langue. Sans effet si elle est déjà là ou en cours. */
export function preloadLocale(locale: Locale): void {
  if (loaded[locale] || pending.has(locale)) return;
  pending.add(locale);
  LOADERS[locale]()
    .then((pack) => {
      loaded[locale] = pack;
      emit();
    })
    .catch(() => {
      // Réseau coupé pendant le chargement : on retombe sur le de,
      // l'interface reste lisible. Une nouvelle tentative aura lieu au
      // prochain rendu.
    })
    .finally(() => pending.delete(locale));
}

export const localeMeta: { code: Locale; flag: string; label: string }[] = [
  { code: "de", flag: "🇩🇪", label: "DE" },
  { code: "fr", flag: "🇫🇷", label: "FR" },
  { code: "en", flag: "🇬🇧", label: "EN" },
];

// Resolve a dot-path against the message tree.
function resolve(obj: unknown, path: string): string {
  const value = path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined,
      obj,
    );
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
 * Hook de traduction. Lire la langue depuis le store fait que chaque
 * consommateur se redessine à l'instant du changement — sans rechargement.
 *
 * Tant que le paquet demandé n'est pas arrivé, on affiche le de. C'est
 * imperceptible sur une connexion normale, et bien préférable à un écran vide
 * ou à des clés brutes.
 */
export function useT(): { t: TranslateFn; locale: Locale } {
  const locale = useLocaleStore((s) => s.locale);
  useSyncExternalStore(subscribe, getVersion, getVersion);

  preloadLocale(locale);
  const pack = loaded[locale] ?? de;

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      // __fallbackDe : une clé absente de la langue courante retombe
      // sur l'allemand plutôt que d'afficher son chemin technique.
      let text = resolve(pack, key);
      if (text === key && pack !== de) text = resolve(de, key);
      return interpolate(text, vars);
    },
    [pack],
  );

  return { t, locale };
}
