import { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { TredLogoIcon } from "@/components/TredLogoIcon";
import { useColors } from "@/hooks/use-colors";
import { authClient, API_URL } from "@/lib/auth-client";
import { FontSize, Radius, Space } from "@/constants/theme";

/**
 * Connexion et inscription.
 *
 * ── Pourquoi cet écran manquait ───────────────────────────────────────────
 *
 * `SessionGate` redirige vers `/(auth)/sign-in` quand personne n'est connecté.
 * La route n'existait pas. L'application mobile était donc **inutilisable de
 * bout en bout** : rien ne permettait d'ouvrir une session, et le défaut ne se
 * voyait pas en développement, où la session traîne déjà dans le trousseau.
 *
 * ── Un seul écran pour les deux gestes ────────────────────────────────────
 *
 * Comme sur le web. Deux écrans séparés obligent à retaper l'adresse quand on
 * s'est trompé de porte, ce qui est le cas une fois sur deux.
 *
 * ── Le code d'invitation vient du serveur ─────────────────────────────────
 *
 * `/api/config` dit si l'inscription est ouverte. Tant que la réponse n'est
 * pas là, on considère qu'elle est fermée : afficher le champ puis le retirer
 * donne l'impression d'un formulaire qui bouge tout seul, et le contraire —
 * le cacher puis le montrer — fait rater le champ à celui qui a déjà tapé.
 */

type Mode = "signin" | "signup";

export default function SignIn() {
  const { t } = useTranslation();
  const c = useColors();

  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);

  const [inviteRequired, setInviteRequired] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/config`)
      .then((r) => r.json())
      .then((d: { inviteRequired?: boolean }) => {
        if (!cancelled) setInviteRequired(d.inviteRequired !== false);
      })
      .catch(() => {
        /* hors ligne : on garde « fermé », l'utilisateur verra le champ */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isSignup = mode === "signup";
  const canSubmit =
    email.trim().length > 3 &&
    password.length >= 8 &&
    (!isSignup || name.trim().length > 0);

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);

    try {
      const result = isSignup
        ? await authClient.signUp.email({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            password,
            ...(invite.trim()
              ? ({ inviteCode: invite.trim() } as Record<string, string>)
              : {}),
          })
        : await authClient.signIn.email({
            email: email.trim().toLowerCase(),
            password,
          });

      if (result.error) {
        const code = result.error.status;
        setError(
          code === 403
            ? t("auth.inviteInvalid")
            : code === 401
              ? t("auth.invalidCredentials")
              : code === 422
                ? t("auth.emailTaken")
                : (result.error.message ?? t("auth.errorGeneric")),
        );
      }
      // Pas de navigation ici : `SessionGate` observe la session et bascule
      // vers `/(tabs)` de lui-même. Rediriger aussi depuis cet écran ferait
      // deux navigations concurrentes et un retour arrière cassé.
    } catch {
      setError(t("errors.network"));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Mot de passe oublié.
   *
   * Le message de confirmation s'affiche **quoi qu'il arrive**, même si
   * l'adresse est inconnue. Dire « cette adresse n'existe pas » offrirait à
   * n'importe qui la liste des comptes inscrits.
   */
  async function forgot() {
    if (email.trim().length < 4) {
      setError(t("auth.email"));
      return;
    }
    setBusy(true);
    await authClient
      .requestPasswordReset({
        email: email.trim().toLowerCase(),
        redirectTo: `${API_URL}/reset-password`,
      })
      .catch(() => {});
    setBusy(false);
    setForgotSent(true);
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brand}>
            <TredLogoIcon size={40} color={c.foreground} />
            <Text style={[styles.brandText, { color: c.foreground }]}>TRED</Text>
          </View>

          <Text style={[styles.title, { color: c.foreground }]} accessibilityRole="header">
            {isSignup ? t("auth.signUpTitle") : t("auth.signInTitle")}
          </Text>
          <Text style={[styles.subtitle, { color: c.mutedForeground }]}>
            {isSignup ? t("auth.signUpSubtitle") : t("auth.signInSubtitle")}
          </Text>

          <View style={styles.form}>
            {isSignup ? (
              <Field
                label={t("auth.name")}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                textContentType="name"
              />
            ) : null}

            <Field
              label={t("auth.email")}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
            />

            <Field
              label={t("auth.password")}
              hint={isSignup ? t("auth.passwordHint") : undefined}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              textContentType={isSignup ? "newPassword" : "password"}
            />

            {isSignup && inviteRequired ? (
              <Field
                label={t("auth.inviteCode")}
                hint={t("auth.inviteRequired")}
                value={invite}
                onChangeText={setInvite}
                autoCapitalize="characters"
              />
            ) : null}

            {error ? (
              <Text style={[styles.error, { color: c.destructive }]}>{error}</Text>
            ) : null}
            {forgotSent ? (
              <Text style={[styles.notice, { color: c.mutedForeground }]}>
                {t("auth.forgotSent")}
              </Text>
            ) : null}

            <Button
              label={isSignup ? t("auth.signUp") : t("auth.signIn")}
              onPress={() => void submit()}
              loading={busy}
              disabled={!canSubmit}
              fullWidth
              size="lg"
              haptic
            />

            {!isSignup ? (
              <Pressable accessibilityRole="button" onPress={() => void forgot()}>
                <Text style={[styles.link, { color: c.mutedForeground }]}>
                  {t("auth.forgot")}
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setMode(isSignup ? "signin" : "signup");
              setError(null);
              setForgotSent(false);
            }}
            style={styles.switch}
          >
            <Text style={[styles.switchText, { color: c.mutedForeground }]}>
              {isSignup ? t("auth.hasAccount") : t("auth.noAccount")}{" "}
              <Text style={{ color: c.primary, fontWeight: "600" }}>
                {isSignup ? t("auth.signIn") : t("auth.signUp")}
              </Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Un champ étiqueté. L'étiquette est au-dessus, jamais en filigrane :
 *  un placeholder disparaît dès la première lettre, et l'utilisateur ne sait
 *  plus ce qu'il est en train de remplir. */
function Field({
  label,
  hint,
  ...input
}: {
  label: string;
  hint?: string;
} & React.ComponentProps<typeof TextInput>) {
  const c = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.mutedForeground }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={c.mutedForeground}
        {...input}
        style={[
          styles.input,
          { backgroundColor: c.input, borderColor: c.border, color: c.foreground },
        ]}
      />
      {hint ? <Text style={[styles.hint, { color: c.mutedForeground }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xxl,
    gap: Space.xs,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginBottom: Space.xl,
  },
  brandText: { fontSize: FontSize.xl, fontWeight: "800", letterSpacing: 2 },
  title: { fontSize: FontSize.xxl, fontWeight: "700", letterSpacing: -0.5 },
  subtitle: { fontSize: FontSize.sm, lineHeight: 20, marginBottom: Space.lg },
  form: { gap: Space.md },
  field: { gap: Space.xs },
  label: {
    fontSize: FontSize.xs,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  input: {
    height: 48,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Space.md,
    fontSize: FontSize.md,
  },
  hint: { fontSize: FontSize.xs },
  error: { fontSize: FontSize.sm, lineHeight: 18 },
  notice: { fontSize: FontSize.sm, lineHeight: 18 },
  link: { fontSize: FontSize.sm, textAlign: "center", paddingVertical: Space.xs },
  switch: { marginTop: Space.xl, alignItems: "center" },
  switchText: { fontSize: FontSize.sm },
});
