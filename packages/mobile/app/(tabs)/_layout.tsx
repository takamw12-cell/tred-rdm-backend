import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";

import { View } from "react-native";
import { LiquidTabBar } from "@/components/LiquidTabBar";

import { useColors } from "@/hooks/use-colors";
import { useTourTarget } from "@/components/OnboardingGuide";

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
  const cible = useTourTarget("tabs");

  return (
    <Tabs
      // La vue qui enveloppe la barre sert au guide de premier lancement :
      // `LiquidTabBar` est dessinée par la navigation et n'accepte pas de ref,
      // alors que le projecteur a besoin de mesurer ce rectangle.
      tabBar={(props) => (
        <View ref={cible.ref} onLayout={cible.onLayout} collapsable={false}>
          <LiquidTabBar {...props} />
        </View>
      )}
      screenOptions={{
        headerShown: false,
        // La barre flotte AU-DESSUS du contenu : sans cette réserve, le
        // dernier message d'une conversation se cache derrière elle.
        sceneStyle: { backgroundColor: colors.background, paddingBottom: 84 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.chat"),
        }}
      />
      <Tabs.Screen
        name="documents"
        options={{
          title: t("tabs.documents"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("tabs.profile"),
        }}
      />
    </Tabs>
  );
}
