import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { fetch as expoFetch } from "expo/fetch";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { RichText } from "@/components/chat/RichText";
import { CreditBadge } from "@/components/CreditBadge";
import { EmptyState } from "@/components/ui/Screen";
import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/use-colors";
import { authClient, API_URL } from "@/lib/auth-client";
import { useConversation, useSaveConversation } from "@/queries/chats";
import { useInvalidateCredits } from "@/queries/credits";
import { Radius, Space } from "@/constants/theme";

function messageText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/** Le backend répond 402 quand le quota OU le plafond de tokens est atteint. */
function isQuotaError(error: unknown): boolean {
  const s = String((error as { message?: string })?.message ?? error ?? "");
  return (
    s.includes("QUOTA_EXCEEDED") ||
    s.includes("INSUFFICIENT_CREDITS") ||
    s.includes("TOKEN_CAP") ||
    s.includes("402")
  );
}

export default function ChatScreen() {
  const { id, documentId, semesterId } = useLocalSearchParams<{
    id: string;
    documentId?: string;
    semesterId?: string;
  }>();
  const { t, i18n } = useTranslation();
  const c = useColors();
  const router = useRouter();

  const isNew = !id || id === "new";
  const convId = useRef(isNew ? `c_${Math.random().toString(36).slice(2, 12)}` : id);

  const [input, setInput] = useState("");
  const listRef = useRef<FlatList<UIMessage>>(null);

  const existing = useConversation(isNew ? undefined : id);
  const save = useSaveConversation();
  const invalidateCredits = useInvalidateCredits();

  // Les valeurs lues dans `body` doivent être fraîches à CHAQUE envoi. Une
  // dépendance directe recréerait le transport et couperait le flux en cours ;
  // des refs donnent la valeur du moment sans reconstruire quoi que ce soit.
  const ctx = useRef({ documentId, semesterId, locale: i18n.language });
  ctx.current = { documentId, semesterId, locale: i18n.language };

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `${API_URL}/api/agent/messages`,
        // `expo/fetch` et non le fetch global : celui de React Native ne sait
        // pas lire un corps en flux (`response.body` est undefined), donc la
        // réponse n'arriverait qu'une fois complète — ou pas du tout.
        fetch: expoFetch as unknown as typeof globalThis.fetch,
        headers: () => {
          // Toujours un Record<string, string>, jamais un objet à propriété
          // optionnelle : le transport n'accepte pas `{ Cookie?: undefined }`.
          const headers: Record<string, string> = {};
          const cookie = authClient.getCookie();
          if (cookie) headers.Cookie = cookie;
          return headers;
        },
        body: () => ({
          documentId: ctx.current.documentId ?? null,
          semesterId: ctx.current.documentId ? null : (ctx.current.semesterId ?? null),
          locale: ctx.current.locale,
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, setMessages, error, stop, clearError } =
    useChat({ transport });

  const busy = status === "submitted" || status === "streaming";
  const quotaHit = !!error && isQuotaError(error);

  // Reprise d'une conversation existante.
  useEffect(() => {
    if (isNew || !existing.data) return;
    const restored = (existing.data.messages ?? []).map(
      (m: { role: string; content: string }, i: number) => ({
        id: `r_${i}`,
        role: m.role as "user" | "assistant",
        parts: [{ type: "text" as const, text: m.content }],
      }),
    );
    setMessages(restored as unknown as UIMessage[]);
  }, [existing.data, isNew, setMessages]);

  // Sauvegarde après chaque réponse complète, et rafraîchissement du solde.
  useEffect(() => {
    if (status !== "ready" || messages.length === 0) return;
    invalidateCredits();

    const payload = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: messageText(m) }))
      .filter((m) => m.content.trim().length > 0);

    if (payload.length === 0) return;

    save.mutate({
      id: convId.current,
      title: payload[0].content.slice(0, 80),
      documentId: documentId ?? null,
      semesterId: semesterId ?? null,
      lang: i18n.language.slice(0, 5),
      messages: payload,
    });
    // `save` est volontairement hors dépendances : l'inclure relancerait
    // l'effet à chaque rendu de la mutation, donc en boucle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(
      () => listRef.current?.scrollToEnd({ animated: true }),
      60,
    );
    return () => clearTimeout(timer);
  }, [messages, status]);

  function send() {
    const text = input.trim();
    if (!text || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearError();
    setInput("");
    void sendMessage({ text });
  }

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.root, { backgroundColor: c.background }]}
    >
      {/* ── En-tête ──────────────────────────────────────────────────── */}
      <View style={[styles.head, { borderBottomColor: c.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={24} color={c.foreground} />
        </Pressable>
        <Text numberOfLines={1} style={[styles.headTitle, { color: c.foreground }]}>
          {t("chat.title")}
        </Text>
        <CreditBadge compact />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState title={t("chat.emptyTitle")} body={t("chat.emptyBody")} />
          }
          renderItem={({ item, index }) => {
            const text = messageText(item);
            if (!text.trim() && item.role !== "assistant") return null;
            const last = index === messages.length - 1;
            const streaming = last && status === "streaming" && item.role === "assistant";

            if (item.role === "user") {
              return (
                <View style={[styles.userBubble, { backgroundColor: c.primary }]}>
                  <Text selectable style={{ color: c.primaryForeground, fontSize: 15, lineHeight: 22 }}>
                    {text}
                  </Text>
                </View>
              );
            }

            return (
              <View style={[styles.aiBubble, { backgroundColor: c.card, borderColor: c.border }]}>
                {text.trim() ? (
                  <RichText text={text} streaming={streaming} />
                ) : (
                  <View style={styles.thinking}>
                    <ActivityIndicator size="small" color={c.accent} />
                    <Text style={{ color: c.mutedForeground, fontSize: 13 }}>
                      {t("chat.thinking")}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />

        {/* ── Quota épuisé ───────────────────────────────────────────── */}
        {quotaHit ? (
          <View style={[styles.quota, { backgroundColor: c.accentSoft, borderColor: c.accent }]}>
            <Text style={[styles.quotaTitle, { color: c.foreground }]}>
              {t("quota.exhaustedTitle")}
            </Text>
            <Text style={{ color: c.mutedForeground, fontSize: 13, lineHeight: 19 }}>
              {t("quota.exhaustedFree", {
                date: new Date(
                  new Date().getFullYear(),
                  new Date().getMonth() + 1,
                  1,
                ).toLocaleDateString(i18n.language, { day: "2-digit", month: "long" }),
              })}
            </Text>
            <View style={styles.quotaActions}>
              <Button
                label={t("quota.exhaustedCta")}
                size="sm"
                onPress={() => router.push("/paywall")}
                haptic
              />
              <Button
                label={t("quota.buyCreditsCta")}
                size="sm"
                variant="secondary"
                onPress={() => router.push("/credits")}
              />
            </View>
          </View>
        ) : error ? (
          <Pressable
            onPress={() => clearError()}
            style={[styles.errorBar, { backgroundColor: c.destructive }]}
          >
            <Text style={styles.errorText}>{t("errors.server")}</Text>
          </Pressable>
        ) : null}

        {/* ── Barre de saisie ────────────────────────────────────────── */}
        <View style={[styles.composer, { borderTopColor: c.border, backgroundColor: c.background }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t("chat.placeholder")}
            placeholderTextColor={c.mutedForeground}
            multiline
            editable={!quotaHit}
            style={[
              styles.input,
              { backgroundColor: c.input, borderColor: c.border, color: c.foreground },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={busy ? t("chat.stop") : t("chat.send")}
            onPress={busy ? () => void stop() : send}
            disabled={!busy && (!input.trim() || quotaHit)}
            style={({ pressed }) => [
              styles.sendBtn,
              {
                backgroundColor: busy ? c.secondary : c.primary,
                opacity: !busy && (!input.trim() || quotaHit) ? 0.4 : pressed ? 0.8 : 1,
              },
            ]}
          >
            <Ionicons
              name={busy ? "stop" : "arrow-up"}
              size={20}
              color={busy ? c.secondaryForeground : c.primaryForeground}
            />
          </Pressable>
        </View>

        <Text style={[styles.disclaimer, { color: c.mutedForeground }]}>
          {t("chat.disclaimer")}
        </Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headTitle: { flex: 1, fontSize: 16, fontWeight: "700" },
  list: { padding: Space.lg, gap: Space.md, flexGrow: 1 },
  userBubble: {
    alignSelf: "flex-end",
    maxWidth: "88%",
    borderRadius: Radius.lg,
    borderBottomRightRadius: 6,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm + 2,
  },
  aiBubble: {
    alignSelf: "stretch",
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
  },
  thinking: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  quota: {
    margin: Space.lg,
    marginBottom: 0,
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    gap: Space.xs,
  },
  quotaTitle: { fontSize: 15, fontWeight: "700" },
  quotaActions: { flexDirection: "row", gap: Space.sm, marginTop: Space.sm },
  errorBar: {
    marginHorizontal: Space.lg,
    padding: Space.sm,
    borderRadius: Radius.sm,
    alignItems: "center",
  },
  errorText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingTop: Space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  disclaimer: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    paddingHorizontal: Space.xl,
    paddingTop: Space.xs,
    paddingBottom: Space.sm,
  },
});
