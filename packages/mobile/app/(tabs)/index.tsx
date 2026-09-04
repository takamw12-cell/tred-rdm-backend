import { useCallback } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen, EmptyState } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { CreditBadge } from "@/components/CreditBadge";
import { TredLogoIcon } from "@/components/TredLogoIcon";
import { useColors } from "@/hooks/use-colors";
import { useConversations } from "@/queries/chats";
import { useDueGaps } from "@/queries/memory";
import { useTourTarget } from "@/components/OnboardingGuide";
import { Button } from "@/components/ui/Button";
import { Radius, Space } from "@/constants/theme";

export default function Learn() {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const chats = useConversations();
  const due = useDueGaps();
  const dueCount = due.data?.length ?? 0;
  const cibleChat = useTourTarget("chat");

  const formatDate = useCallback(
    (value: Date | string | number | null | undefined) => {
      if (!value) return "";
      const d = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString(i18n.language, {
        day: "2-digit",
        month: "short",
      });
    },
    [i18n.language],
  );

  return (
    <Screen flush>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          <TredLogoIcon size={26} color={c.foreground} />
          <Text style={[styles.brandText, { color: c.foreground }]}>TRED</Text>
        </View>
        <CreditBadge />
      </View>

      {/* La révision, quand il y en a. Elle n'apparaît pas les autres jours :
          une bannière permanente et souvent vide apprend à l'œil à sauter
          cette zone, y compris les jours où elle compte. */}
      {dueCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/review")}
          style={({ pressed }) => [
            styles.review,
            { backgroundColor: c.accentSoft, borderColor: c.signature, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="flag" size={18} color={c.signature} />
          <View style={styles.reviewText}>
            <Text style={[styles.reviewTitle, { color: c.foreground }]}>
              {t("review.title")}
            </Text>
            <Text style={[styles.reviewBody, { color: c.mutedForeground }]}>
              {t("review.left", { count: dueCount })}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={c.mutedForeground} />
        </Pressable>
      ) : null}

      {chats.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : chats.isError ? (
        <EmptyState title={t("common.error")} body={t("errors.server")} />
      ) : (
        <FlatList
          data={chats.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={chats.isRefetching}
              onRefresh={() => void chats.refetch()}
              tintColor={c.mutedForeground}
            />
          }
          ListHeaderComponent={
            (chats.data?.length ?? 0) > 0 ? (
              <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>
                {t("chat.conversations")}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
              title={t("chat.emptyTitle")}
              body={t("chat.emptyBody")}
              action={
                <Button
                  label={t("chat.newChat")}
                  onPress={() => router.push("/chat/new")}
                  haptic
                />
              }
            />
          }
          renderItem={({ item }) => (
            <Card
              style={styles.row}
              padded={false}
              onPress={() => router.push(`/chat/${item.id}`)}
            >
              <View style={styles.rowInner}>
                <View
                  style={[styles.dot, { backgroundColor: c.accentSoft }]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={16}
                    color={c.accentForeground}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.rowTitle, { color: c.foreground }]}
                  >
                    {item.title || t("chat.newChat")}
                  </Text>
                  {item.documentTitle ? (
                    <Text
                      numberOfLines={1}
                      style={[styles.rowMeta, { color: c.mutedForeground }]}
                    >
                      {t("chat.contextDocument", { title: item.documentTitle })}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.rowDate, { color: c.mutedForeground }]}>
                  {formatDate(item.updatedAt)}
                </Text>
              </View>
            </Card>
          )}
        />
      )}

      <Pressable
        ref={cibleChat.ref}
        onLayout={cibleChat.onLayout}
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel={t("chat.newChat")}
        onPress={() => router.push("/chat/new")}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: c.primary, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <Ionicons name="add" size={26} color={c.primaryForeground} />
      </Pressable>

      <Text style={[styles.disclaimer, { color: c.mutedForeground }]}>
        {t("chat.disclaimer")}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  brandText: { fontSize: 18, fontWeight: "800", letterSpacing: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  review: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    marginHorizontal: Space.lg,
    marginBottom: Space.md,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  reviewText: { flex: 1, gap: 2 },
  reviewTitle: { fontSize: 15, fontWeight: "600" },
  reviewBody: { fontSize: 12 },
  list: { paddingHorizontal: Space.lg, paddingBottom: Space.xl, gap: Space.sm, flexGrow: 1 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: Space.xs,
  },
  row: {},
  rowInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    padding: Space.md,
  },
  dot: {
    width: 34,
    height: 34,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  rowMeta: { fontSize: 12 },
  rowDate: { fontSize: 12 },
  fab: {
    position: "absolute",
    right: Space.lg,
    bottom: 64,
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    paddingHorizontal: Space.xl,
    paddingBottom: Space.sm,
  },
});
