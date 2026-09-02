import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useColors } from "@/hooks/use-colors";
import { FontSize, Space } from "@/constants/theme";

/**
 * Le cadre de tous les écrans.
 *
 * `flush` retire les marges latérales : une liste qui défile doit pouvoir
 * toucher les bords, sinon ses séparateurs s'arrêtent en plein vide. Le titre,
 * lui, garde toujours sa marge — il se lit, il ne défile pas.
 *
 * Les encoches et la barre d'accueil sont gérées par `SafeAreaView`, avec
 * `edges` limité au haut : le bas est traité par la barre d'onglets, et
 * doubler la marge y creuse un trou blanc.
 */
export function Screen({
  title,
  flush = false,
  children,
}: {
  title?: string;
  /** Colle le contenu aux bords — pour les listes qui défilent. */
  flush?: boolean;
  children: ReactNode;
}) {
  const c = useColors();

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.root, { backgroundColor: c.background }]}
    >
      {title ? (
        <Text style={[styles.title, { color: c.foreground }]} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={[styles.body, !flush && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

/**
 * L'écran vide.
 *
 * Il accepte soit un `action` déjà construit, soit le couple `label` +
 * `onPress` : les deux formes existent dans les écrans, et refuser l'une des
 * deux obligerait à les réécrire sans rien y gagner.
 */
export function EmptyState({
  title,
  body,
  action,
  label,
  onPress,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  label?: string;
  onPress?: () => void;
}) {
  const c = useColors();

  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: c.foreground }]}>{title}</Text>
      {body ? (
        <Text style={[styles.emptyBody, { color: c.mutedForeground }]}>{body}</Text>
      ) : null}
      {action ?? null}
      {!action && label && onPress ? (
        <ButtonLazy label={label} onPress={onPress} />
      ) : null}
    </View>
  );
}

/**
 * Import différé, et pas un import direct : `Button` importe `useColors` comme
 * ce fichier, et un import croisé entre deux modules d'interface finit par se
 * mordre la queue le jour où l'un grossit.
 */
function ButtonLazy({ label, onPress }: { label: string; onPress: () => void }) {
  const { Button } = require("./Button") as typeof import("./Button");
  return <Button label={label} onPress={onPress} />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    fontSize: FontSize.xxl,
    fontWeight: "700",
    letterSpacing: -0.5,
    paddingHorizontal: Space.lg,
    paddingTop: Space.sm,
    paddingBottom: Space.md,
  },
  body: { flex: 1 },
  padded: { paddingHorizontal: Space.lg },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.xxl,
  },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: "600", textAlign: "center" },
  emptyBody: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: Space.sm,
  },
});
