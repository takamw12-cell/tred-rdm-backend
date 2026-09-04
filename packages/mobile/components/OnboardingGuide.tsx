import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import * as SecureStore from "expo-secure-store";
import { useTranslation } from "react-i18next";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { Button } from "@/components/ui/Button";
import { useColors } from "@/hooks/use-colors";
import { FontSize, Radius, Space } from "@/constants/theme";

/**
 * Le guide du premier lancement, sur téléphone.
 *
 * ── Pourquoi il n'y a pas de « trou » comme sur le web ────────────────────
 *
 * Sur le web, une ombre portée de 9999 px autour d'un rectangle transparent
 * assombrit tout sauf lui. React Native n'a pas cet effet : `shadow*` n'y
 * découpe rien. On dessine donc QUATRE rectangles sombres autour de la cible —
 * haut, bas, gauche, droite. Le résultat est identique à l'écran, et la zone
 * centrale reste réellement vide, donc nette.
 *
 * ── Pourquoi SecureStore et pas AsyncStorage ──────────────────────────────
 *
 * `@react-native-async-storage/async-storage` n'est pas installé, et ajouter
 * une dépendance sur cette machine coûte cher : `bun install` y écrit des
 * dossiers vides. `expo-secure-store` est déjà là — il sert à la session, à la
 * langue et au thème. Le fait qu'il chiffre est ici sans intérêt, mais gratuit.
 *
 * ── Les cibles s'inscrivent, elles ne se cherchent pas ────────────────────
 *
 * Le web interroge le DOM par attribut. React Native n'a pas de DOM : chaque
 * écran ENREGISTRE sa cible par `useTourTarget("upload")`, qui mesure la vue et
 * dépose son rectangle dans un contexte. Une cible non montée est simplement
 * absente, et son étape est sautée.
 */

/**
 * Les quatre étapes, dans l'ordre, avec l'écran où chacune se trouve.
 *
 * ── Pourquoi le guide navigue ─────────────────────────────────────────────
 *
 * Le bouton de dépôt vit dans l'onglet Unterlagen, pas sur l'accueil. Un guide
 * qui se contenterait de sauter les étapes non montées passerait justement la
 * plus importante — celle sans laquelle TRED ne sert à rien. Il emmène donc
 * l'étudiant, comme le ferait quelqu'un qui montre.
 *
 * `route: null` veut dire « on est déjà au bon endroit ».
 */
export const TOUR_STEPS = ["tabs", "upload", "chat", "profile"] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

const ROUTES: Record<TourStep, string | null> = {
  tabs: null,
  upload: "/(tabs)/documents",
  chat: "/(tabs)",
  profile: "/(tabs)/settings",
};

const STORAGE_KEY = "tred.guide.v1";

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Registre {
  cibles: Record<string, Rect>;
  inscrire: (nom: TourStep, rect: Rect | null) => void;
  /**
   * Combien de fois le guide a été redemandé depuis le lancement.
   *
   * Effacer la clé de stockage ne suffit pas : le guide ne la lit qu'au
   * montage, donc « revoir le guide » n'aurait rien fait avant le prochain
   * démarrage de l'application — un bouton qui ne répond pas.
   */
  relance: number;
  relancer: () => void;
}

const TourContext = createContext<Registre | null>(null);

/**
 * Enregistre une vue comme cible du guide.
 *
 * ```tsx
 * const cible = useTourTarget("upload");
 * <View ref={cible.ref} onLayout={cible.onLayout}>…</View>
 * ```
 *
 * `onLayout` déclenche la mesure : c'est le seul moment où React Native
 * garantit que la vue a une position. Mesurer au montage donnerait des zéros.
 */
export function useTourTarget(nom: TourStep) {
  const ctx = useContext(TourContext);
  const ref = useRef<View>(null);

  const onLayout = useCallback(() => {
    if (!ctx) return;
    // `measureInWindow` et non `measure` : on veut des coordonnées d'écran,
    // celles du voile, pas celles relatives au parent.
    ref.current?.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) ctx.inscrire(nom, { x, y, width, height });
    });
  }, [ctx, nom]);

  useEffect(() => {
    return () => ctx?.inscrire(nom, null);
  }, [ctx, nom]);

  return { ref, onLayout };
}

