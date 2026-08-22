import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/use-colors";
import { Radius, Space } from "@/constants/theme";

/**
 * Case à cocher de consentement.
 *
 * **Jamais précochée** — c'est le point qui décide de sa validité juridique.
 * Une case cochée d'avance n'est pas un consentement en droit allemand
 * (§ 356 Abs. 5 BGB pour la rétractation, et la même logique vaut pour le
 * RGPD). Le composant n'expose donc pas de valeur par défaut : l'état vient
 * de l'appelant, qui doit partir de `false`.
 */
export function Consent({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  const c = useColors();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync();
        onToggle();
      }}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.box,
          {
            backgroundColor: checked ? c.primary : "transparent",
            borderColor: checked ? c.primary : c.border,
          },
        ]}
      >
        {checked ? (
          <Ionicons name="checkmark" size={14} color={c.primaryForeground} />
        ) : null}
      </View>
      <Text style={[styles.label, { color: c.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: Space.sm },
  box: {
    width: 20,
    height: 20,
    borderRadius: Radius.sm - 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  label: { flex: 1, fontSize: 12, lineHeight: 17 },
});
