import Constants from "expo-constants";
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";

/**
 * Le client d'authentification de l'application mobile.
 *
 * ── Pourquoi ce fichier a manqué si longtemps ─────────────────────────────
 *
 * `SessionGate`, le paywall et l'écran de chat l'importaient tous les trois.
 * Il n'existait pas. Metro s'arrêtait dessus : **aucun build ne pouvait
 * aboutir**, et l'erreur ne parlait ni d'authentification ni de session.
 *
 * ── Pourquoi le stockage sécurisé ─────────────────────────────────────────
 *
 * Un jeton de session dans `AsyncStorage` est lisible par n'importe quoi sur
 * un téléphone débridé. `SecureStore` s'appuie sur le trousseau iOS et sur
 * Keystore côté Android. Le surcoût est nul et la différence est réelle.
 *
 * Les variantes synchrones `getItem`/`setItem` sont exigées ici : le plugin
 * expo lit le cookie au moment de fabriquer la requête, pas avant.
 */

/** L'adresse du serveur. Deux sources : la config de l'app, puis l'environnement. */
export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
  "";

/**
 * Le schéma d'URL de l'application — `tred://`.
 *
 * Il sert au retour depuis le navigateur après un paiement ou une connexion
 * externe. Il est lu depuis `app.json` plutôt qu'écrit en dur : deux endroits
 * qui doivent rester d'accord finissent toujours par diverger.
 */
export const APP_SCHEME: string =
  (Constants.expoConfig?.scheme as string | undefined) ??
  (Constants.expoConfig?.extra?.scheme as string | undefined) ??
  "tred";

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storagePrefix: "tred",
      storage: {
        getItem: (key) => SecureStore.getItem(key),
        setItem: (key, value) => SecureStore.setItem(key, value),
      },
    }),
  ],
});

export type Session = typeof authClient.$Infer.Session;
