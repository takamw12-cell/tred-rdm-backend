import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Screen";
import { useColors } from "@/hooks/use-colors";
import { useDueGaps, useReviewGap } from "@/queries/memory";
import { FontSize, Radius, Space } from "@/constants/theme";

/**
 * La révision, sur le téléphone.
 *
 * ── Pourquoi cet écran doit exister ───────────────────────────────────────
 *
 * La relance du soir envoie une notification aux appareils enregistrés. Ces
 * jetons ne viennent que de l'application mobile. Sans cet écran, la
 * notification aurait ouvert une app qui ne sait pas montrer ce qu'elle
 * annonce — le pire des deux mondes : on dérange, et on ne sert à rien.
 *
 * ── Une lacune à la fois ──────────────────────────────────────────────────
 *
 * Comme sur le web. Cinq d'un coup, c'est une corvée ; une seule, c'est une
 * question — et on répond aux questions. Le compteur « encore n » dit qu'il y
 * a une fin, ce qui est exactement ce qu'il faut savoir pour commencer.
 *
 * ── Deux boutons, pas une échelle de 1 à 5 ────────────────────────────────
 *
 * Les systèmes de répétition espacée demandent souvent de noter sa propre
 * confiance. À 19 h dans un bus, personne ne calibre honnêtement une note sur
 * cinq. « Je sais » double l'intervalle, « pas encore » ramène à demain : deux
 * boutons suffisent à faire tourner la boucle.
 */
export default function Review() {
  const { t } = useTranslation();
  const c = useColors();
  const router = useRouter();

  const due = useDueGaps();
  const review = useReviewGap();

  const gaps = due.data ?? [];
  const current = gaps[0];

  function repondre(ok: boolean) {
    if (!current || review.isPending) return;
    review.mutate({ id: current.id, ok });
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <View style={styles.bar}>
        <View style={styles.title}>
          <Ionicons name="flag" size={18} color={c.signature} />
          <Text accessibilityRole="header" style={[styles.titleText, { color: c.foreground }]}>
            {t("review.title")}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="close" size={24} color={c.mutedForeground} />
        </Pressable>
      </View>

      {due.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : !current ? (
        // Rien à réviser est le résultat NORMAL la plupart des jours. On le dit
        // comme une bonne nouvelle, pas comme un écran vide à combler.
        <EmptyState
          title={t("review.doneTitle")}
          body={t("review.doneBody")}
          label={t("common.close")}
          onPress={() => router.back()}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={[styles.left, { color: c.mutedForeground }]}>
            {t("review.left", { count: gaps.length })}
          </Text>

          <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.topic, { color: c.mutedForeground }]}>
              {current.topic}
            </Text>
            <Text style={[styles.label, { color: c.foreground }]}>{current.label}</Text>
            {current.detail ? (
              <Text style={[styles.detail, { color: c.mutedForeground }]}>
                {current.detail}
              </Text>
            ) : null}
            <Text style={[styles.seen, { color: c.mutedForeground }]}>
              {t("review.timesSeen", { count: current.timesSeen })}
            </Text>
          </View>

          <View style={styles.actions}>
            <Button
              label={t("review.notYet")}
              variant="secondary"
              fullWidth
              disabled={review.isPending}
              onPress={() => repondre(false)}
            />
            <Button
              label={t("review.known")}
              fullWidth
              haptic
              loading={review.isPending}
              onPress={() => repondre(true)}
            />
          </View>

          <Text style={[styles.hint, { color: c.mutedForeground }]}>
            {t("review.hint")}
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  title: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  titleText: { fontSize: FontSize.xl, fontWeight: "700", letterSpacing: -0.4 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: Space.lg, paddingBottom: Space.xxl, gap: Space.md },
  left: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    gap: Space.sm,
  },
  topic: {
    fontSize: FontSize.xs,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    fontWeight: "700",
  },
  label: { fontSize: FontSize.lg, fontWeight: "600", lineHeight: 24 },
  detail: { fontSize: FontSize.sm, lineHeight: 20 },
  seen: { fontSize: FontSize.xs, marginTop: Space.xs },
  actions: { gap: Space.sm, marginTop: Space.sm },
  hint: { fontSize: FontSize.xs, lineHeight: 17, textAlign: "center", marginTop: Space.sm },
});
