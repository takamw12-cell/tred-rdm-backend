import { useEffect, useRef } from "react";
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useColors } from "@/hooks/use-colors";
import { FontSize, Radius, Space } from "@/constants/theme";

/**
 * La barre d'onglets flottante.
 *
 * ── Ce qu'elle remplace ───────────────────────────────────────────────────
 *
 * `BottomTabBar` par défaut : une bande grise collée au bas de l'écran, avec
 * un liseré, trois icônes et trois libellés toujours affichés. C'est la barre
 * d'un projet Expo, pas celle d'une application qu'un étudiant montre à ses
 * amis. Et un étudiant qui hésite entre TRED et Knowunity décide en trois
 * secondes, sur ce genre de détail.
 *
 * ── Ce qui fait l'effet « liquide » ───────────────────────────────────────
 *
 * Une seule chose, en réalité : une pastille qui GLISSE d'un onglet à l'autre
 * au lieu d'apparaître sous le nouvel onglet. L'œil suit le mouvement, et
 * comprend qu'il s'agit du même objet qui se déplace — pas de deux états qui
 * se remplacent. Tout le reste (coins arrondis, ombre portée, fond sombre)
 * n'est que du décor autour de ce déplacement.
 *
 * Le libellé n'apparaît QUE sous l'onglet actif. C'est ce qui laisse la place
 * à la pastille de respirer, et ce qui rend la barre lisible sur un écran de
 * téléphone étroit : trois mots alignés en permanence, c'est du bruit.
 *
 * ── Aucune bibliothèque ajoutée ───────────────────────────────────────────
 *
 * `Animated` fait partie de React Native. Reanimated ferait la même chose de
 * façon plus fluide sur le fil natif, mais `bun install` ne fonctionne pas sur
 * cette machine : ajouter une dépendance coûterait une soirée pour une
 * différence que personne ne verra sur trois onglets.
 *
 * `useNativeDriver: false` est obligatoire ici — on anime `left`, une propriété
 * de mise en page, que le fil natif ne sait pas prendre en charge. Sur trois
 * éléments, l'écart n'est pas perceptible.
 */

/** Hauteur de la barre elle-même, sans la marge de sécurité du bas. */
const HAUTEUR = 62;

/** Marge latérale : la barre flotte, elle ne touche pas les bords. */
const MARGE = 16;

export function LiquidTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width: ecran } = useWindowDimensions();

  const nombre = state.routes.length;
  const largeurBarre = ecran - MARGE * 2;
  const largeurOnglet = largeurBarre / nombre;

  // La position de la pastille. Elle démarre sous l'onglet actif pour qu'un
  // retour sur l'application ne produise pas un glissement depuis la gauche.
  const glisse = useRef(new Animated.Value(state.index * largeurOnglet)).current;

  useEffect(() => {
    Animated.spring(glisse, {
      toValue: state.index * largeurOnglet,
      useNativeDriver: false,
      // Un ressort, pas une durée fixe. Une transition linéaire se lit comme
      // un rectangle qu'on déplace ; le léger dépassement d'un ressort se lit
      // comme un objet qui a une masse.
      speed: 18,
      bounciness: 7,
    }).start();
  }, [state.index, largeurOnglet, glisse]);

  return (
    <View
      style={[
        styles.enveloppe,
        { paddingBottom: Math.max(insets.bottom, Space.md), paddingHorizontal: MARGE },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.barre,
          {
            backgroundColor: c.card,
            borderColor: c.border,
            shadowColor: "#000",
          },
        ]}
      >
        {/* La pastille. Dessinée SOUS les onglets, et sans interception du
            toucher : elle ne doit jamais voler un appui à l'onglet. */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pastille,
            {
              width: largeurOnglet - 10,
              left: glisse,
              marginLeft: 5,
              backgroundColor: c.signature,
            },
          ]}
        />

        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const actif = state.index === index;
          const libelle =
            typeof options.title === "string" ? options.title : route.name;

          const onPress = () => {
            const evenement = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (actif || evenement.defaultPrevented) return;
            // Une petite secousse au changement d'onglet. C'est ce qui donne
            // l'impression que la barre répond, plutôt qu'elle n'obéit.
            if (Platform.OS !== "web") {
              void Haptics.selectionAsync().catch(() => {});
            }
            navigation.navigate(route.name);
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: actif }}
              accessibilityLabel={libelle}
              onPress={onPress}
              onLongPress={() =>
                navigation.emit({ type: "tabLongPress", target: route.key })
              }
              style={[styles.onglet, { width: largeurOnglet }]}
            >
              <Ionicons
                name={iconePour(route.name, actif)}
                size={actif ? 21 : 23}
                // Sur la pastille jaune, l'icône passe en sombre : du blanc sur
                // du #EAB308 ne tient aucun contraste lisible.
                color={actif ? "#15181B" : c.mutedForeground}
              />
              {actif && (
                <Text numberOfLines={1} style={[styles.libelle, { color: "#15181B" }]}>
                  {libelle}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * L'icône d'un onglet, pleine quand il est actif.
 *
 * La table vit ici plutôt que dans les options de chaque écran : la barre est
 * le seul endroit qui dessine des icônes, et les répartir obligerait à ouvrir
 * quatre fichiers pour changer une silhouette.
 */
function iconePour(nom: string, actif: boolean): keyof typeof Ionicons.glyphMap {
  const table: Record<string, [string, string]> = {
    index: ["chatbubbles", "chatbubbles-outline"],
    documents: ["documents", "documents-outline"],
    settings: ["person-circle", "person-circle-outline"],
  };
  const paire = table[nom] ?? ["ellipse", "ellipse-outline"];
  return (actif ? paire[0] : paire[1]) as keyof typeof Ionicons.glyphMap;
}

const styles = StyleSheet.create({
  enveloppe: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    // `box-none` sur l'enveloppe et rien ici : l'espace autour de la barre
    // laisse passer le toucher vers le contenu qui défile en dessous.
  },
  barre: {
    flexDirection: "row",
    height: HAUTEUR,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    overflow: "hidden",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  pastille: {
    position: "absolute",
    top: 6,
    bottom: 6,
    borderRadius: Radius.pill,
  },
  onglet: {
    height: HAUTEUR,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  libelle: {
    fontSize: FontSize.xs,
    fontWeight: "700",
  },
});
