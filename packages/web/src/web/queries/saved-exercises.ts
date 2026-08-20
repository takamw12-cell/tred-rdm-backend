import { orpc } from "../lib/api";

export const savedExercisesListOptions = (semesterId?: string | null) =>
  orpc.savedExercises.list.queryOptions({
    input: semesterId ? { semesterId } : {},
  });

/** Partial key matching every savedExercises.list query regardless of input. */
export const savedExercisesListKey = () => orpc.savedExercises.list.key();

export const savedExerciseGetOptions = (id: string) =>
  orpc.savedExercises.get.queryOptions({ input: { id } });

export const savedExerciseRemoveOptions = () =>
  orpc.savedExercises.remove.mutationOptions();
