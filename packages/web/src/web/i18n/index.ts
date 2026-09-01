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
/**
 * Fusion profonde d'un paquet partiel par-dessus l'allemand.
 *
 * Sans elle, une clé absente d'une traduction afficherait son chemin technique
 * — « settings.themeLabel » en plein milieu de l'écran. Avec elle, elle
 * affiche l'allemand, et une langue peut être livrée à moitié traduite sans
 * que personne ne le voie comme un défaut.
 */
function mergeOverDe(base: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== "object") return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    out[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? mergeOverDe(out[key], value)
        : value;
  }
  return out;
}

const LOADERS: Partial<Record<Locale, () => Promise<unknown>>> = {
  fr: () => import("./messages/fr").then((m) => m.fr),
  en: () => import("./messages/en").then((m) => m.en),
  es: () => import("./messages/es").then((m) => m.es),
  it: () => import("./messages/it").then((m) => m.it),
  pt: () => import("./messages/pt").then((m) => m.pt),
  ru: () => import("./messages/ru").then((m) => m.ru),
  ar: () => import("./messages/ar").then((m) => m.ar),
  zh: () => import("./messages/zh").then((m) => m.zh),
  hi: () => import("./messages/hi").then((m) => m.hi),
  bn: () => import("./messages/bn").then((m) => m.bn),
  ja: () => import("./messages/ja").then((m) => m.ja),
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
  const load = LOADERS[locale];
  if (!load) {
    // Aucune traduction pour cette langue : l'allemand reste affiché, et le
    // tuteur répond quand même dans la langue choisie. Ne JAMAIS lever ici —
    // `preloadLocale` est appelé pendant le rendu.
    pending.delete(locale);
    return;
  }

  load()
    .then((pack) => {
      loaded[locale] = mergeOverDe(de, pack) as Messages;
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
