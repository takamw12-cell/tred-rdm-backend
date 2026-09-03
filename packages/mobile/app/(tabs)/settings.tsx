import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as Sharing from "expo-sharing";
import { File, Paths } from "expo-file-system";
import Constants from "expo-constants";

import { Screen } from "@/components/ui/Screen";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/use-colors";
import { useTheme, THEME_MODES, type ThemeMode } from "@/lib/theme";
import { authClient } from "@/lib/auth-client";
import { LANGUAGES, setLanguage, type Language } from "@/i18n";
import { usePlan, useBillingPortal } from "@/queries/plan";
import { useCredits } from "@/queries/credits";
import {
  useDataExport,
  useDeleteAccount,
  useSetServerLocale,
} from "@/queries/account";
import { FontSize, Radius, Space } from "@/constants/theme";

/**
 * Réglages.
 *
 * ── Pourquoi cet écran décide de la mise en ligne ─────────────────────────
 *
 * Google Play exige un chemin de suppression de compte **dans l'application**,
 * pas seulement sur le site (Developer Program Policy, « User Data »). Sans
 * cet écran, la fiche est refusée avant même d'être examinée. Les autres
 * manques du dossier — liens légaux introuvables, onglet « Explore » resté du
 * gabarit Expo — se règlent au même endroit : d'où une seule pierre pour
 * trois coups.
 *
 * ── L'ordre des sections n'est pas décoratif ──────────────────────────────
 *
 * Ce qu'on touche tous les jours en haut (langue, thème), ce qu'on touche une
 * fois par semestre au milieu (abonnement), ce qu'on ne touche qu'une fois en
 * bas (export, effacement). L'irréversible est loin du pouce.
 *
 * ── L'effacement demande un mot, pas un bouton ────────────────────────────
 *
 * Le serveur impose `confirm: "LÖSCHEN"` — un littéral, pas une chaîne libre.
 * Ce n'est pas de la paperasse : après cet appel, il n'y a rien à récupérer,
 * ni côté serveur ni côté Stripe. Un bouton seul finit toujours par être
 * pressé par accident, et il n'y a pas de deuxième chance.
 *
 * Le mot reste **LÖSCHEN dans toutes les langues**. Il est vérifié caractère
 * pour caractère côté serveur ; le traduire ferait échouer la suppression pour
 * tout le monde sauf les germanophones.
 */

/** Ce que le serveur attend, mot pour mot. Ne pas traduire. */
const DELETE_KEYWORD = "LÖSCHEN";

const LANGUAGE_LABEL: Record<Language, string> = {
  de: "Deutsch",
  en: "English",
  fr: "Français",
};

/** Les quatre pages légales servies par le web, dans l'ordre du pied de page. */
const LEGAL_DOCS = ["impressum", "datenschutz", "agb", "widerruf"] as const;

const LEGAL_LABEL: Record<(typeof LEGAL_DOCS)[number], string> = {
  impressum: "legal.impressum",
  datenschutz: "legal.privacy",
  agb: "legal.terms",
  widerruf: "legal.withdrawal",
};

