import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

import { client } from "./api"; // ← ton client oRPC mobile. Ajuste le chemin si besoin.

/**
 * Enregistrement du terminal pour les notifications push.
 *
 * Rien ici ne lève d'exception vers l'appelant : un refus d'autorisation ou une
 * panne réseau ne doit jamais empêcher l'application de démarrer. On renvoie
 * simplement `null` et on trace la raison.
 */

/** Comportement quand une notification arrive alors que l'app est au premier plan. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type PushRegistration = {
  token: string;
  platform: "ios" | "android";
};

/**
 * Demande l'autorisation, récupère le token Expo et l'envoie au serveur.
 * Retourne null si l'utilisateur refuse ou si l'on est sur un simulateur.
 */
export async function registerForPushNotifications(): Promise<PushRegistration | null> {
  // Un simulateur ne reçoit pas de push. Inutile de demander l'autorisation :
  // cela consommerait la seule occasion de la demander sur un vrai appareil.
  if (!Device.isDevice) {
    console.log("[push] simulateur détecté, enregistrement ignoré");
    return null;
  }

  try {
    // Android exige un canal, sinon les notifications sont silencieuses.
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "Standard",
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    // Ne redemander que si l'utilisateur n'a pas déjà tranché. iOS ne montre la
    // boîte de dialogue qu'une seule fois : une demande au mauvais moment
    // (au tout premier lancement, avant d'avoir montré la valeur de l'app)
    // est une autorisation perdue pour de bon.
    if (status !== "granted" && existing.canAskAgain) {
      const asked = await Notifications.requestPermissionsAsync();
      status = asked.status;
    }

    if (status !== "granted") {
      console.log("[push] autorisation refusée");
      return null;
    }

    // En build de production, projectId est OBLIGATOIRE, sinon cet appel lève
    // une exception. Il vient de app.json → extra.eas.projectId.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    if (!projectId) {
      console.warn("[push] projectId EAS introuvable — vérifie app.json → extra.eas.projectId");
    }

    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";

    await client.notifications.registerToken({
      token,
      platform,
      deviceName: Device.deviceName ?? undefined,
      appVersion: Constants.expoConfig?.version ?? undefined,
    });

    console.log("[push] terminal enregistré");
    return { token, platform };
  } catch (error) {
    console.warn("[push] enregistrement impossible", error);
    return null;
  }
}

/**
 * À appeler à la déconnexion. Sans cela, l'appareil continue de recevoir les
 * notifications de l'ancien compte — le serveur ne peut pas le deviner.
 */
export async function unregisterPushNotifications(token: string): Promise<void> {
  try {
    await client.notifications.unregisterToken({ token });
  } catch (error) {
    console.warn("[push] désinscription impossible", error);
  }
}
