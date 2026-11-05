import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * L'app est en mode clair uniquement depuis la refonte premium (2026-11).
 * Le CSS `.dark` et ce store sont conservés : repasser à `false` suffit à
 * réactiver le mode sombre, sans rien réécrire.
 */
export const LIGHT_ONLY = true;

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const dark =
    !LIGHT_ONLY && (theme === "dark" || (theme === "system" && systemPrefersDark()));
  document.documentElement.classList.toggle("dark", dark);
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    {
      name: "aerostudy-theme",
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? "system");
      },
    },
  ),
);
