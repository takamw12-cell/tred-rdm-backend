import { useEffect, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

import { useColors } from "@/hooks/use-colors";

/**
 * Le compagnon TRED.
 *
 * ── Pourquoi il n'est pas une créature violette ───────────────────────────
 *
 * La référence apportée est la mascotte de Knowunity — un blob violet posé au
 * centre de l'écran d'accueil. L'effet visé est juste : un écran vide qui
 * REGARDE l'étudiant se traverse tout autrement qu'un écran vide qui attend.
 *
 * Mais copier la silhouette d'un concurrent direct, sur le même campus, auprès
 * des mêmes étudiants, produit exactement l'inverse de ce qu'on cherche : ils
 * connaissent Knowunity, et TRED passerait pour sa version pauvre.
 *
 * Le compagnon est donc bâti sur le « T » fracturé du logo — la marque
 * existante — à qui l'on ajoute des yeux. Même geste, identité propre.
 *
 * ── Ce qui le rend vivant ─────────────────────────────────────────────────
 *
 * Deux mouvements, et rien d'autre. Une respiration lente de haut en bas, et
 * un clignement à intervalle irrégulier. L'irrégularité fait tout : un
 * clignement toutes les trois secondes exactement se lit comme une horloge,
 * pas comme un regard.
 *
 * Aucune bibliothèque d'animation ajoutée — `Animated` fait partie de React
 * Native, et `bun install` ne fonctionne pas sur cette machine.
 */
export function TredCompanion({ size = 132 }: { size?: number }) {
  const c = useColors();
  const flotte = useRef(new Animated.Value(0)).current;
  const [ferme, setFerme] = useState(false);

  // La respiration. En boucle, sans fin : elle ne demande rien et ne réclame
  // pas l'attention, elle indique seulement que quelque chose est là.
  useEffect(() => {
    const boucle = Animated.loop(
      Animated.sequence([
        Animated.timing(flotte, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(flotte, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    boucle.start();
    return () => boucle.stop();
  }, [flotte]);

  // Le clignement. `setTimeout` réarmé à chaque fois plutôt qu'un intervalle :
  // c'est ce qui permet de tirer un délai différent à chaque tour.
  useEffect(() => {
    let minuterie: ReturnType<typeof setTimeout>;
    let vivant = true;

    const programmer = () => {
      const delai = 2600 + Math.random() * 3400;
      minuterie = setTimeout(() => {
        if (!vivant) return;
        setFerme(true);
        setTimeout(() => {
          if (!vivant) return;
          setFerme(false);
          programmer();
        }, 130);
      }, delai);
    };

    programmer();
    return () => {
      vivant = false;
      clearTimeout(minuterie);
    };
  }, []);

  const y = flotte.interpolate({ inputRange: [0, 1], outputRange: [0, -9] });

  return (
    <Animated.View style={{ transform: [{ translateY: y }] }}>
      <View style={{ width: size, height: size }}>
        <Svg viewBox="0 0 200 200" width={size} height={size}>
          {/* Le halo. Il détache la silhouette d'un fond sombre sans dessiner
              de contour, qui durcirait la forme. */}
          <Circle cx="100" cy="104" r="72" fill={c.signature} opacity={0.13} />

          <G>
            {/* Le corps : la barre et le fût du « T », aux angles adoucis.
                C'est la marque, pas une créature de plus. */}
            <Rect x="44" y="52" width="112" height="30" rx="15" fill={c.signature} />
            <Rect x="85" y="52" width="30" height="104" rx="15" fill={c.signature} />

            {/* La fracture du logo — le trait qui distingue TRED d'un T. */}
            <Path
              d="M115 96 L133 108 L117 118 L131 134"
              stroke={c.signature}
              strokeWidth={7}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              opacity={0.75}
            />

            {/* Les yeux. Posés sur le fût, à hauteur d'un visage — et non au
                centre géométrique, qui donnerait un regard vide. */}
            {ferme ? (
              <>
                <Path
                  d="M91 104 q4 4 8 0"
                  stroke="#15181B"
                  strokeWidth={3.4}
                  strokeLinecap="round"
                  fill="none"
                />
                <Path
                  d="M101 104 q4 4 8 0"
                  stroke="#15181B"
                  strokeWidth={3.4}
                  strokeLinecap="round"
                  fill="none"
                />
              </>
            ) : (
              <>
                <Ellipse cx="95" cy="103" rx="4.6" ry="5.6" fill="#15181B" />
                <Ellipse cx="105" cy="103" rx="4.6" ry="5.6" fill="#15181B" />
                {/* Le reflet. Deux points blancs minuscules : sans eux, le
                    regard est fixe et un peu inquiétant. */}
                <Circle cx="96.6" cy="101" r="1.5" fill="#FFFFFF" />
                <Circle cx="106.6" cy="101" r="1.5" fill="#FFFFFF" />
              </>
            )}
          </G>
        </Svg>
      </View>
    </Animated.View>
  );
}
