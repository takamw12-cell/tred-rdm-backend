import Constants from "expo-constants";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@template/web";

const baseUrl =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL;

const link = new RPCLink({
  url: `${baseUrl}/api/rpc`,
});

/** Direct typed client: await client.ping() */
export const client: AppRouterClient = createORPCClient(link);

/** TanStack Query helpers: useQuery(orpc.ping.queryOptions()) */
export const orpc = createTanstackQueryUtils(client);

/**
 * Requête HTTP brute vers l'API, cookie de session inclus.
 *
 * oRPC couvre tout ce qui est typé. L'envoi de fichiers ne l'est pas : il
 * passe par un `multipart/form-data` que `lib/upload.ts` construit lui-même.
 * D'où cette porte de sortie — la seule, et elle porte l'adresse et le cookie
 * pour que personne n'ait à les recoller à la main.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  // Import différé : `lib/auth-client` importe déjà `expo-constants` comme ce
  // fichier, et un import croisé au chargement du module ferait tourner les
  // deux en rond avant que l'un des deux soit prêt.
  const { authClient } = await import("@/lib/auth-client");

  const headers = new Headers(init.headers);
  const cookie = authClient.getCookie();
  if (cookie) headers.set("Cookie", cookie);

  return fetch(`${baseUrl}${path}`, { ...init, headers });
}
