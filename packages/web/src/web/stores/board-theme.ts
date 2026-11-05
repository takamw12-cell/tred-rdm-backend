import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Le fond de la Tafel, choisi par l'étudiant et retenu sur cet appareil.
 *
 *   white  — « Weiß » : verre blanc, encre bleu nuit (le Hörsaal validé)
 *   green  — « Grün » : tableau vert forêt #2E4A3A, craie blanche
 *   dark   — « Dunkel » : verre bleu nuit, encre blanche, accents jaunes
 *
 * Toutes les couleurs dépendantes (encre, KaTeX, schémas SVG, tampon) suivent
 * via les variables CSS posées par <GlassBoard> (styles.css,
 * [data-board-theme]).
 */
export type BoardTheme = "white" | "green" | "dark";

export const BOARD_THEMES: BoardTheme[] = ["white", "green", "dark"];

interface BoardThemeState {
  theme: BoardTheme;
  setTheme: (theme: BoardTheme) => void;
}

export const useBoardTheme = create<BoardThemeState>()(
  persist(
    (set) => ({
      theme: "white",
      setTheme: (theme) => set({ theme }),
    }),
    { name: "tred-board-theme" },
  ),
);
