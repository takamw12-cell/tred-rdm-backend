import { orpc } from "@/lib/api";

/**
 * La bibliothèque de cours partagée.
 *
 * `search` n'est activée qu'à partir de deux caractères : lancer une requête
 * sur la première lettre renvoie la moitié du catalogue et fait clignoter la
 * liste à chaque frappe.
 */
export const myCoursesOptions = () => orpc.courses.mine.queryOptions();
export const myCoursesKey = () => orpc.courses.mine.key();

export const courseSearchOptions = (q: string, university?: string) => ({
  ...orpc.courses.search.queryOptions({
    input: { q: q.trim(), university: university?.trim() || undefined },
  }),
  enabled: q.trim().length >= 2,
});

export const courseDocumentsOptions = (courseId: string | null | undefined) => ({
  ...orpc.courses.documents.queryOptions({ input: { courseId: courseId ?? "" } }),
  enabled: !!courseId,
});
export const courseDocumentsKey = () => orpc.courses.documents.key();

export const shareableOptions = () => orpc.courses.shareable.queryOptions();
export const shareableKey = () => orpc.courses.shareable.key();

export const courseCreateOptions = () => orpc.courses.create.mutationOptions();
export const courseJoinOptions = () => orpc.courses.join.mutationOptions();
export const courseLeaveOptions = () => orpc.courses.leave.mutationOptions();
export const courseShareOptions = () => orpc.courses.share.mutationOptions();
export const courseUnshareOptions = () => orpc.courses.unshare.mutationOptions();
