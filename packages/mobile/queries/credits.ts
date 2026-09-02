import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { orpc } from "@/lib/api";

/**
 * Le solde affiché par l'abzeichen : quota mensuel restant + crédits achetés.
 *
 * Pas de `staleTime` : ce nombre baisse à chaque question posée au tuteur.
 * Un solde périmé est pire qu'un solde absent — il fait croire à l'utilisateur
 * qu'il lui reste de quoi réviser.
 */
export function useCredits() {
  return useQuery({
    ...orpc.credits.me.queryOptions(),
    staleTime: 0,
  });
}

/**
 * À appeler quand une réponse du tuteur vient d'être consommée.
 *
 * Renvoyé mémorisé : l'écran de chat le place dans une dépendance d'effet, et
 * une fonction neuve à chaque rendu y provoquerait une boucle de requêtes.
 */
export function useInvalidateCredits() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: orpc.credits.me.queryKey() });
  }, [queryClient]);
}
