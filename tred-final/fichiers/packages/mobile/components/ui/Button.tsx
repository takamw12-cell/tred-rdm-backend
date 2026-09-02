import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/use-colors";
import { FontSize, Radius, Space } from "@/constants/theme";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

/**
 * Le bouton.
 *
 * ── Trois décisions qui méritent d'être dites ─────────────────────────────
 *
 * `loading` désactive le bouton en plus d'afficher la roue. Une roue sans
 * blocage laisse envoyer le formulaire deux fois — c'est le double paiement
 * et le document envoyé en double.
 *
 * La hauteur ne change pas entre l'état normal et l'état chargement : la roue
 * remplace le texte au même endroit. Sans cela, la mise en page saute au
 * moment précis où l'utilisateur regarde son doigt.
 *
 * `haptic` est optionnel et jamais automatique. Un retour tactile sur chaque
 * bouton d'une liste devient du bruit ; on le réserve aux gestes qui engagent
 * quelque chose — payer, envoyer, supprimer.
 */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  fullWidth = false,
  selected = false,
  haptic = false,
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** État d'un bouton de choix — mensuel / semestriel, par exemple. */
  selected?: boolean;
  haptic?: boolean;
}) {
  const c = useColors();
  const off = disabled || loading;

  const HEIGHT: Record<ButtonSize, number> = { sm: 36, md: 46, lg: 54 };
  const TEXT: Record<ButtonSize, number> = {
    sm: FontSize.sm,
    md: FontSize.md,
    lg: FontSize.lg,
  };

  const skin: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: c.primary, fg: c.primaryForeground, border: c.primary },
    secondary: { bg: c.secondary, fg: c.secondaryForeground, border: c.border },
    ghost: { bg: "transparent", fg: c.foreground, border: "transparent" },
    destructive: { bg: "transparent", fg: c.destructive, border: c.destructive },
  };

  // Un bouton de choix sélectionné se lit comme un bouton plein, quel que soit
  // son variant d'origine : c'est l'état, pas le style, qui doit se voir.
  const tone = selected ? skin.primary : skin[variant];

  const box: ViewStyle = {
    height: HEIGHT[size],
    backgroundColor: tone.bg,
    borderColor: tone.border,
    borderWidth: tone.bg === "transparent" ? StyleSheet.hairlineWidth : 0,
    alignSelf: fullWidth ? "stretch" : "auto",
  };

  function press() {
    if (off) return;
    if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off, busy: loading, selected }}
      disabled={off}
      onPress={press}
      style={({ pressed }) => [
        styles.root,
        box,
        pressed && styles.pressed,
        off && styles.off,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <Text
          numberOfLines={1}
          style={[styles.label, { color: tone.fg, fontSize: TEXT[size] }]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: Radius.md,
    paddingHorizontal: Space.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: Space.sm,
  },
  label: { fontWeight: "600", letterSpacing: -0.2 },
  pressed: { opacity: 0.85 },
  off: { opacity: 0.5 },
});
