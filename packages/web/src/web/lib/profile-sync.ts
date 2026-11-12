/**
 * Synchronisation du profil d'études entre le navigateur et le serveur.
 *
 * Le store (stores/user.ts) reste la source de l'affichage : fond d'écran,
 * réglages et chat le lisent sans attendre le réseau. Ce module le garde
 * aligné sur `user_access` :
 *   - à la connexion, `hydrateProfile` lit le profil du compte et applique
 *     la règle de lib/stored-profile.ts (le serveur gagne s'il a un profil) ;
 *   - ensuite, tout changement du store (réglages, onboarding) part au
 *     serveur, une fois la frappe terminée.
 *
 * Deux garde-fous pour que les comptes ne se mélangent jamais :
 *   - rien n'est envoyé tant que le profil de CE compte n'a pas été lu
 *     (sinon le profil vide d'un changement de compte écraserait le sien) ;
 *   - une réponse qui arrive après un changement de compte est ignorée.
 *
 * Si le serveur ne répond pas ou n'est pas migré, le profil local sert tel
 * quel : l'app se comporte comme avant.
 */
import { client } from "@/lib/api";
import { useUserStore } from "@/stores/user";
import { pickStudy, reconcileProfile, sameStudy, type StudyFields } from "../../api/lib/stored-profile";

const SAVE_DELAY_MS = 700;

/** Le compte dont le profil serveur a été lu dans cet onglet. */
let hydratedFor: string | null = null;
/** Le dernier profil connu du serveur pour ce compte. */
let synced: StudyFields | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let subscribed = false;

const owner = () => useUserStore.getState().ownerId;
const localStudy = () => pickStudy(useUserStore.getState().profile);

async function push(userId: string, study: StudyFields): Promise<void> {
  if (owner() !== userId) return;
  try {
    const saved = await client.account.updateProfile(study);
    if (saved.migrated && owner() === userId) synced = pickStudy(saved.profile);
  } catch {
    // Hors ligne ou serveur en panne : le profil local reste, on réessaiera au prochain changement.
  }
}

function onStoreChange(): void {
  const userId = owner();
  // Pas encore lu pour ce compte : ne RIEN envoyer.
  if (!userId || hydratedFor !== userId || !synced) return;
  const study = localStudy();
  if (sameStudy(study, synced)) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (owner() === userId && hydratedFor === userId) void push(userId, localStudy());
  }, SAVE_DELAY_MS);
}

/** À appeler à la connexion, une fois le profil local rattaché au compte. */
export async function hydrateProfile(userId: string): Promise<void> {
  if (!subscribed) {
    subscribed = true;
    useUserStore.subscribe(onStoreChange);
  }
  if (hydratedFor === userId) return;
  // Changement de compte dans le même onglet : on oublie tout de l'ancien.
  clearTimeout(timer);
  hydratedFor = null;
  synced = null;
  let server;
  try {
    server = await client.account.getProfile();
  } catch {
    return;
  }
  if (owner() !== userId || !server.migrated) return;
  const decision = reconcileProfile(localStudy(), server);
  if (decision.action === "pull") {
    synced = decision.study;
    hydratedFor = userId;
    useUserStore.getState().applyServerStudy(decision.study);
    return;
  }
  synced = server.saved ? pickStudy(server.profile) : localStudy();
  hydratedFor = userId;
  if (decision.action === "push") await push(userId, decision.study);
}

/**
 * À la déconnexion : annule tout envoi en attente et oublie le compte lu.
 * La prochaine connexion relira le profil sur le serveur, même si c'est le
 * même compte.
 */
export function forgetProfile(): void {
  clearTimeout(timer);
  hydratedFor = null;
  synced = null;
}
