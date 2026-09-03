// System-managed layout — extend in place, never rewrite from scratch.
// Keep the provider chain intact: ErrorBoundary → OneDollarStats → SafeArea → QueryClient.
// To switch navigation, replace only the <Slot /> line with <Stack /> or <Tabs />.
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nextProvider } from "react-i18next";
import { ErrorBoundary } from "../components/__ErrorBoundary";
import { OneDollarStatsProvider } from "../lib/__analytics";
import { isWeb, startWebSafeArea } from "../lib/__web-safe-area";
import { SessionGate } from "../components/SessionGate";
import { i18n, initI18n } from "../i18n";
import { ThemeProvider, useTheme } from "../lib/theme";
import appJson from "../app.json";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Une app mobile perd le réseau tout le temps (métro, amphi en sous-sol).
      // Deux tentatives avant d'afficher une erreur, mais jamais de boucle.
      retry: 2,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const applicationId = appJson.expo.extra.applicationId ?? "";
const hostname = applicationId ? `${applicationId}-mobile` : "localhost";

// L'écran de démarrage reste affiché tant que la langue n'est pas chargée.
// Sinon l'utilisateur voit un éclair d'allemand avant que le français
// s'applique — le genre de détail qui fait « pas fini ».
void SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isWeb) startWebSafeArea();
  }, []);

  useEffect(() => {
    let cancelled = false;
    initI18n()
      .catch(() => {
        /* i18next non initialisé : les libellés tomberont sur les clés,
           l'app reste utilisable. Mieux qu'un écran blanc. */
      })
      .finally(() => {
        if (cancelled) return;
        setReady(true);
        void SplashScreen.hideAsync().catch(() => {});
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) return null;

  return (
    <ErrorBoundary>
      {/* Runable analytics provider — do not remove, required for analytics tracking */}
      <OneDollarStatsProvider
        config={{
          hostname,
          collectorUrl: "https://r.lilstts.com/events",
          devmode: true,
        }}
      >
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <I18nextProvider i18n={i18n}>
              {/* Le thème enveloppe tout ce qui appelle `useColors()` — donc
                  SessionGate compris, qui peint déjà un fond avant le premier
                  écran. Le placer plus bas ferait clignoter le clair au
                  lancement pour qui a choisi le sombre. */}
              <ThemeProvider>
                <ThemedStatusBar />
                <SessionGate>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="(auth)" />
                    <Stack.Screen name="chat/[id]" />
                    <Stack.Screen
                      name="paywall"
                      options={{ presentation: "modal" }}
                    />
                    <Stack.Screen
                      name="credits"
                      options={{ presentation: "modal" }}
                    />
                    <Stack.Screen
                      name="review"
                      options={{ presentation: "modal" }}
                    />
                    <Stack.Screen
                      name="legal/[doc]"
                      options={{ presentation: "modal" }}
                    />
                  </Stack>
                </SessionGate>
              </ThemeProvider>
            </I18nextProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </OneDollarStatsProvider>
    </ErrorBoundary>
  );
}

/**
 * La barre d'état, accordée au thème choisi.
 *
 * `style="auto"` suit le réglage du SYSTÈME. Sur un téléphone en clair avec
 * l'app forcée en sombre, elle écrivait donc l'heure en noir sur un fond
 * presque noir. Elle lit maintenant le même thème que les écrans.
 */
function ThemedStatusBar() {
  const { scheme } = useTheme();
  return <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
}
