import type { ThemeColors } from "@/constants/theme";
import { useTheme } from "@/lib/theme";

/**
 * La palette du thème actif.
 *
 * ```tsx
 * const colors = useColors();
 * <View style={{ backgroundColor: colors.background }}>
 *   <Text style={{ color: colors.foreground }}>Hello</Text>
 * </View>
 * ```
 *
 * Ce hook lisait directement `useColorScheme()` de React Native, donc le
 * réglage du téléphone et rien d'autre. Il passe désormais par `useTheme()`,
 * qui tient compte du choix fait dans l'écran Réglages et retombe sur le
 * système quand ce choix vaut « système ».
 *
 * Aucun écran n'a eu à changer : la signature est identique, et tous
 * l'appellent déjà.
 */
export function useColors(): ThemeColors {
  return useTheme().colors;
}
