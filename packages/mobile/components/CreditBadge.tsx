import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/use-colors";
import { useCredits } from "@/queries/credits";
import { Radius, Space } from "@/constants/theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Puce de crédits, en haut du chat.
 *
 * Elle affiche **le total** — quota mensuel restant + crédits achetés — parce
 * que c'est la seule question que l'utilisateur se pose : « est-ce que je peux
 * encore poser une question ? » Le détail des deux poches est sur l'écran
 * crédits.
 *
 * L'animation utilise `Animated` de React Native, pas Reanimated. Pour une
 * impulsion de 110 ms sur une seule valeur, la différence est invisible — et
 * Reanimated 4 impose `react-native-worklets` plus un greffon Babel, donc une
 * source d'échec de build pour un gain nul.
 */
export function CreditBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const { data } = useCredits();

  const total = data?.total ?? 0;
  const low = total <= (data?.lowThreshold ?? 5);
  const empty = total <= 0;

  const scale = useRef(new Animated.Value(1)).current;
  const previous = useRef<number | null>(null);

  useEffect(() => {
    if (!data) return;
    const before = previous.current;
    previous.current = total;

    // Premier rendu : pas d'animation. Sinon la puce sautille à chaque
    // ouverture de l'app sans que rien n'ait changé — du bruit, pas une
    // information.
    if (before === null || before === total) return;

    Animated.sequence([
      Animated.timing(scale, {
        toValue: 1.14,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 5,
        tension: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [total, data, scale]);

  if (!data) return null;

  const tone = empty
    ? { bg: c.destructive, fg: "#FFFFFF", icon: "alert-circle" as const }
    : low
      ? { bg: c.accent, fg: c.accentForeground, icon: "flash" as const }
      : { bg: c.secondary, fg: c.secondaryForeground, icon: "flash-outline" as const };

  const label = t("quota.badgeMonthly", { count: total });

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.selectionAsync();
        router.push(empty ? "/paywall" : "/credits");
      }}
      style={[
        styles.badge,
        {
          backgroundColor: tone.bg,
          paddingHorizontal: compact ? Space.sm : Space.md,
          transform: [{ scale }],
        },
      ]}
    >
      <View style={styles.row}>
        <Ionicons name={tone.icon} size={14} color={tone.fg} />
        <Text style={[styles.text, { color: tone.fg }]}>
          {compact ? String(total) : label}
        </Text>
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    height: 30,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 5 },
  text: { fontSize: 13, fontWeight: "700" },
});
