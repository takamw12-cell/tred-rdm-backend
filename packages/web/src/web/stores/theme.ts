import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  /** Bascule en un clic (barre latérale) : clair ↔ sombre. */
  toggle: () => void;
}

function systemPrefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Mode sombre réactivé (2026-11-06, demande du fondateur) : bleu nuit
 * #0F172A, cartes en verre sombre, accent jaune #EAB308 (styles.css › .dark).
 * Repasser à `true` cache à nouveau tous les sélecteurs et force le clair.
 */
export const LIGHT_ONLY = false;

/** Le thème réellement affiché (« system » résolu). */
export function isDark(theme: Theme): boolean {
  return !LIGHT_ONLY && (theme === "dark" || (theme === "system" && systemPrefersDark()));
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const dark = isDark(theme);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  // Barre d'état du navigateur mobile : même couleur que le fond.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0F172A" : "#FDFBF7");
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      // Clair par défaut : le sombre est un CHOIX (bouton près de l'avatar,
      // ou Paramètres → Erscheinungsbild, qui propose aussi « System »).
      theme: "light",
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      toggle: () => get().setTheme(isDark(get().theme) ? "light" : "dark"),
    }),
    {
      name: "aerostudy-theme",
      // v1 : « system » était la valeur par défaut, enregistrée pour tous
      // pendant que le sombre était coupé — personne ne l'a choisi. On repart
      // en clair plutôt que de basculer en sombre ceux dont l'OS l'est.
      version: 1,
      migrate: (persisted, version) => {
        const theme = (persisted as { theme?: Theme } | undefined)?.theme;
        return { theme: version < 1 || !theme || theme === "system" ? "light" : theme } as ThemeState;
      },
      onRehydrateStorage: () => (state) => {
        applyTheme(state?.theme ?? "light");
      },
    },
  ),
);
