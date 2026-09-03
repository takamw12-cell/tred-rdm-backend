import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { Colors, type ColorScheme, type ThemeColors } from "@/constants/theme";

/**
 * Le thème choisi par l'étudiant.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 *
 * `useColors()` lisait `useColorScheme()` de React Native, c'est-à-dire le
 * réglage du système, et rien d'autre. L'application n'avait donc aucun moyen
 * d'offrir un choix : le mode sombre suivait le téléphone, point.
 *
 * Ce n'est pas un détail de confort. On révise le soir, souvent au lit, et le
 * téléphone d'un étudiant est réglé une fois pour toutes il y a deux ans. Le
 * choix devait exister quelque part ; il n'existait nulle part.
 *
 * ── Trois états, pas deux ─────────────────────────────────────────────────
 *
 * « système » n'est pas la même chose que « clair ». Quelqu'un qui a réglé son
 * téléphone pour basculer au coucher du soleil veut que l'app suive ; le
 * remplacer par un « clair » figé serait une régression déguisée en réglage.
 * D'où trois valeurs, et « système » par défaut.
 *
 * ── Pourquoi SecureStore et pas AsyncStorage ──────────────────────────────
 *
 * Aucune raison de sécurité — le thème n'est pas un secret. C'est le seul
 * stockage déjà installé (`expo-secure-store`, utilisé par la session et par
 * la langue). Ajouter `@react-native-async-storage` pour une chaîne de six
 * lettres serait une dépendance de plus à faire vivre.
 */

export const THEME_MODES = ["system", "light", "dark"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

const STORAGE_KEY = "tred.theme";

function isMode(value: string | null | undefined): value is ThemeMode {
  return !!value && (THEME_MODES as readonly string[]).includes(value);
}

interface ThemeState {
  /** Ce que l'étudiant a choisi — « system » tant qu'il n'a rien choisi. */
  mode: ThemeMode;
  /** Ce qui est réellement affiché, une fois « system » résolu. */
  scheme: ColorScheme;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() ?? "light";
  const [mode, setModeState] = useState<ThemeMode>("system");

  // Lecture au montage. Pendant l'aller-retour, « system » s'applique : c'est
  // le même rendu que l'ancien comportement, donc rien ne clignote pour ceux
  // qui n'ont jamais touché au réglage.
  useEffect(() => {
    let cancelled = false;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((value) => {
        if (!cancelled && isMode(value)) setModeState(value);
      })
      .catch(() => {
        /* web ou stockage refusé : le thème suit le système, comme avant */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    // L'écran change d'abord, l'écriture suit. Attendre le disque pour
    // repeindre ferait ressentir un temps mort sur un simple bouton.
    setModeState(next);
    void SecureStore.setItemAsync(STORAGE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo<ThemeState>(() => {
    const scheme: ColorScheme = mode === "system" ? system : mode;
    return { mode, scheme, colors: Colors[scheme], setMode };
  }, [mode, system, setMode]);

  return createElement(ThemeContext.Provider, { value }, children);
}

/**
 * Le thème courant.
 *
 * Hors du fournisseur, on retombe sur le système plutôt que de jeter. Un écran
 * rendu en dehors de l'arbre — un test, un aperçu Storybook — doit s'afficher,
 * pas planter sur une couleur.
 */
export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  const system = useColorScheme() ?? "light";

  if (ctx) return ctx;
  return {
    mode: "system",
    scheme: system,
    colors: Colors[system],
    setMode: () => {},
  };
}
