import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/use-colors";
import { orpc } from "@/lib/api";
import { FontSize, Radius, Space } from "@/constants/theme";

/**
 * Signaler une réponse du tuteur.
 *
 * ── Pourquoi ce bouton existe ─────────────────────────────────────────────
 *
 * Google Play l'exige, mot pour mot : une app qui produit du contenu par IA
 * doit permettre de « signaler un contenu offensant aux développeurs sans
 * avoir à quitter l'application ». TRED est un agent conversationnel
 * texte-vers-texte ; il est dans le champ de la règle. Un lien « écris-nous »
 * ne compte pas — il fait sortir de l'app.
 *
 * ── Pourquoi il est discret, et pas caché ─────────────────────────────────
 *
 * Deux exigences contraires. L'examinateur de Google doit le TROUVER en
 * quelques secondes, sinon la fiche est refusée ; l'étudiant, lui, ne doit pas
 * l'avoir sous le pouce à chaque réponse, sinon il le touche par accident et
 * la file de signalements devient du bruit.
 *
 * D'où un drapeau gris, aligné à droite sous la réponse, jamais dans un menu
 * long-press : ce qui n'est pas visible n'existe pas pour un examinateur.
 *
 * ── Il ne demande pas confirmation ────────────────────────────────────────
 *
 * Choisir un motif EST la confirmation. Ajouter un « es-tu sûr ? » ferait
 * abandonner à mi-chemin, et un signalement abandonné est une information
 * perdue.
 */

const REASONS = ["harmful", "wrong", "offensive", "other"] as const;
type Reason = (typeof REASONS)[number];

export function ReportButton({
  conversationId,
  messageId,
  text,
  locale,
}: {
  conversationId: string;
  messageId: string;
  /** La réponse elle-même. Copiée côté serveur : la conversation peut être
   *  supprimée juste après, et un rapport qui pointe vers du vide ne sert à
   *  rien. */
  text: string;
  locale: string;
}) {
  const { t } = useTranslation();
  const c = useColors();

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);

  const create = useMutation(orpc.reports.create.mutationOptions());

  async function send() {
    if (!reason) return;
    await create
      .mutateAsync({ reason, conversationId, messageId, excerpt: text, note, locale })
      .catch(() => {
        /* Le serveur avale déjà ses erreurs. Ce `catch` couvre la coupure
           réseau : on remercie quand même. Refuser un signalement parce que
           le métro traverse un tunnel serait absurde. */
      });
    setSent(true);
  }

  function close() {
    setOpen(false);
    // Remise à zéro différée : sinon la fenêtre se vide sous les yeux pendant
    // son animation de fermeture.
    setTimeout(() => {
      setReason(null);
      setNote("");
      setSent(false);
    }, 250);
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("report.action")}
        hitSlop={10}
        onPress={() => {
          void Haptics.selectionAsync();
          setOpen(true);
        }}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.5 }]}
      >
        <Ionicons name="flag-outline" size={13} color={c.mutedForeground} />
        <Text style={[styles.triggerText, { color: c.mutedForeground }]}>
          {t("report.action")}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: c.card, borderColor: c.border }]}>
            {sent ? (
              <>
                <Text style={[styles.title, { color: c.foreground }]}>
                  {t("report.thanksTitle")}
                </Text>
                <Text style={[styles.body, { color: c.mutedForeground }]}>
                  {t("report.thanksBody")}
                </Text>
                <View style={styles.actions}>
                  <Button label={t("common.close")} onPress={close} />
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.title, { color: c.foreground }]}>
                  {t("report.title")}
                </Text>
                <Text style={[styles.body, { color: c.mutedForeground }]}>
                  {t("report.body")}
                </Text>

                <View style={[styles.reasons, { borderColor: c.border }]}>
                  {REASONS.map((value, i) => (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: reason === value }}
                      accessibilityLabel={t(`report.reason_${value}`)}
                      onPress={() => setReason(value)}
                      style={({ pressed }) => [
                        styles.reason,
                        i > 0 && {
                          borderTopWidth: StyleSheet.hairlineWidth,
                          borderTopColor: c.border,
                        },
                        pressed && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={[styles.reasonLabel, { color: c.foreground }]}>
                        {t(`report.reason_${value}`)}
                      </Text>
                      {reason === value ? (
                        <Ionicons name="checkmark" size={17} color={c.primary} />
                      ) : null}
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  value={note}
                  onChangeText={setNote}
                  multiline
                  maxLength={1000}
                  placeholder={t("report.notePlaceholder")}
                  placeholderTextColor={c.mutedForeground}
                  accessibilityLabel={t("report.notePlaceholder")}
                  style={[
                    styles.note,
                    { backgroundColor: c.input, borderColor: c.border, color: c.foreground },
                  ]}
                />

                <View style={styles.actions}>
                  <Button label={t("common.cancel")} variant="ghost" onPress={close} />
                  <Button
                    label={t("report.send")}
                    disabled={!reason}
                    loading={create.isPending}
                    onPress={() => void send()}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-end",
    paddingTop: Space.sm,
    paddingHorizontal: Space.xs,
  },
  triggerText: { fontSize: FontSize.xs },

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
  title: { fontSize: FontSize.lg, fontWeight: "700" },
  body: { fontSize: FontSize.sm, lineHeight: 19 },

  reasons: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    overflow: "hidden",
    marginTop: Space.xs,
  },
  reason: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Space.md,
    paddingVertical: Space.md,
    minHeight: 46,
  },
  reasonLabel: { fontSize: FontSize.md },

  note: {
    minHeight: 72,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.md,
    fontSize: FontSize.sm,
    textAlignVertical: "top",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: Space.sm,
    marginTop: Space.xs,
  },
});
