import { orpc } from "../lib/api";

export const documentsListOptions = (semesterId?: string | null) =>
  orpc.documents.list.queryOptions({
    input: semesterId ? { semesterId } : {},
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
