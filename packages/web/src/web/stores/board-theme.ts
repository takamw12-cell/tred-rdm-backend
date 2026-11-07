import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_TAFEL_COLORS, type TafelColors } from "@/lib/tafel-colors";

/**
 * Le fond de la Tafel, choisi par l'étudiant et retenu sur cet appareil.
 *
 *   white  — « Weiß » : verre blanc, encre bleu nuit (le Hörsaal validé)
 *   green  — « Grün » : tableau vert forêt #2E4A3A, craie blanche
 *   dark   — « Dunkel » : verre bleu nuit, encre blanche, accents jaunes
 *
 * Ou des couleurs LIBRES (`custom`) : fond et craie au sélecteur de couleur,
 * chacun avec sa densité. Elles s'appliquent en direct via --tafel-bg et
 * --tafel-text (lib/tafel-colors.ts) ; choisir un thème les efface.
 *
 * Toutes les couleurs dépendantes (encre, KaTeX, schémas SVG, tampon) suivent
 * via les variables CSS posées par <GlassBoard> (styles.css,
 * [data-board-theme]).
 */
export type BoardTheme = "white" | "green" | "dark";

export const BOARD_THEMES: BoardTheme[] = ["white", "green", "dark"];

interface BoardThemeState {
  theme: BoardTheme;
  custom: TafelColors | null;
  setTheme: (theme: BoardTheme) => void;
  /** Modifie une partie des couleurs libres (part des valeurs actuelles, ou du vert par défaut). */
  setCustom: (patch: Partial<TafelColors>) => void;
  resetCustom: () => void;
}

export const useBoardTheme = create<BoardThemeState>()(
  persist(
    (set) => ({
      theme: "white",
      custom: null,
      setTheme: (theme) => set({ theme, custom: null }),
      setCustom: (patch) => set((s) => ({ custom: { ...(s.custom ?? DEFAULT_TAFEL_COLORS), ...patch } })),
      resetCustom: () => set({ custom: null }),
    }),
    { name: "tred-board-theme" },
  ),
);
