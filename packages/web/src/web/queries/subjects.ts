import { orpc } from "@/lib/api";

/**
 * Les Fächer d'un semestre.
 *
 * `enabled` sur la présence du semestre : sans lui, la requête partirait avec
 * une chaîne vide dès que l'étudiant sélectionne « tous les cours », et le
 * serveur répondrait une liste vide — donc un écran qui clignote pour rien.
 */
export const subjectsListOptions = (semesterId: string | null | undefined) => ({
  ...orpc.subjects.list.queryOptions({ input: { semesterId: semesterId ?? "" } }),
  enabled: !!semesterId,
});

export const subjectsListKey = () => orpc.subjects.list.key();

export const subjectCreateOptions = () => orpc.subjects.create.mutationOptions();
export const subjectRenameOptions = () => orpc.subjects.rename.mutationOptions();
export const subjectRemoveOptions = () => orpc.subjects.remove.mutationOptions();
export const subjectAssignOptions = () => orpc.subjects.assign.mutationOptions();
