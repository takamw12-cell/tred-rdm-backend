import { orpc } from "../lib/api";

/**
 * Recherche globale. `semesterId` restreint au semestre courant ; sans lui, la
 * recherche porte sur tout le compte — c'est le comportement voulu par défaut,
 * puisqu'on cherche souvent justement ce qu'on ne retrouve plus.
 */
export const searchAllOptions = (q: string, semesterId?: string | null) =>
  orpc.search.all.queryOptions({
    input: semesterId ? { q, semesterId } : { q },
  });

export const searchAllKey = () => orpc.search.all.key();
