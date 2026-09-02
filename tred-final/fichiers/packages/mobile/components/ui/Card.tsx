import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle, type StyleProp } from "react-native";

import { useColors } from "@/hooks/use-colors";
import { Radius, Space } from "@/constants/theme";

/**
 * La carte — le conteneur de base des listes et des offres.
 *
 * `padded={false}` existe parce qu'une ligne de liste dessine sa propre
 * disposition interne : lui imposer une marge doublerait celle de son contenu
 * et casserait l'alignement des icônes.
 *
 * `highlighted` sert à l'offre mise en avant du paywall. Elle est marquée par
 * la couleur de la bordure et son épaisseur, jamais par un fond différent :
 * un fond coloré derrière du texte de prix nuit à la lisibilité, et le
 * contraste doit tenir dans les deux thèmes.
 */
export function Card({
  children,
  padded = true,
  highlighted = false,
  onPress,
  style,
}: {
  children: ReactNode;
  padded?: boolean;
  highlighted?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();

  const base: ViewStyle = {
    backgroundColor: c.card,
    borderColor: highlighted ? c.primary : c.border,
    borderWidth: highlighted ? 2 : StyleSheet.hairlineWidth,
  };

  const content = [styles.card, base, padded && styles.padded, style];

  if (!onPress) return <View style={content}>{children}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...content, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: Radius.lg, overflow: "hidden" },
  padded: { padding: Space.lg },
  // Un simple assombrissement : un effet de mise à l'échelle sur une carte de
  // liste fait sauter les lignes voisines pendant le défilement.
  pressed: { opacity: 0.7 },
});
