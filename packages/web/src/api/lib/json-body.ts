/**
 * Lire le corps JSON d'une requête sans jamais lever.
 *
 * `await c.req.json()` lève sur un corps tronqué ou vide : l'erreur remontait
 * jusqu'à `app.onError`, qui répondait 500 et prévenait Sentry — une fausse
 * alerte par requête mal formée (test de charge du 18 nov. 2026). Un corps
 * illisible est une faute du client : la route répond 400 `invalid_json`.
 *
 * Un JSON valide qui n'est pas un objet (« null », un nombre, une liste, une
 * chaîne) est refusé de la même façon : les routes lisent des champs.
 */
export type JsonObjectResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: "invalid_json" };

export async function readJsonObject(request: Request): Promise<JsonObjectResult> {
  try {
    const parsed: unknown = JSON.parse(await request.text());
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, error: "invalid_json" };
    return { ok: true, body: parsed as Record<string, unknown> };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}
