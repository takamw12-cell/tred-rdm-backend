import Constants from "expo-constants";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "@template/web";
import { integrityHeaders } from "@/lib/app-integrity";

const baseUrl =
  Constants.expoConfig?.extra?.apiUrl ??
  process.env.EXPO_PUBLIC_API_URL;

const link = new RPCLink({
  url: `${baseUrl}/api/rpc`,
  // Le cookie de session (lu dans le trousseau) et l'intégrité de l'app.
  // Sans ce cookie, chaque appel typé partait sans session : audit MASVS du
  // 19 nov. 2026 (le chat et les envois le joignaient déjà eux-mêmes).
  headers: async () => {
    const { authClient } = await import("@/lib/auth-client");
    const headers: Record<string, string> = await integrityHeaders();
    const cookie = await authClient.getCookie();
    if (cookie) headers.Cookie = cookie;
    return headers;
  },
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
  for (const [k, v] of Object.entries(await integrityHeaders())) headers.set(k, v);
  // Depuis @better-auth/expo 1.7, le cookie se lit de façon asynchrone.
  const cookie = await authClient.getCookie();
  if (cookie) headers.set("Cookie", cookie);

  return fetch(`${baseUrl}${path}`, { ...init, headers });
}
