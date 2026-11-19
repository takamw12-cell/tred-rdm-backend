import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * Chargement différé qui ne plante pas quand un morceau du code manque.
 *
 * Ce qui se passait (journaux du 15 et 16 nov. 2026, /explorer, sur téléphone) :
 * un fichier de code ne se télécharge pas (onglet ouvert avant un déploiement,
 * réseau mobile coupé). `installGlobalErrorReporting` intercepte alors
 * « vite:preloadError » et recharge la page — en annulant l'erreur. Vite rend
 * dans ce cas un module VIDE, et React plantait aussitôt :
 * « Cannot read properties of undefined (reading 'default') », écran
 * « Ein Problem ist aufgetreten » avant même le rechargement.
 *
 * Ici : un module vide veut dire « rechargement en cours ». On laisse le
 * chargement en attente (le sablier reste affiché) ; si rien ne se passe au
 * bout de 10 s, on lève une vraie erreur de chargement, que la barrière
 * reconnaît (lib/stale-build.ts) et explique.
 */
export const RELOAD_WAIT_MS = 10_000;

export function resilientImport<T>(load: () => Promise<T>, waitMs = RELOAD_WAIT_MS): () => Promise<T> {
  return async () => {
    const mod = await load();
    if (mod !== undefined && mod !== null) return mod;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    throw new Error("Failed to fetch dynamically imported module (la page ne s'est pas rechargée)");
  };
}

/** `React.lazy` avec le chargement ci-dessus. `pick` choisit l'export voulu quand ce n'est pas `default`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeLazy<C extends ComponentType<any>>(load: () => Promise<{ default: C }>): LazyExoticComponent<C>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeLazy<M, C extends ComponentType<any>>(load: () => Promise<M>, pick: (m: M) => C): LazyExoticComponent<C>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function safeLazy(load: () => Promise<any>, pick?: (m: any) => ComponentType<any>) {
  const safe = resilientImport(load);
  return lazy(async () => {
    const mod = await safe();
    return { default: pick ? pick(mod) : mod.default };
  });
}
