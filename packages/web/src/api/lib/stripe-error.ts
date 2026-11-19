/**
 * Le code d'une erreur Stripe, sans rien de secret : « url_invalid · success_url ».
 * Remonté jusqu'à la page de paiement (incident du 19 nov. 2026 : la page ne
 * disait que « réessaie plus tard » et la cause restait cachée).
 */
export function stripeErrorCode(error: unknown): string | null {
  const e = error as { code?: unknown; param?: unknown; type?: unknown } | null;
  if (!e || typeof e !== "object") return null;
  const code = typeof e.code === "string" ? e.code : typeof e.type === "string" ? e.type : null;
  if (!code) return null;
  const param = typeof e.param === "string" ? e.param : null;
  return [code, param].filter(Boolean).join(" · ").slice(0, 80);
}
