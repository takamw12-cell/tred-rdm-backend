import { ORPCError } from "@orpc/server";

/**
 * Fonctionnalité fermée (décision du 12 nov. 2026).
 *
 * Le partage de documents entre étudiants est coupé : un polycopié est une
 * œuvre protégée (UrhG), et TRED ne doit jamais servir à le diffuser. Les
 * routes restent déclarées pour qu'un ancien client reçoive une réponse
 * claire (403 « Feature disabled ») plutôt qu'un 404 ambigu.
 */
export const FEATURE_DISABLED = "Feature disabled";

export function featureDisabled(): never {
  throw new ORPCError("FORBIDDEN", { message: FEATURE_DISABLED });
}
