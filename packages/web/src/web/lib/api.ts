import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { AppRouterClient } from "../../api";

/**
 * Antwortet der Server mit 403 ACCOUNT_DISABLED, ist der Zugang gesperrt
 * worden, während die Anwendung offen war. Dann hilft kein Fehlerdialog:
 * die Seite lädt neu und landet bei der Anmeldung, weil die Sitzung
 * serverseitig bereits gelöscht ist.
 */
async function fetchWithAccessGuard(
  input: Request | URL | string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 403) {
    const body = await res.clone().text();
    if (body.includes("ACCOUNT_DISABLED")) {
      window.location.href = "/";
      // Der Aufrufer soll nicht weiterarbeiten, während neu geladen wird.
      throw new Error("ACCOUNT_DISABLED");
    }
  }
  return res;
}

const link = new RPCLink({
  url: `${window.location.origin}/api/rpc`,
  // Session auth rides on the better-auth cookie (same-origin fetch sends it
  // automatically) — no bearer token needed since the Runable plugin removal.
  fetch: fetchWithAccessGuard,
});

/** Direct typed client: await client.ping() */
export const client: AppRouterClient = createORPCClient(link);

/** TanStack Query helpers: useQuery(orpc.ping.queryOptions()) */
export const orpc = createTanstackQueryUtils(client);
