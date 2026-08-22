import { useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

import { registerForPushNotifications, unregisterPushNotifications } from "@/lib/push";

/**
 * Branche les notifications push sur le cycle de vie de l'application.
 *
 * À appeler UNE SEULE FOIS, dans le composant racine, et seulement lorsque
 * l'utilisateur est connecté : le token est associé à un compte côté serveur,
 * l'enregistrer avant la connexion l'attribuerait au mauvais utilisateur.
 *
 *   const { isSignedIn } = useSession();
 *   useNotifications(isSignedIn);
 */
export function useNotifications(enabled: boolean) {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  // 1. Enregistrement du terminal
  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      // Déconnexion : on retire le token pour que l'appareil cesse de recevoir
      // les Klausuren d'un compte auquel il n'appartient plus.
      const previous = tokenRef.current;
      if (previous) {
        void unregisterPushNotifications(previous);
        tokenRef.current = null;
        setToken(null);
      }
      return;
    }

    void registerForPushNotifications().then((result) => {
      if (cancelled || !result) return;
      tokenRef.current = result.token;
      setToken(result.token);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // 2. Notification reçue alors que l'application est ouverte
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((notification) => {
      // Utile pour rafraîchir une liste en arrière-plan, par exemple
      // l'historique des Klausuren. Volontairement discret : afficher une
      // bannière pour un contenu que l'utilisateur a déjà sous les yeux est
      // agaçant, et le handler de lib/push.ts s'en charge déjà.
      console.log("[push] reçue au premier plan", notification.request.content.title);
    });
    return () => sub.remove();
  }, []);

  // 3. L'utilisateur a appuyé sur la notification
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        savedId?: string;
        screen?: string;
      };

      // Le serveur envoie { type: "klausur_ready", savedId, screen: "exercises" }
      // — voir api/lib/push.ts → notifyExerciseReady.
      if (data?.type === "klausur_ready" || data?.type === "exercise_ready") {
        router.push("/(tabs)/exercises");
        return;
      }
      if (data?.type === "quota_reached") {
        router.push("/paywall");
        return;
      }
      if (data?.screen) router.push(`/(tabs)/${data.screen}` as never);
    });
    return () => sub.remove();
  }, [router]);

  // 4. L'app a été LANCÉE depuis une notification (elle était fermée)
  //    Ce cas n'est PAS couvert par le listener ci-dessus : au moment où
  //    l'événement est émis, le composant n'est pas encore monté.
  useEffect(() => {
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as {
        type?: string;
        savedId?: string;
      };
      if (data?.type === "klausur_ready" || data?.type === "exercise_ready") {
        router.push("/(tabs)/exercises");
      }
    });
  }, [router]);

  return { token };
}
