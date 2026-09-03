import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { Ionicons } from "@expo/vector-icons";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Consent } from "@/components/Consent";
import { useColors } from "@/hooks/use-colors";
import { useCredits } from "@/queries/credits";
import { orpc } from "@/lib/api";
import { APP_SCHEME } from "@/lib/auth-client";
import { FontSize, Radius, Space } from "@/constants/theme";

/**
 * Achat de crédits.
 *
 * ── Pourquoi cet écran manquait ───────────────────────────────────────────
 *
 * Trois endroits y menaient déjà — la puce de crédits, le paywall et l'écran
 * de chat quand le quota est épuisé — et la route n'existait pas. Un étudiant
 * à court de crédits arrivait donc sur un écran vide, au moment exact où il
 * voulait payer.
 *
 * ── Deux poches, un seul nombre en tête ───────────────────────────────────
 *
 * Le quota mensuel expire à la fin du mois ; les crédits achetés n'expirent
 * jamais et ne sont consommés qu'après le quota. C'est écrit ici, pas dans une
 * page d'aide : c'est la question posée chaque fois qu'on regarde ce solde.
 *
 * ── Le consentement de rétractation ───────────────────────────────────────
 *
 * § 356 Abs. 5 BGB. Des crédits utilisables immédiatement sont un contenu
 * numérique livré avant la fin du délai de rétractation ; sans les deux cases,
 * l'achat reste remboursable quatorze jours après avoir été consommé. Les
 * mêmes deux cases que le paywall, pour la même raison.
 */

