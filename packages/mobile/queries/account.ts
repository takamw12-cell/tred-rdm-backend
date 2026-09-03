import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/api";

/**
 * Le compte : langue, auskunft, effacement.
 *
 * Les trois routes existent depuis longtemps côté serveur
 * (`packages/web/src/api/routes/account.ts`). Rien ne les appelait depuis le
 * téléphone — c'est précisément ce qui rendait l'application irrecevable sur
 * Google Play, qui exige un chemin de suppression de compte DANS l'app.
 */

/** La langue enregistrée sur le serveur — celle des notifications push. */
export function useServerLocale() {
  return useQuery({
    ...orpc.account.getLocale.queryOptions(),
    staleTime: 5 * 60_000,
  });
}

/**
 * Enregistre la langue côté serveur.
 *
 * Le choix vit à deux endroits, et ce n'est pas une duplication : le stockage
 * local décide de ce qui s'affiche ici et maintenant, le serveur décide de la
 * langue de tout ce qui est produit SANS l'application — le texte d'une
 * notification, un courriel, le ton du tuteur. Les deux doivent bouger
 * ensemble ; c'est l'écran Réglages qui les tient d'accord.
 */
export function useSetServerLocale() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.account.setLocale.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: orpc.account.getLocale.queryKey(),
      });
    },
  });
}

/** DSGVO Art. 15 et 20 — l'export complet, en JSON. */
export function useDataExport() {
  return useMutation(orpc.account.dataExport.mutationOptions());
}

/** Les tables concernées par l'effacement — pour l'écran de confirmation. */
export function useDeletionScope() {
  return useQuery({
    ...orpc.account.deletionScope.queryOptions(),
    staleTime: Infinity,
  });
}

/**
 * DSGVO Art. 17 — l'effacement. IRRÉVERSIBLE.
 *
 * Aucune invalidation de cache ici, volontairement : après un effacement
 * réussi il n'y a plus de compte à interroger. L'écran déconnecte et vide le
 * cache d'un coup — relancer les requêtes produirait une volée de 401.
 */
export function useDeleteAccount() {
  return useMutation(orpc.account.deleteAccount.mutationOptions());
}
