import { Platform } from "react-native";

/**
 * App color tokens. Recolor these to brand the app — every screen and component
 * reads from here via `useColors()` (see `hooks/use-colors.ts`), so changing a
 * value here updates the whole app in both light and dark mode.
 *
 * The token names mirror the web app's design tokens (`packages/web/src/web/styles.css`)
 * so the two platforms share one vocabulary: `background`, `foreground`, `card`,
 * `primary`, `muted`, `border`, etc. Values are plain hex/rgba strings — React
 * Native's StyleSheet does not support CSS color functions like `oklch()`.
 */
export const Colors = {
  light: {
    background: "#F3F5F7",
    foreground: "#15181B",
    card: "#FFFFFF",
    cardForeground: "#171717",
    primary: "#10427B",
    primaryForeground: "#FFFFFF",
    secondary: "#F5F5F5",
    secondaryForeground: "#1F1F1F",
    muted: "#F5F5F5",
    mutedForeground: "#737373",
    accent: "#F5F5F5",
    accentForeground: "#1F1F1F",
    border: "#E5E5E5",
    destructive: "#DC2626",
    success: "#16A34A",
    warning: "#D97706",
    /** Fond très léger de la bulle du tuteur — plus doux qu'une carte pleine. */
    accentSoft: "#E7EDF6",
    /** Fond d'un champ de saisie, qui doit se distinguer de la page. */
    input: "#FFFFFF",
    /** Jaune TRED — celui du logo. Ne change pas avec le thème. */
    signature: "#EAB308",
  },
  dark: {
    background: "#0F1215",
    foreground: "#E7EAEF",
    card: "#171B21",
    cardForeground: "#E7EAEF",
    primary: "#72AAF2",
    primaryForeground: "#0A0A0A",
    secondary: "#262626",
    secondaryForeground: "#FAFAFA",
    muted: "#262626",
    mutedForeground: "#A3A3A3",
    accent: "#262626",
    accentForeground: "#FAFAFA",
    border: "#262626",
    destructive: "#EF4444",
    success: "#22C55E",
    warning: "#F59E0B",
    accentSoft: "#1B2431",
    input: "#171B21",
    signature: "#EAB308",
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];

/**
 * Platform-appropriate font families. Use for `fontFamily` in styles, or load a
 * custom font with `useFonts` from `expo-font` and reference it here.
 */
export const Fonts = Platform.select({
  ios: {
    sans: "system-ui",
    serif: "ui-serif",
    rounded: "ui-rounded",
    mono: "ui-monospace",
  },
  default: {
    sans: "normal",
    serif: "serif",
    rounded: "normal",
    mono: "monospace",
  },
  web: {
    sans: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', sans-serif",
    mono: "'SF Mono', 'Roboto Mono', monospace",
  },
});

/**
 * Échelle d'espacement.
 *
 * Ces trois exports manquaient : `documents.tsx`, `paywall.tsx` et les écrans
 * de chat importaient déjà `{ Radius, Space }` depuis ce fichier. TypeScript
 * refusait le projet et Metro ne pouvait pas empaqueter.
 *
 * Une échelle, pas des nombres au hasard : quatre points de base, doublés à
 * chaque cran. C'est ce qui fait qu'une liste, une carte et un bouton dessinés
 * séparément s'alignent quand même.
 */
export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Rayons d'arrondi. `pill` vaut pour tout ce qui doit être parfaitement rond. */
export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Tailles de texte, alignées sur celles du web. */
export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 22,
  xxl: 28,
} as const;
