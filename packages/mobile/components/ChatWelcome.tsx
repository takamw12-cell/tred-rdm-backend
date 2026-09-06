import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { TredCompanion } from "@/components/TredCompanion";
import { useColors } from "@/hooks/use-colors";
import { FontSize, Radius, Space } from "@/constants/theme";

/**
 * L'accueil, quand il n'y a encore aucune conversation.
 *
 * ── Ce qu'il remplace ─────────────────────────────────────────────────────
 *
 * `EmptyState` : un titre, une phrase, un bouton « nouvelle conversation ».
 * Correct, et complètement muet. L'étudiant qui arrive doit inventer sa
 * première question tout seul — et devant un champ vide, il n'en invente pas.
 *
 * ── Pourquoi des pastilles et pas un bouton ───────────────────────────────
 *
 * Un bouton « commencer » demande de savoir quoi demander. Quatre pastilles
 * nomment quatre choses qu'on peut vouloir : résoudre un exercice, déposer un
 * cours, s'entraîner, préparer une Klausur. Ce ne sont pas des raccourcis de
 * navigation, ce sont des INTENTIONS — la différence entre un menu et une
 * proposition.
 *
 * Elles défilent horizontalement : sur un écran étroit, quatre pastilles sur
 * deux lignes se lisent comme un formulaire, sur une seule comme un choix.
 */

interface Raccourci {
  cle: string;
  icone: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  teinte: "signature" | "primary" | "success" | "warning";
  vers: string;
}

const RACCOURCIS: Raccourci[] = [
  { cle: "solve", icone: "camera-outline", teinte: "primary", vers: "/chat/new" },
  { cle: "upload", icone: "cloud-upload-outline", teinte: "signature", vers: "/(tabs)/documents" },
  { cle: "practice", icone: "barbell-outline", teinte: "success", vers: "/chat/new" },
  { cle: "exam", icone: "school-outline", teinte: "warning", vers: "/chat/new" },
];

export function ChatWelcome() {
  const { t } = useTranslation();
  const c = useColors();
  const router = useRouter();

  const teintes = {
    signature: c.signature,
    primary: c.primary,
    success: c.success,
    warning: c.warning,
  } as const;

  return (
    <View style={styles.enveloppe}>
      <TredCompanion size={132} />

      <Text style={[styles.titre, { color: c.foreground }]}>
        {t("welcome.title")}
      </Text>
      <Text style={[styles.corps, { color: c.mutedForeground }]}>
        {t("welcome.body")}
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pastilles}
        style={styles.rail}
      >
        {RACCOURCIS.map((r) => (
          <Pressable
            key={r.cle}
            accessibilityRole="button"
            accessibilityLabel={t(`welcome.${r.cle}`)}
            onPress={() => {
              void Haptics.selectionAsync().catch(() => {});
              router.push(r.vers as never);
            }}
            style={({ pressed }) => [
              styles.pastille,
              {
                backgroundColor: c.card,
                borderColor: c.border,
                opacity: pressed ? 0.65 : 1,
              },
            ]}
          >
            <Ionicons name={r.icone} size={16} color={teintes[r.teinte]} />
            <Text style={[styles.pastilleTexte, { color: c.foreground }]}>
              {t(`welcome.${r.cle}`)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Le champ. Il ne saisit rien : il OUVRE la conversation, où le vrai
          champ prend le relais avec le clavier déjà levé. Un deuxième champ
          réellement éditable ici demanderait de porter son contenu jusqu'à
          l'écran suivant, pour aucun gain visible. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("welcome.ask")}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => {});
          router.push("/chat/new");
        }}
        style={({ pressed }) => [
          styles.champ,
          {
            backgroundColor: c.input,
            borderColor: c.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Text style={[styles.champTexte, { color: c.mutedForeground }]}>
          {t("welcome.ask")}
        </Text>
        <View style={[styles.envoi, { backgroundColor: c.signature }]}>
          <Ionicons name="arrow-up" size={16} color="#15181B" />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  enveloppe: {
    alignItems: "center",
    paddingTop: Space.xl,
    paddingHorizontal: Space.lg,
    gap: Space.md,
  },
  titre: {
    fontSize: FontSize.lg,
    fontWeight: "700",
    textAlign: "center",
    marginTop: Space.sm,
  },
  corps: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 320,
  },
  rail: { alignSelf: "stretch", marginTop: Space.xs },
  pastilles: { gap: Space.sm, paddingHorizontal: Space.xs },
  pastille: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: Space.md,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pastilleTexte: { fontSize: FontSize.sm, fontWeight: "600" },
  champ: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    height: 48,
    paddingLeft: Space.lg,
    paddingRight: 6,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: Space.xs,
  },
  champTexte: { flex: 1, fontSize: FontSize.md },
  envoi: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
