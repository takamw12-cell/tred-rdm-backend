import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Locale } from "@/i18n/types";

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: "de",
      setLocale: (locale) => {
        set({ locale });
        if (typeof document !== "undefined") {
          document.documentElement.lang = locale;
        }
      },
    }),
    { name: "aerostudy-locale" },
  ),
);
