import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/api";

/**
 * Les documents de l'étudiant.
 *
 * `staleTime` à trente secondes : la liste change quand l'utilisateur envoie
 * ou supprime un fichier, et ces deux gestes invalident déjà le cache
 * eux-mêmes. Redemander à chaque fois qu'on revient sur l'onglet ne
 * rapporterait rien et coûterait une requête sur un réseau d'amphithéâtre.
 */
export function useDocuments() {
  return useQuery({
    ...orpc.documents.list.queryOptions(),
    staleTime: 30_000,
  });
}

/**
 * Suppression.
 *
 * On invalide la liste ET le plan : le quota de documents baisse aussi, et
 * l'écran affiche « 7 sur 10 » juste à côté. Deux choses qui changent
 * ensemble doivent être redemandées ensemble, sinon l'une des deux ment.
 */
export function useRemoveDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.documents.remove.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.documents.list.queryKey() });
      void queryClient.invalidateQueries({ queryKey: orpc.subscriptions.me.queryKey() });
    },
  });
}