export default function Credits() {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const credits = useCredits();

  const [pending, setPending] = useState<string | null>(null);
  const [consentStart, setConsentStart] = useState(false);
  const [consentLose, setConsentLose] = useState(false);
  const consentOk = consentStart && consentLose;

  const purchase = useMutation(orpc.credits.purchase.mutationOptions());

  const money = useMemo(
    () => (cents: number, currency: string) =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: currency || "EUR",
      }).format(cents / 100),
    [i18n.language],
  );

  // Le tableau est mémorisé, pas seulement lu : `?? []` fabrique une NOUVELLE
  // liste vide à chaque rendu, ce qui relancerait le calcul du meilleur prix
  // en boucle tant que les paquets ne sont pas chargés.
  const loaded = credits.data?.packs;
  const packs = useMemo(() => loaded ?? [], [loaded]);

  /** Le paquet au meilleur prix unitaire — mis en avant, jamais présélectionné. */
  const bestPriceId = useMemo(() => {
    if (packs.length < 2) return null;
    return packs.reduce((best, p) =>
      p.pricePerCredit < best.pricePerCredit ? p : best,
    ).priceId;
  }, [packs]);

  async function buy(priceId: string) {
    if (!consentOk) {
      Alert.alert(t("legal.withdrawal"), t("legal.consentRequired"));
      return;
    }
    setPending(priceId);
    try {
      const { url } = await purchase.mutateAsync({
        priceId,
        // Stripe renvoie vers l'application, pas vers le site : sans ce
        // schéma, le paiement finit dans un onglet de navigateur et
        // l'étudiant doit revenir à la main sans savoir si ça a marché.
        successUrl: `${APP_SCHEME}://credits?status=success`,
        cancelUrl: `${APP_SCHEME}://credits?status=cancel`,
      });

      const result = await WebBrowser.openAuthSessionAsync(
        url,
        `${APP_SCHEME}://credits`,
      );

      // Le solde ne bouge que quand le webhook Stripe a écrit la ligne. On
      // redemande donc plutôt que d'annoncer un crédit qui n'existe peut-être
      // pas encore — un chiffre qui monte puis redescend est pire qu'une
      // seconde d'attente.
      if (result.type === "success") {
        await queryClient.invalidateQueries({ queryKey: orpc.credits.me.queryKey() });
        Alert.alert(t("credits.title"), t("credits.purchasePending"));
      }
    } catch {
      Alert.alert(t("common.error"), t("errors.server"));
    } finally {
      setPending(null);
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <View style={styles.bar}>
        <Text accessibilityRole="header" style={[styles.barTitle, { color: c.foreground }]}>
          {t("credits.title")}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Ionicons name="close" size={24} color={c.mutedForeground} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ── Le solde, décomposé ──────────────────────────────────────── */}
        <Card>
          <Text style={[styles.total, { color: c.foreground }]}>
            {credits.isLoading ? "—" : (credits.data?.total ?? 0)}
          </Text>
          <Text style={[styles.totalLabel, { color: c.mutedForeground }]}>
            {t("credits.balance", { count: credits.data?.total ?? 0 })}
          </Text>

          <View style={[styles.split, { borderTopColor: c.border }]}>
            <Detail
              label={t("plan.usage", {
                used: credits.data?.monthlyRemaining ?? 0,
                limit: credits.data?.monthlyLimit ?? 0,
              })}
              value={String(credits.data?.monthlyRemaining ?? 0)}
            />
            <Detail
              label={t("credits.title")}
              value={String(credits.data?.purchasedCredits ?? 0)}
            />
          </View>

          <Text style={[styles.note, { color: c.mutedForeground }]}>
            {t("credits.subtitle")}
          </Text>
        </Card>

        {/* ── Les paquets ──────────────────────────────────────────────── */}
        {credits.isLoading ? (
          <ActivityIndicator color={c.accent} style={styles.loader} />
        ) : packs.length === 0 ? (
          <Card>
            <Text style={[styles.note, { color: c.mutedForeground }]}>
              {t("plan.notConfigured")}
            </Text>
          </Card>
        ) : (
          <>
            {packs.map((pack) => (
              <Card key={pack.priceId} highlighted={pack.priceId === bestPriceId}>
                <View style={styles.packRow}>
                  <View style={styles.packText}>
                    <Text style={[styles.packName, { color: c.foreground }]}>
                      {t("credits.pack", { count: pack.credits })}
                    </Text>
                    <Text style={[styles.packMeta, { color: c.mutedForeground }]}>
                      {t("credits.pricePer", {
                        price: money(pack.pricePerCredit, pack.currency),
                      })}
                    </Text>
                  </View>
                  <Text style={[styles.packPrice, { color: c.foreground }]}>
                    {money(pack.amount, pack.currency)}
                  </Text>
                </View>

                <View style={styles.packAction}>
                  <Button
                    label={t("credits.buy")}
                    fullWidth
                    haptic
                    disabled={!consentOk || pending !== null}
                    loading={pending === pack.priceId}
                    onPress={() => void buy(pack.priceId)}
                  />
                </View>
              </Card>
            ))}

            {/* Deux cases DISTINCTES, jamais précochées — § 356 Abs. 5 BGB. */}
            <View style={styles.consent}>
              <Consent
                checked={consentStart}
                onToggle={() => setConsentStart((v) => !v)}
                label={t("legal.consentStart")}
              />
              <Consent
                checked={consentLose}
                onToggle={() => setConsentLose((v) => !v)}
                label={t("legal.consentLose")}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View style={styles.detail}>
      <Text style={[styles.detailValue, { color: c.foreground }]}>{value}</Text>
      <Text numberOfLines={2} style={[styles.detailLabel, { color: c.mutedForeground }]}>
        {label}
      </Text>
    </View>
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
  barTitle: { fontSize: FontSize.xl, fontWeight: "700", letterSpacing: -0.4 },
  scroll: { paddingHorizontal: Space.lg, paddingBottom: Space.xxl, gap: Space.md },
  loader: { marginTop: Space.xl },

  total: { fontSize: 44, fontWeight: "800", letterSpacing: -1.5 },
  totalLabel: { fontSize: FontSize.sm },
  split: {
    flexDirection: "row",
    gap: Space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: Space.md,
    paddingTop: Space.md,
  },
  detail: { flex: 1, gap: 2 },
  detailValue: { fontSize: FontSize.lg, fontWeight: "700" },
  detailLabel: { fontSize: FontSize.xs, lineHeight: 15 },
  note: { fontSize: FontSize.sm, lineHeight: 19, marginTop: Space.md },

  packRow: { flexDirection: "row", alignItems: "center", gap: Space.md },
  packText: { flex: 1, gap: 2 },
  packName: { fontSize: FontSize.md, fontWeight: "600" },
  packMeta: { fontSize: FontSize.sm },
  packPrice: { fontSize: FontSize.lg, fontWeight: "700" },
  packAction: { marginTop: Space.md },

  consent: {
    gap: Space.sm,
    padding: Space.md,
    borderRadius: Radius.md,
  },
});
