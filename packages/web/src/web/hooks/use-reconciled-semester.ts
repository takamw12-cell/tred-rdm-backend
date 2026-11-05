import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { semestersListOptions } from "@/queries/semesters";
import { useSemesterStore } from "@/stores/semester";

/**
 * Le semestre actif, garanti existant.
 *
 * `activeId` est persisté dans le localStorage : il peut viser un semestre
 * supprimé, ou celui d'un autre compte sur le même navigateur. Chaque page qui
 * filtre par semestre passe par ce hook plutôt que de lire le store brut.
 *
 * - Pendant le chargement, on renvoie la valeur du store telle quelle.
 * - Une fois `semesters.list` chargé AVEC SUCCÈS, un id inconnu est remis à
 *   null dans le store, et on renvoie null tout de suite (sans attendre le
 *   rendu suivant) : aucune requête ne part avec l'id obsolète.
 * - En cas d'erreur de chargement, on ne touche à rien : `data` serait vide
 *   et effacerait un choix valide.
 *
 * La requête est partagée par React Query : appeler ce hook dans plusieurs
 * composants ne multiplie pas les appels réseau.
 */
export function useReconciledSemester(): string | null {
  const activeId = useSemesterStore((s) => s.activeId);
  const reconcile = useSemesterStore((s) => s.reconcile);
  const { data, isSuccess } = useQuery(semestersListOptions());

  const validIds = isSuccess ? (data ?? []).map((s) => s.id) : null;
  const stale = validIds !== null && activeId !== null && !validIds.includes(activeId);

  useEffect(() => {
    if (validIds) reconcile(validIds);
    // validIds est dérivé de data : on dépend de data, pas du tableau recréé.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, data, reconcile]);

  return stale ? null : activeId;
}
