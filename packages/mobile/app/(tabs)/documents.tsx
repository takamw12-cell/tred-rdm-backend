import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Screen, EmptyState } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/use-colors";
import { useDocuments, useRemoveDocument } from "@/queries/documents";
import { usePlan } from "@/queries/plan";
import { pickAndUploadDocument, type UploadError } from "@/lib/upload";
import { orpc } from "@/lib/api";
import { useTourTarget } from "@/components/OnboardingGuide";
import { Radius, Space } from "@/constants/theme";

const KIND_ICON = {
  script: "book-outline",
  exercise: "create-outline",
  exam: "school-outline",
} as const;

const KIND_LABEL = {
  script: "documents.kindScript",
  exercise: "documents.kindExercise",
  exam: "documents.kindExam",
} as const;

export default function Documents() {
  const { t } = useTranslation();
  const cibleUpload = useTourTarget("upload");
  const c = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();

  const docs = useDocuments();
  const remove = useRemoveDocument();
  const plan = usePlan();

  const [stage, setStage] = useState<null | "picking" | "uploading" | "extracting">(null);

  async function upload() {
    setStage("picking");
    const res = await pickAndUploadDocument({ onProgress: setStage });
    setStage(null);

    if (res.ok) {
      void queryClient.invalidateQueries({ queryKey: orpc.documents.list.queryKey() });
      void plan.refetch();
      return;
    }
    if (res.error === "cancelled") return;

    // Le quota est le seul cas qui mène ailleurs : montrer un message sans
    // porte de sortie transforme une limite en cul-de-sac.
    if (res.error === "quota") {
      Alert.alert(
        t("quota.exhaustedTitle"),
        t("documents.limitReached", { limit: plan.data?.limits?.documents ?? 10 }),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("quota.exhaustedCta"), onPress: () => router.push("/paywall") },
        ],
      );
      return;
    }

    const MESSAGE: Record<UploadError, string> = {
      cancelled: "",
      unsupported: t("documents.unsupported"),
      too_large: t("documents.tooLarge"),
      no_text: t("documents.uploadNoText"),
      quota: "",
      network: t("errors.network"),
      unknown: t("documents.uploadFailed"),
    };
    Alert.alert(t("common.error"), MESSAGE[res.error ?? "unknown"]);
    if (res.detail) console.warn("[upload]", res.detail);
  }

  function confirmDelete(id: string) {
    Alert.alert(t("common.delete"), t("documents.deleteConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => remove.mutate({ id }),
      },
    ]);
  }

  const busy = stage !== null;
  const busyLabel =
    stage === "extracting" ? t("documents.extracting") : t("documents.uploading");

  return (
    <Screen title={t("documents.title")} flush>
      {docs.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.accent} />
        </View>
      ) : docs.isError ? (
        <EmptyState title={t("common.error")} body={t("errors.server")} />
      ) : (
        <FlatList
          data={docs.data ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={docs.isRefetching}
              onRefresh={() => void docs.refetch()}
              tintColor={c.mutedForeground}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title={t("documents.emptyTitle")}
              body={t("documents.emptyBody")}
              action={
                <Button
                  label={t("documents.uploadPick")}
                  onPress={() => void upload()}
                  loading={busy}
                  haptic
                />
              }
            />
          }
          renderItem={({ item }) => {
            const kind = (item.kind ?? "script") as keyof typeof KIND_ICON;
            return (
              <Card
                padded={false}
                onPress={() =>
                  router.push({
                    pathname: "/chat/new",
                    params: { documentId: item.id },
                  })
                }
              >
                <View style={styles.row}>
                  <View style={[styles.icon, { backgroundColor: c.secondary }]}>
                    <Ionicons
                      name={KIND_ICON[kind] ?? "document-outline"}
                      size={17}
                      color={c.foreground}
                    />
                  </View>
                  <View style={styles.text}>
                    <Text
                      numberOfLines={2}
                      style={[styles.title, { color: c.foreground }]}
                    >
                      {item.title}
                    </Text>
                    <Text style={[styles.meta, { color: c.mutedForeground }]}>
                      {t(KIND_LABEL[kind] ?? "documents.kindOther")}
                      {item.pageCount
                        ? ` · ${t("documents.pages", { count: item.pageCount })}`
                        : ""}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("common.delete")}
                    hitSlop={10}
                    onPress={() => confirmDelete(item.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color={c.mutedForeground} />
                  </Pressable>
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* Le bouton reste visible pendant l'envoi et affiche l'étape en cours.
          Une extraction de PDF prend parfois dix secondes ; sans ce retour,
          l'utilisateur relance et envoie le fichier deux fois. */}
      <Pressable
        ref={cibleUpload.ref}
        onLayout={cibleUpload.onLayout}
        collapsable={false}
        accessibilityRole="button"
        accessibilityLabel={t("documents.upload")}
        accessibilityState={{ busy }}
        disabled={busy}
        onPress={() => void upload()}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: c.primary,
            opacity: pressed ? 0.85 : 1,
            paddingHorizontal: busy ? Space.lg : 0,
            width: busy ? undefined : 56,
          },
        ]}
      >
        {busy ? (
          <View style={styles.fabBusy}>
            <ActivityIndicator size="small" color={c.primaryForeground} />
            <Text style={{ color: c.primaryForeground, fontSize: 13, fontWeight: "600" }}>
              {busyLabel}
            </Text>
          </View>
        ) : (
          <Ionicons name="add" size={26} color={c.primaryForeground} />
        )}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: {
    paddingHorizontal: Space.lg,
    paddingBottom: 96,
    gap: Space.sm,
    flexGrow: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    padding: Space.md,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "600", lineHeight: 20 },
  meta: { fontSize: 12 },
  fab: {
    position: "absolute",
    right: Space.lg,
    bottom: Space.lg,
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
  fabBusy: { flexDirection: "row", alignItems: "center", gap: Space.sm },
});
