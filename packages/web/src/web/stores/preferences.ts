import { create } from "zustand";
import { persist } from "zustand/middleware";

// User-facing calculation preferences. Kept separate from the profile store so
// resetting the account never wipes a harmless UI preference.
export type CodeLang = "matlab" | "python";

interface PreferencesState {
  codeLang: CodeLang;
  setCodeLang: (lang: CodeLang) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      codeLang: "python",
      setCodeLang: (codeLang) => set({ codeLang }),
    }),
    { name: "aerostudy-preferences" },
  ),
);
