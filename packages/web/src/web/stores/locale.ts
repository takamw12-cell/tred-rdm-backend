import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/types";
import { client } from "@/lib/api";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/**
 * La langue vit à trois endroits, et les trois doivent rester d'accord :
 *
 *   1. ce store          → l'interface, instantané
 *   2. localStorage      → survit au rechargement (via `persist`)
 *   3. user_access.locale → ce que le TUTEUR lit pour choisir sa langue
 *
 * Le troisième est celui qu'on oubliait. Sans lui, le menu passe en espagnol
 * et l'IA continue en allemand : elle ne lit pas le navigateur, elle lit la
 * base.
 *
 * Aucun `window.location.reload()`. Recharger la page perd la conversation en
 * cours, et n'est de toute façon pas nécessaire : `useT()` s'abonne au store,
 * donc chaque composant se redessine tout seul au clic.
 */
export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "de",
      setLocale: (locale) => {
        set({ locale });

        if (typeof document !== "undefined") {
          document.documentElement.lang = locale;
        }

        // Écriture au fil de l'eau. Le `.catch` vide est délibéré : un serveur
        // injoignable ne doit pas empêcher quelqu'un de changer la langue de
        // son interface. La prochaine réponse du tuteur rattrapera.
        void client.account.setLocale({ locale }).catch(() => {});
      },
    }),
    { name: "aerostudy-locale" },
  ),
);