/** À poser une fois, autour de la navigation. */
export function TourProvider({ children }: { children: ReactNode }) {
  const [cibles, setCibles] = useState<Record<string, Rect>>({});
  const [relance, setRelance] = useState(0);

  const relancer = useCallback(() => setRelance((n) => n + 1), []);

  const inscrire = useCallback((nom: TourStep, rect: Rect | null) => {
    setCibles((prev) => {
      if (rect === null) {
        if (!(nom in prev)) return prev;
        const { [nom]: _, ...reste } = prev;
        return reste;
      }
      const ancien = prev[nom];
      // Sans cette comparaison, chaque `onLayout` rendrait un nouvel objet et
      // relancerait le rendu de tout l'arbre — en boucle.
      if (
        ancien &&
        ancien.x === rect.x &&
        ancien.y === rect.y &&
        ancien.width === rect.width &&
        ancien.height === rect.height
      ) {
        return prev;
      }
      return { ...prev, [nom]: rect };
    });
  }, []);

  const value = useMemo(
    () => ({ cibles, inscrire, relance, relancer }),
    [cibles, inscrire, relance, relancer],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

/**
 * Le bouton « revoir le guide » des Réglages.
 *
 * Efface la trace ET redémarre le guide tout de suite. Les deux, parce que
 * l'un sans l'autre trompe : effacer seul ne montre rien avant le prochain
 * lancement, relancer seul le ferait revenir une fois puis disparaître.
 */
export function useRestartGuide(): () => void {
  const ctx = useContext(TourContext);
  return useCallback(() => {
    void SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
    ctx?.relancer();
  }, [ctx]);
}

/** Efface la trace seule — sans relancer l'affichage. */
export async function resetGuide(): Promise<void> {
  await SecureStore.deleteItemAsync(STORAGE_KEY).catch(() => {});
}

const MARGE = 8;

export function OnboardingGuide() {
  const { t } = useTranslation();
  const c = useColors();
  const { width: ecranL, height: ecranH } = useWindowDimensions();
  const ctx = useContext(TourContext);
  const router = useRouter();

  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);

  // Lecture au montage. Tant qu'elle n'a pas répondu, rien ne s'affiche : un
  // guide qui apparaît puis disparaît est pire qu'un guide en retard.
  useEffect(() => {
    let annule = false;
    SecureStore.getItemAsync(STORAGE_KEY)
      .then((v) => {
        if (!annule && v === null) setVisible(true);
      })
      .catch(() => {
        /* stockage refusé : on ne montre rien plutôt que de le montrer
           à chaque lancement */
      });
    return () => {
      annule = true;
    };
  }, []);

  // Redemandé depuis les Réglages : on repart de la première étape.
  const relance = ctx?.relance ?? 0;
  const premiereRelance = useRef(relance);
  useEffect(() => {
    if (relance === premiereRelance.current) return;
    premiereRelance.current = relance;
    setIndex(0);
    setVisible(true);
  }, [relance]);

  const fermer = useCallback(() => {
    setVisible(false);
    void SecureStore.setItemAsync(STORAGE_KEY, new Date().toISOString()).catch(() => {});
  }, []);

  const etape = TOUR_STEPS[index];
  const rect = ctx?.cibles[etape] ?? null;

  /**
   * Amène l'étudiant sur l'écran de l'étape.
   *
   * `navigate` et non `push` : sinon quatre étapes empilent quatre écrans, et
   * le retour arrière fait remonter tout le guide à l'envers.
   */
  useEffect(() => {
    if (!visible) return;
    const route = ROUTES[etape];
    if (route) router.navigate(route as never);
  }, [visible, etape, router]);

  const suivant = useCallback(() => {
    if (index >= TOUR_STEPS.length - 1) fermer();
    else setIndex((i) => i + 1);
  }, [index, fermer]);

  // Une étape sans cible montée est sautée. L'onglet Unterlagen n'est pas à
  // l'écran quand le guide démarre sur l'accueil ; sans ce saut, l'étudiant
  // resterait devant un voile noir.
  useEffect(() => {
    if (!visible || rect) return;
    const timer = setTimeout(() => {
      if (index >= TOUR_STEPS.length - 1) fermer();
      else setIndex((i) => i + 1);
      // Plus long que sur le web : il faut le temps de changer d'écran ET que
      // `onLayout` ait mesuré la cible.
    }, 1200);
    return () => clearTimeout(timer);
  }, [visible, rect, index, fermer]);

  if (!visible || !rect) return null;

  const trou = {
    x: Math.max(0, rect.x - MARGE),
    y: Math.max(0, rect.y - MARGE),
    width: rect.width + MARGE * 2,
    height: rect.height + MARGE * 2,
  };

  // La bulle se place au-dessus quand la cible est dans la moitié basse — le
  // cas de la barre d'onglets, qui est justement l'étape 1.
  const dessous = trou.y + trou.height < ecranH / 2;
  const largeur = Math.min(340, ecranL - 32);
  const gauche = Math.min(
    Math.max(16, trou.x + trou.width / 2 - largeur / 2),
    Math.max(16, ecranL - largeur - 16),
  );

  const dernier = index === TOUR_STEPS.length - 1;
  const voile = "rgba(0,0,0,0.72)";

  return (
    <Modal visible transparent animationType="fade" onRequestClose={fermer}>
      {/* Les quatre pans d'ombre. Chacun est pressable et ferme le guide :
          toucher à côté doit toujours faire quelque chose de prévisible. */}
      <Pressable
        onPress={fermer}
        accessibilityLabel={t("guide.skip")}
        style={[styles.pan, { top: 0, left: 0, right: 0, height: trou.y, backgroundColor: voile }]}
      />
      <Pressable
        onPress={fermer}
        accessibilityLabel={t("guide.skip")}
        style={[
          styles.pan,
          { top: trou.y + trou.height, left: 0, right: 0, bottom: 0, backgroundColor: voile },
        ]}
      />
      <Pressable
        onPress={fermer}
        accessibilityLabel={t("guide.skip")}
        style={[
          styles.pan,
          { top: trou.y, left: 0, width: trou.x, height: trou.height, backgroundColor: voile },
        ]}
      />
      <Pressable
        onPress={fermer}
        accessibilityLabel={t("guide.skip")}
        style={[
          styles.pan,
          {
            top: trou.y,
            left: trou.x + trou.width,
            right: 0,
            height: trou.height,
            backgroundColor: voile,
          },
        ]}
      />

      {/* Le cadre lumineux autour du trou. Sans lui, la zone claire se lit
          comme un morceau d'écran oublié plutôt que comme une désignation. */}
      <View
        pointerEvents="none"
        style={[
          styles.cadre,
          {
            top: trou.y,
            left: trou.x,
            width: trou.width,
            height: trou.height,
            borderColor: c.signature,
          },
        ]}
      />

      <View
        accessibilityViewIsModal
        style={[
          styles.bulle,
          {
            width: largeur,
            left: gauche,
            backgroundColor: c.card,
            borderColor: c.border,
            ...(dessous
              ? { top: trou.y + trou.height + 14 }
              : { bottom: ecranH - trou.y + 14 }),
          },
        ]}
      >
        <View style={styles.entete}>
          <Text style={[styles.compteur, { color: c.signature }]}>
            {index + 1}/{TOUR_STEPS.length}
          </Text>
          <Text
            accessibilityRole="header"
            style={[styles.titre, { color: c.foreground }]}
          >
            {t(`guide.${etape}Title`)}
          </Text>
          <Pressable onPress={fermer} hitSlop={12} accessibilityLabel={t("guide.skip")}>
            <Ionicons name="close" size={18} color={c.mutedForeground} />
          </Pressable>
        </View>

        <Text style={[styles.corps, { color: c.mutedForeground }]}>
          {t(`guide.${etape}Body`)}
        </Text>

        <View style={styles.actions}>
          <Pressable onPress={fermer} hitSlop={8}>
            <Text style={[styles.passer, { color: c.mutedForeground }]}>
              {t("guide.skip")}
            </Text>
          </Pressable>

          {index > 0 ? (
            <Button
              label={t("guide.back")}
              variant="ghost"
              size="sm"
              onPress={() => setIndex((i) => Math.max(0, i - 1))}
            />
          ) : null}

          <Button
            label={dernier ? t("guide.done") : t("guide.next")}
            size="sm"
            haptic
            onPress={suivant}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  pan: { position: "absolute" },
  cadre: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: Radius.md,
  },
  bulle: {
    position: "absolute",
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    gap: Space.sm,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  entete: { flexDirection: "row", alignItems: "flex-start", gap: Space.sm },
  compteur: { fontSize: FontSize.xs, fontWeight: "700", fontVariant: ["tabular-nums"] },
  titre: { flex: 1, fontSize: FontSize.md, fontWeight: "600", lineHeight: 20 },
  corps: { fontSize: FontSize.sm, lineHeight: 20 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
    marginTop: Space.xs,
  },
  passer: { fontSize: FontSize.xs, textDecorationLine: "underline", marginRight: "auto" },
});
