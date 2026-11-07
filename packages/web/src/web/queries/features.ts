import { useQuery } from "@tanstack/react-query";

/**
 * Fonctions optionnelles disponibles sur ce serveur (GET /api/config).
 *
 * Un bouton dont la clé manque côté serveur est masqué : l'étudiant ne voit
 * que ce qui marche. Tant que la réponse n'est pas arrivée, rien n'est
 * proposé ; si /api/config échoue, on montre tout et le serveur répond
 * proprement au clic (« momentan nicht verfügbar »).
 */
export interface Features {
  videoSearch: boolean;
  explainerVideo: boolean;
}

const NONE: Features = { videoSearch: false, explainerVideo: false };
const ALL: Features = { videoSearch: true, explainerVideo: true };

export function useFeatures(): Features {
  const q = useQuery({
    queryKey: ["api-config"],
    queryFn: async () => {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(`config ${res.status}`);
      return (await res.json()) as { features?: Partial<Features> };
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  if (q.isError) return ALL;
  if (!q.data) return NONE;
  // Ancien serveur sans `features` : comportement d'avant, tout est affiché.
  return { ...ALL, ...q.data.features };
}
