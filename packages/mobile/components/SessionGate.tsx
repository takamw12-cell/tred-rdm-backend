import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useRouter, useSegments, useRootNavigationState } from "expo-router";
import { authClient } from "@/lib/auth-client";
import { useColors } from "@/hooks/use-colors";
import { useNotifications } from "@/hooks/use-notifications";

/**
 * Aiguillage entre les écrans connectés et les écrans d'authentification.
 *
 * Deux précautions qui évitent des bugs classiques d'expo-router :
 *
 * 1. **On attend que le navigateur soit monté** (`useRootNavigationState`).
 *    Rediriger avant produit l'erreur « Attempted to navigate before mounting
 *    the Root Layout », qui ne se reproduit qu'au démarrage à froid — donc
 *    jamais pendant le développement, toujours chez l'utilisateur.
 *
 * 2. **On attend la fin du chargement de session.** Sans ça, l'app affiche
 *    l'écran de connexion une fraction de seconde à chaque ouverture, même
 *    pour quelqu'un de connecté depuis des semaines.
 */
export function SessionGate({ children }: { children: React.ReactNode }) {
  const c = useColors();
  const router = useRouter();
  const segments = useSegments();
  const navState = useRootNavigationState();
  const { data: session, isPending } = authClient.useSession();

  const mounted = !!navState?.key;
  const signedIn = !!session?.user;

  // Le jeton push est rattaché à un COMPTE côté serveur. L'enregistrer avant
  // la connexion l'attribuerait au mauvais utilisateur ; à la déconnexion, le
  // hook le retire pour que l'appareil cesse de recevoir les notifications
  // d'un compte auquel il n'appartient plus.
  useNotifications(signedIn);
  const inAuthGroup = segments[0] === "(auth)";

  useEffect(() => {
    if (!mounted || isPending) return;

    if (!signedIn && !inAuthGroup) {
      router.replace("/(auth)/sign-in");
    } else if (signedIn && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [mounted, isPending, signedIn, inAuthGroup, router]);

  if (isPending) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
});