export default function Settings() {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { mode, setMode } = useTheme();

  const { data: session } = authClient.useSession();
  const plan = usePlan();
  const credits = useCredits();
  const portal = useBillingPortal();
  const setServerLocale = useSetServerLocale();
  const dataExport = useDataExport();
  const deleteAccount = useDeleteAccount();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const version = Constants.expoConfig?.version ?? "1.0.0";
  const current = (i18n.language.slice(0, 2) as Language) ?? "de";

  /**
   * Change la langue ici ET sur le serveur.
   *
   * L'échec du serveur n'annule pas le changement local : l'étudiant a demandé
   * du français, il l'obtient. Seules les notifications resteront dans
   * l'ancienne langue jusqu'au prochain essai — un défaut visible, pas une
   * panne.
   */
  async function chooseLanguage(language: Language) {
    if (language === current) return;
    await setLanguage(language);
    setServerLocale.mutate({ locale: language });
  }

  /**
   * DSGVO Art. 15 et 20 — l'export, puis la feuille de partage du système.
   *
   * Le JSON passe par un fichier du cache plutôt que par le presse-papiers ou
   * un message : un export contient des mois de conversations, et aucune
   * application de messagerie n'accepte ça en texte. Le cache est effacé par
   * le système, donc le fichier ne survit pas à l'usage qu'on en fait.
   */
  async function exportData() {
    try {
      const result = await dataExport.mutateAsync({});
      const file = new File(Paths.cache, result.filename);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(result.data, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/json",
          dialogTitle: t("account.dataExport"),
          UTI: "public.json",
        });
      } else {
        Alert.alert(t("account.dataExport"), t("account.dataExportDone"));
      }
    } catch {
      Alert.alert(t("common.error"), t("errors.server"));
    }
  }

  async function confirmDelete() {
    if (typed.trim() !== DELETE_KEYWORD) {
      Alert.alert(t("account.deleteAccount"), t("account.deleteAccountWrongKeyword"));
      return;
    }
    try {
      const report = await deleteAccount.mutateAsync({ confirm: DELETE_KEYWORD });
      setDeleteOpen(false);
      // Le cache d'abord : sans ça, chaque écran encore monté rejoue sa
      // requête sur un compte qui n'existe plus et affiche une erreur réseau
      // par-dessus le message de confirmation.
      queryClient.clear();
      await authClient.signOut().catch(() => {});
      Alert.alert(t("account.deleteAccount"), report.hinweis);
    } catch {
      Alert.alert(t("common.error"), t("errors.server"));
    }
  }

  function confirmSignOut() {
    Alert.alert(t("auth.signOut"), t("auth.signOutConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("auth.signOut"),
        style: "destructive",
        onPress: () => {
          queryClient.clear();
          void authClient.signOut().catch(() => {});
        },
      },
    ]);
  }

  async function openPortal() {
    try {
      const { url } = await portal.mutateAsync({});
      const WebBrowser = await import("expo-web-browser");
      await WebBrowser.openBrowserAsync(url);
      void plan.refetch();
    } catch {
      Alert.alert(t("common.error"), t("errors.server"));
    }
  }

  const planName = plan.data?.plan ?? "free";
  const isPaid = planName !== "free";

  return (
    <Screen title={t("account.title")} flush>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Qui ──────────────────────────────────────────────────────── */}
        <Card>
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: c.accentSoft }]}>
              <Text style={[styles.avatarText, { color: c.accentForeground }]}>
                {(session?.user?.name ?? session?.user?.email ?? "?")
                  .slice(0, 1)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={styles.identityText}>
              <Text numberOfLines={1} style={[styles.name, { color: c.foreground }]}>
                {session?.user?.name || t("account.title")}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.email, { color: c.mutedForeground }]}
              >
                {session?.user?.email ?? ""}
              </Text>
            </View>
          </View>
        </Card>

        {/* ── Abonnement et crédits ────────────────────────────────────── */}
        <Section title={t("plan.title")}>
          <Card>
            <View style={styles.planRow}>
              <View style={styles.planText}>
                <Text style={[styles.planName, { color: c.foreground }]}>
                  {isPaid ? t("plan.premium") : t("plan.free")}
                </Text>
                <Text style={[styles.planMeta, { color: c.mutedForeground }]}>
                  {credits.isLoading
                    ? t("common.loading")
                    : t("credits.balance", { count: credits.data?.total ?? 0 })}
                </Text>
              </View>
              <Ionicons name="flash-outline" size={20} color={c.signature} />
            </View>

            <View style={styles.planActions}>
              <Button
                label={isPaid ? t("plan.manage") : t("plan.subscribe")}
                variant={isPaid ? "secondary" : "primary"}
                size="sm"
                loading={portal.isPending}
                onPress={() => (isPaid ? void openPortal() : router.push("/paywall"))}
              />
              <Button
                label={t("credits.buy")}
                variant="secondary"
                size="sm"
                onPress={() => router.push("/credits")}
              />
            </View>
          </Card>
        </Section>

        {/* ── Langue ───────────────────────────────────────────────────── */}
        <Section title={t("account.language")}>
          <Card padded={false}>
            {LANGUAGES.map((language, i) => (
              <ChoiceRow
                key={language}
                label={LANGUAGE_LABEL[language]}
                selected={current === language}
                first={i === 0}
                onPress={() => void chooseLanguage(language)}
              />
            ))}
          </Card>
        </Section>

        {/* ── Thème ────────────────────────────────────────────────────── */}
        <Section title={t("account.theme")}>
          <Card padded={false}>
            {THEME_MODES.map((value, i) => (
              <ChoiceRow
                key={value}
                label={t(`account.theme${value[0]!.toUpperCase()}${value.slice(1)}`)}
                selected={mode === value}
                first={i === 0}
                onPress={() => setMode(value as ThemeMode)}
              />
            ))}
          </Card>
        </Section>

        {/* ── Rechtliches ──────────────────────────────────────────────── */}
        <Section title={t("legal.title")}>
          <Card padded={false}>
            {LEGAL_DOCS.map((doc, i) => (
              <LinkRow
                key={doc}
                label={t(LEGAL_LABEL[doc])}
                first={i === 0}
                onPress={() => router.push(`/legal/${doc}`)}
              />
            ))}
          </Card>
        </Section>

        {/* ── Données ──────────────────────────────────────────────────── */}
        <Section title={t("account.dataTitle")}>
          <Card>
            <Text style={[styles.blockTitle, { color: c.foreground }]}>
              {t("account.dataExport")}
            </Text>
            <Text style={[styles.blockBody, { color: c.mutedForeground }]}>
              {t("account.dataExportBody")}
            </Text>
            <View style={styles.blockAction}>
              <Button
                label={t("account.dataExport")}
                variant="secondary"
                size="sm"
                loading={dataExport.isPending}
                onPress={() => void exportData()}
              />
            </View>
          </Card>

          <Card>
            <Text style={[styles.blockTitle, { color: c.destructive }]}>
              {t("account.deleteAccount")}
            </Text>
            <Text style={[styles.blockBody, { color: c.mutedForeground }]}>
              {t("account.deleteAccountBody")}
            </Text>
            <View style={styles.blockAction}>
              <Button
                label={t("account.deleteAccount")}
                variant="destructive"
                size="sm"
                haptic
                onPress={() => {
                  setTyped("");
                  setDeleteOpen(true);
                }}
              />
            </View>
          </Card>
        </Section>

        <View style={styles.footer}>
          <Button
            label={t("auth.signOut")}
            variant="ghost"
            onPress={confirmSignOut}
          />
          <Text style={[styles.version, { color: c.mutedForeground }]}>
            {t("account.version", { version })}
          </Text>
        </View>
      </ScrollView>

      {/* ── La confirmation d'effacement ────────────────────────────────── */}
      <Modal
        visible={deleteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
            <Text style={[styles.sheetTitle, { color: c.foreground }]}>
              {t("account.deleteAccountConfirmTitle")}
            </Text>
            <Text style={[styles.sheetBody, { color: c.mutedForeground }]}>
              {t("account.deleteAccountConfirmBody")}
            </Text>

            <TextInput
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={DELETE_KEYWORD}
              placeholderTextColor={c.mutedForeground}
              accessibilityLabel={t("account.deleteAccountConfirmTitle")}
              style={[
                styles.input,
                { backgroundColor: c.input, borderColor: c.border, color: c.foreground },
              ]}
            />

            <View style={styles.sheetActions}>
              <Button
                label={t("common.cancel")}
                variant="ghost"
                onPress={() => setDeleteOpen(false)}
              />
              <Button
                label={t("common.delete")}
                variant="destructive"
                haptic
                // Le bouton reste inerte tant que le mot n'est pas exact. Le
                // serveur refuserait de toute façon ; le dire ici évite un
                // aller-retour et un message d'erreur incompréhensible.
                disabled={typed.trim() !== DELETE_KEYWORD}
                loading={deleteAccount.isPending}
                onPress={() => void confirmDelete()}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

/* ── Petites briques locales ───────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: c.mutedForeground }]}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

/** Une ligne de choix : la coche marque l'état, pas la couleur du texte. */
function ChoiceRow({
  label,
  selected,
  first,
  onPress,
}: {
  label: string;
  selected: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.rowLabel, { color: c.foreground }]}>{label}</Text>
      {selected ? <Ionicons name="checkmark" size={18} color={c.primary} /> : null}
    </Pressable>
  );
}

