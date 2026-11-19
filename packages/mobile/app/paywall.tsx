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
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card } from "@/components/ui/Card";
import { Consent } from "@/components/Consent";
import { Button } from "@/components/ui/Button";
import { TredLogoIcon } from "@/components/TredLogoIcon";
import { useColors } from "@/hooks/use-colors";
import { usePlan, useCreatePassCheckout, useBillingPortal } from "@/queries/plan";
import { purchasesHidden } from "@/lib/store-policy";
import { orpc } from "@/lib/api";
import { APP_SCHEME } from "@/lib/auth-client";
import { Radius, Space } from "@/constants/theme";

/** Les deux Pass (paiement unique) : mêmes prix que le site, lus sur le serveur. */
type Interval = "klausur" | "semester";

export default function Paywall() {
  const { t, i18n } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const plan = usePlan();
  const checkout = useCreatePassCheckout();
  const portal = useBillingPortal();

  // Le semestriel est sélectionné par défaut : c'est l'offre qui rapporte le
  // plus et celle qui colle au rythme d'un étudiant. Le mensuel reste à un
  // toucher, jamais caché.
  const [interval, setInterval] = useState<Interval>("semester");

  // § 356 Abs. 5 BGB — deux cases DISTINCTES et NON précochées. Sans elles,
  // un client peut utiliser l'app treize jours puis se faire rembourser
  // intégralement : le droit de rétractation ne s'éteint pas tout seul.
  const [consentStart, setConsentStart] = useState(false);
  const [consentLose, setConsentLose] = useState(false);
  const consentOk = consentStart && consentLose;

  const passes = plan.data?.passes ?? [];
  const monthly = passes.find((o) => o.kind === "klausur");
  const semester = passes.find((o) => o.kind === "semester");
  const selected = interval === "semester" ? (semester ?? monthly) : monthly;

  const money = useMemo(() => {
    return (cents: number, currency: string) =>
      new Intl.NumberFormat(i18n.language, {
        style: "currency",
        currency: currency || "EUR",
      }).format(cents / 100);
  }, [i18n.language]);

  /** Économie du Semester-Pass face à autant de Klausur-Pass, en % arrondi vers le bas. */
  const saving = useMemo(() => {
    if (!monthly || !semester) return null;
    const full = monthly.amount * semester.months;
    if (full <= 0 || semester.amount >= full) return null;
    return Math.floor(((full - semester.amount) / full) * 100);
  }, [monthly, semester]);

  const isPaid = (plan.data?.plan ?? "free") !== "free";

  async function subscribe() {
    if (!selected) return;
    if (!consentOk) {
      Alert.alert(t("legal.withdrawal"), t("legal.consentRequired"));
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // On n'envoie PAS de successUrl : Stripe Checkout n'accepte que des URL
    // http(s) et refuse un schéma d'application (`tred://…`) avec une erreur
    // de paramètre invalide. Le backend retombe donc sur `WEBSITE_URL/pricing`.
    //
    // Le retour dans l'app est assuré autrement : `openAuthSessionAsync` rend
    // la main dès que l'utilisateur ferme le navigateur, et on rafraîchit à ce
    // moment-là. Pour un retour automatique après paiement, il faudra une page
    // https sur ton domaine qui redirige vers `tred://paywall` — c'est du
    // confort, pas un prérequis.
    const res = await checkout
      .mutateAsync({ pass: selected.kind })
      .catch(() => null);

    if (!res?.url) {
      Alert.alert(t("common.error"), t("plan.notConfigured"));
      return;
    }

    await WebBrowser.openAuthSessionAsync(res.url, `${APP_SCHEME}://paywall`);
    // Au retour, le webhook Stripe a peut-être déjà écrit en base — on
    // redemande. S'il est en retard, le prochain focus de l'écran corrigera.
    void queryClient.invalidateQueries({
      queryKey: orpc.subscriptions.me.queryKey(),
    });
    void queryClient.invalidateQueries({ queryKey: orpc.credits.me.queryKey() });
  }

  async function manage() {
    const res = await portal.mutateAsync({}).catch(() => null);
    if (!res?.url) {
      Alert.alert(t("common.error"), t("errors.server"));
      return;
    }
    await WebBrowser.openAuthSessionAsync(res.url, `${APP_SCHEME}://paywall`);
    void queryClient.invalidateQueries({
      queryKey: orpc.subscriptions.me.queryKey(),
    });
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <View style={styles.head}>
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
        <View style={styles.brand}>
          <TredLogoIcon size={56} color={c.foreground} />
          <Text style={[styles.title, { color: c.foreground }]}>
            TRED {t("plan.premium")}
          </Text>
        </View>

        {plan.isLoading ? (
          <ActivityIndicator color={c.accent} />
        ) : purchasesHidden && !isPaid ? (
          // iOS et Android : aucun achat, aucun prix, aucun lien (lib/store-policy.ts).
          <Card>
            <Text testID="ios-no-purchase" style={{ color: c.mutedForeground, lineHeight: 21 }}>
              {t("plan.notInApp")}
            </Text>
          </Card>
        ) : !isPaid && !selected?.available ? (
          <Card>
            <Text style={{ color: c.mutedForeground }}>
              {t("plan.notConfigured")}
            </Text>
          </Card>
        ) : (
          <Card highlighted>
            {/* ── Bascule mensuel / semestriel ─────────────────────── */}
            <View
              style={[
                styles.toggle,
                { backgroundColor: c.secondary, borderColor: c.border },
              ]}
            >
              {(["klausur", "semester"] as const).map((key) => {
                const active = interval === key;
                const disabled = key === "semester" ? !semester : !monthly;
                return (
                  <Pressable
                    key={key}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active, disabled }}
                    disabled={disabled}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setInterval(key);
                    }}
                    style={[
                      styles.toggleItem,
                      {
                        backgroundColor: active ? c.card : "transparent",
                        borderColor: active ? c.border : "transparent",
                        opacity: disabled ? 0.4 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color: active ? c.foreground : c.mutedForeground,
                        fontWeight: active ? "700" : "500",
                        fontSize: 14,
                      }}
                    >
                      {key === "klausur" ? t("plan.klausurPass") : t("plan.semesterPass")}
                    </Text>
                  </Pressable>
                );
              })}

              {saving ? (
                <View style={[styles.savePill, { backgroundColor: c.success }]}>
                  <Text style={styles.savePillText}>
                    {t("plan.savePercent", { percent: saving })}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* ── Prix ─────────────────────────────────────────────── */}
            {selected ? (
              <View style={styles.priceBlock}>
                <View style={styles.priceRow}>
                  <Text style={[styles.price, { color: c.foreground }]}>
                    {money(selected.amount, selected.currency)}
                  </Text>
                  <Text style={[styles.perMonth, { color: c.mutedForeground }]}>
                    {t("plan.oneTime")}
                  </Text>
                </View>
                <Text style={[styles.total, { color: c.mutedForeground }]}>
                  {selected.months > 0
                    ? t("plan.passMonths", { count: selected.months })
                    : t("plan.passDays", { count: selected.days })}
                </Text>
              </View>
            ) : null}

            {/* ── Ce qui est inclus ───────────────────────────────── */}
            <View style={styles.features}>
              <Feature label={t("plan.featureUnlimited")} />
              <Feature label={t("plan.featureDocuments")} />
              <Feature label={t("plan.featureExercises")} />
              <Feature label={t("plan.featureSupport")} />
            </View>

            {!isPaid ? (
              <View style={styles.consents}>
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
            ) : null}

            {isPaid ? (
              purchasesHidden || plan.data?.passActive || !plan.data?.manageable ? null : (
              <Button
                label={t("plan.manage")}
                variant="secondary"
                fullWidth
                size="lg"
                loading={portal.isPending}
                onPress={() => void manage()}
              />
              )
            ) : (
              <Button
                label={t("plan.subscribe")}
                fullWidth
                size="lg"
                loading={checkout.isPending}
                disabled={!selected || !consentOk}
                onPress={() => void subscribe()}
              />
            )}

            <Text style={[styles.reassure, { color: c.mutedForeground }]}>
              {t("plan.noSubscription")}
            </Text>
          </Card>
        )}

        <Pressable onPress={() => router.push("/credits")}>
          <Text style={[styles.altLink, { color: c.mutedForeground }]}>
            {t("credits.buy")}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Feature({ label }: { label: string }) {
  const c = useColors();
  return (
    <View style={styles.featureRow}>
      <Ionicons name="checkmark-circle" size={18} color={c.accent} />
      <Text style={{ color: c.foreground, fontSize: 14, flex: 1 }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  head: { paddingHorizontal: Space.lg, paddingTop: Space.sm, alignItems: "flex-end" },
  scroll: {
    padding: Space.lg,
    gap: Space.xl,
    flexGrow: 1,
    justifyContent: "center",
  },
  brand: { alignItems: "center", gap: Space.sm },
  title: { fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
  toggle: {
    flexDirection: "row",
    padding: 3,
    gap: 3,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toggleItem: {
    flex: 1,
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  savePill: {
    position: "absolute",
    top: -11,
    right: Space.md,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  savePillText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  priceBlock: { alignItems: "center", marginTop: Space.xl, gap: 2 },
  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  price: { fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  perMonth: { fontSize: 15, marginBottom: 7 },
  total: { fontSize: 13 },
  features: { gap: Space.sm, marginVertical: Space.xl },
  consents: { gap: Space.md, marginBottom: Space.lg },
  featureRow: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  reassure: { fontSize: 12, textAlign: "center", marginTop: Space.md },
  altLink: {
    fontSize: 13,
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
