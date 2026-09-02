import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/lib/api";

/** L'historique des conversations. */
export function useConversations() {
  return useQuery({
    ...orpc.chats.list.queryOptions(),
    staleTime: 15_000,
  });
}

/**
 * Une conversation.
 *
 * `id` peut être absent : l'écran de chat sert aussi à une conversation neuve,
 * qui n'a pas encore d'identifiant. Dans ce cas la requête ne part pas —
 * `enabled: false` — plutôt que d'appeler le serveur avec une chaîne vide et
 * de recevoir une erreur qu'il faudrait ensuite masquer.
 */
export function useConversation(id: string | undefined) {
  return useQuery({
    ...orpc.chats.get.queryOptions({ input: { id: id ?? "" } }),
    enabled: !!id,
  });
}

/**
 * Enregistrement.
 *
 * Le serveur crée ou met à jour selon la présence de l'identifiant. On
 * invalide la liste au succès : sans cela, une conversation neuve n'apparaît
 * dans l'historique qu'au prochain lancement de l'application.
 */
export function useSaveConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    ...orpc.chats.save.mutationOptions(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orpc.chats.list.queryKey() });
    },
  });
}