function LinkRow({
  label,
  first,
  onPress,
}: {
  label: string;
  first: boolean;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.rowLabel, { color: c.foreground }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={c.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.xxl,
    gap: Space.lg,
  },

  identity: { flexDirection: "row", alignItems: "center", gap: Space.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: FontSize.lg, fontWeight: "700" },
  identityText: { flex: 1, gap: 2 },
  name: { fontSize: FontSize.md, fontWeight: "600" },
  email: { fontSize: FontSize.sm },

  section: { gap: Space.sm },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sectionBody: { gap: Space.sm },

  planRow: { flexDirection: "row", alignItems: "center", gap: Space.md },
  planText: { flex: 1, gap: 2 },
  planName: { fontSize: FontSize.md, fontWeight: "600" },
  planMeta: { fontSize: FontSize.sm },
  planActions: { flexDirection: "row", gap: Space.sm, marginTop: Space.md },

  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    minHeight: 48,
  },
  rowLabel: { fontSize: FontSize.md },
  pressed: { opacity: 0.6 },

  blockTitle: { fontSize: FontSize.md, fontWeight: "600" },
  blockBody: { fontSize: FontSize.sm, lineHeight: 19, marginTop: Space.xs },
  blockAction: { marginTop: Space.md, alignItems: "flex-start" },

  footer: { alignItems: "center", gap: Space.sm, paddingTop: Space.sm },
  version: { fontSize: FontSize.xs },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: Space.lg,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    gap: Space.sm,
  },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: "700" },
  sheetBody: { fontSize: FontSize.sm, lineHeight: 19 },
  input: {
    height: 46,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    fontSize: FontSize.md,
    letterSpacing: 1,
    marginTop: Space.xs,
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Space.sm,
    marginTop: Space.sm,
  },
});
