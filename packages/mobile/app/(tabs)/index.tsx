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
import { Button } from "@/components/ui/Button";
import { Radius, Space } from "@/constants/theme";

export default function Learn() {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const chats = useConversations();

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
