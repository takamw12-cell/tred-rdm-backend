import { useMutation, useQuery } from "@tanstack/react-query";

import { orpc } from "@/lib/api";

/**
 * Le plan de l'étudiant : formule, quotas, offres, période d'essai.
 *
 * Une seule requête sert le paywall ET la limite de documents. C'est
 * volontaire : deux sources pour la même autorisation, c'est le jour où
 * l'écran dit « Premium » pendant que le serveur refuse.
 */
export function usePlan() {
  return useQuery({
    ...orpc.subscriptions.me.queryOptions(),
    staleTime: 30_000,
  });
}

/**
 * Ouvre un paiement Stripe et renvoie l'URL à afficher.
 *
 * Aucune invalidation ici, et c'est réfléchi : à cet instant l'utilisateur n'a
 * encore rien payé. Seul le webhook Stripe sait si la transaction a abouti.
 * L'écran redemande l'état au retour du navigateur.
 */
export function useCreateCheckout() {
  return useMutation(orpc.subscriptions.createCheckout.mutationOptions());
}

/** Le portail Stripe — changer de carte, résilier, télécharger les factures. */
export function useBillingPortal() {
  return useMutation(orpc.subscriptions.portal.mutationOptions());
}
