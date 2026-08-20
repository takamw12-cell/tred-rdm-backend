import { orpc } from "../lib/api";

export const semestersListOptions = () => orpc.semesters.list.queryOptions();

export const semestersListKey = () => orpc.semesters.list.key();

export const semesterCreateOptions = () =>
  orpc.semesters.create.mutationOptions();

export const semesterRemoveOptions = () =>
  orpc.semesters.remove.mutationOptions();
