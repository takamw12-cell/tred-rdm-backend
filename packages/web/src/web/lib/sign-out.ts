import type { QueryClient } from "@tanstack/react-query";

import { authClient } from "@/lib/auth";
import { forgetProfile } from "@/lib/profile-sync";
import { useSemesterStore } from "@/stores/semester";
import { useUserStore } from "@/stores/user";

/**
 * Ce qui doit disparaître du navigateur quand un étudiant se déconnecte.
 * Séparé de l'appel réseau pour être testable.
 *
 * - le profil local (nom, école, filière, plan) : remis à vide ;
 * - le semestre actif : il appartient au compte qui part ;
 * - la synchronisation du profil : oubliée, la prochaine connexion relit le
 *   serveur (lib/profile-sync.ts, appelée par Gate dans app.tsx).
 */
export function clearLocalAccount(): void {
  forgetProfile();
  useUserStore.getState().reset();
  useSemesterStore.getState().setActive(null);
}

/**
 * Déconnexion complète. Le nettoyage local a lieu même si le serveur ne
 * répond pas : sur un ordinateur partagé, rien du compte ne doit rester.
 */
export async function signOutEverywhere(qc: QueryClient): Promise<void> {
  try {
    await authClient.signOut();
  } finally {
    clearLocalAccount();
    qc.clear();
  }
}
