import { orpc } from "../lib/api";

export const chatsListOptions = () => orpc.chats.list.queryOptions();
export const chatsListKey = () => orpc.chats.list.key();

export const chatGetOptions = (id: string) =>
  orpc.chats.get.queryOptions({ input: { id } });

export const chatSaveOptions = () => orpc.chats.save.mutationOptions();
export const chatRemoveOptions = () => orpc.chats.remove.mutationOptions();

export const chatsTrashListOptions = () => orpc.chats.listTrash.queryOptions();
export const chatsTrashListKey = () => orpc.chats.listTrash.key();

export const chatRestoreOptions = () => orpc.chats.restore.mutationOptions();
export const chatPurgeOptions = () => orpc.chats.purge.mutationOptions();
export const chatEmptyTrashOptions = () => orpc.chats.emptyTrash.mutationOptions();

export const chatRemoveManyOptions = () => orpc.chats.removeMany.mutationOptions();
export const chatRestoreManyOptions = () =>
  orpc.chats.restoreMany.mutationOptions();
export const chatPurgeManyOptions = () => orpc.chats.purgeMany.mutationOptions();
