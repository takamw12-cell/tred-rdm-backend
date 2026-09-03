import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

import { useColors } from "@/hooks/use-colors";

/**
 * Les onglets.
 *
 * ── Ce qui a changé ───────────────────────────────────────────────────────
 *
 * L'onglet « Explore » était celui du gabarit Expo — une boussole et un écran
 * de démonstration. C'est le motif de refus le plus courant chez Apple
 * (App Review Guideline 2.1, « completeness ») : un écran manifestement issu
 * d'un modèle prouve que l'app n'est pas finie. Il est remplacé par Réglages,
 * qui règle du même coup la suppression de compte exigée par Google Play et
 * l'accès aux mentions légales.
 *
 * `documents` existait déjà comme fichier mais n'était pas déclaré ici : il
 * apparaissait donc avec le libellé « documents » en minuscules, sans icône,
 * dans la langue du code. Les trois onglets sont maintenant nommés depuis les
 * traductions.
 *
 * ── Pourquoi trois et pas cinq ────────────────────────────────────────────
 *
 * Un étudiant fait trois choses : poser une question, déposer un cours, régler
 * son compte. Les exercices et les révisions naissent d'un document — ils
 * vivent à l'intérieur de « Unterlagen », pas dans un onglet de plus qu'on ne
 * regarde jamais.
 */
export default function TabLayout() {
  const colors = useColors();
  const { t } = useTranslation();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.chat"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubbles" : "chatbubbles-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: t("tabs.documents"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "documents" : "documents-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.profile"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "person-circle" : "person-circle-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
