/**
 * Lit `/api/config` pour savoir si l'inscription exige un code d'invitation.
 *
 * Renvoie `true` UNIQUEMENT si le serveur a répondu correctement ET a dit
 * `inviteRequired: true`. Toute autre issue (réseau coupé, statut HTTP en
 * erreur, réponse non JSON, champ absent) renvoie `false` : le formulaire reste
 * ouvert. Ce n'est pas une faille — si la porte est réellement fermée, le
 * serveur refuse l'inscription sans code (403) de toute façon.
 *
 * L'erreur réelle est journalisée pour qu'on puisse diagnostiquer.
 */
export async function fetchInviteRequired(
  fetchFn: typeof fetch = fetch,
  url = "/api/config",
): Promise<boolean> {
  try {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
    const data = (await res.json()) as { inviteRequired?: unknown };
    return data.inviteRequired === true;
  } catch (err) {
    console.error("[signup-config] /api/config indisponible, inscription laissée ouverte :", err);
    return false;
  }
}
