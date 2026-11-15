import { orpc } from "../lib/api";

/**
 * Les documents d'un semestre — et, si un module (Fach) est donné, de ce module
 * seulement. Sans semestre : tous les documents du compte.
 */
export const documentsListOptions = (semesterId?: string | null, subjectId?: string | null) =>
  orpc.documents.list.queryOptions({
    input: { ...(semesterId ? { semesterId } : {}), ...(subjectId ? { subjectId } : {}) },
  });

/** Partial key matching every documents.list query regardless of input. */
export const documentsListKey = () => orpc.documents.list.key();

export const documentAssignOptions = () =>
  orpc.documents.assign.mutationOptions();

export const documentGetOptions = (id: string) =>
  orpc.documents.get.queryOptions({ input: { id } });

export const documentFileUrlOptions = (id: string) =>
  orpc.documents.fileUrl.queryOptions({ input: { id } });

export const documentCreateOptions = () =>
  orpc.documents.create.mutationOptions();

export const documentRemoveOptions = () =>
  orpc.documents.remove.mutationOptions();

export const documentRemoveManyOptions = () =>
  orpc.documents.removeMany.mutationOptions();
