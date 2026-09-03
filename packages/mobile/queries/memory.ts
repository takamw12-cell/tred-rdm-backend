import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/api";

/**
 * La file de révision.
 *
 * ── Pourquoi elle arrive seulement maintenant sur le téléphone ────────────
 *
 * La répétition espacée existait côté serveur et s'affichait sur le web. Le
 * mobile ne l'a jamais connue. Or les jetons de notification viennent
 * EXCLUSIVEMENT de l'application : la relance du soir serait donc arrivée sur
 * un téléphone incapable d'ouvrir ce qu'elle annonce.
 */

/** Les lacunes dues aujourd'hui. Pas de `staleTime` : on veut l'état du moment. */
export function useDueGaps() {
  return useQuery({
    ...orpc.memory.due.queryOptions({ input: {} }),
    staleTime: 0,
  });
}

/**
 * Enregistre une révision.
 *
 * `ok: true` double l'intervalle — 1, 2, 4, 8, 16, 32, 64 jours — et au-delà
 * de soixante jours la lacune cesse de revenir. `ok: false` la ramène à
 * demain et remet le compteur de réussites à zéro.
 */
export function useReviewGap() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.memory.review.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.memory.due.queryKey({ input: {} }) });
    },
  });
}
