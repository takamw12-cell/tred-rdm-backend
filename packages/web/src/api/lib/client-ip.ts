/**
 * D'où Better Auth lit l'adresse du visiteur — et ce qu'il n'en garde pas.
 *
 * ── Le défaut (constaté le 15 nov. 2026 dans les journaux de production) ────
 *
 * Better Auth limite /sign-in, /sign-up, /change-password… à 3 requêtes par
 * 10 secondes et PAR VISITEUR. Il reconnaît le visiteur à `x-forwarded-for`,
 * et depuis la 1.7.13 il ne croit cet en-tête que s'il porte UNE seule
 * adresse (la première d'une liste est celle que le visiteur peut écrire
 * lui-même). Derrière l'edge de Railway l'en-tête en porte plusieurs : Better
 * Auth ne reconnaissait donc personne et rangeait TOUT LE MONDE dans le même
 * compteur — « Rate limiting could not determine a client IP … single shared
 * per-path bucket ». Trois inscriptions dans les mêmes dix secondes, et la
 * quatrième personne était refusée.
 *
 * ── Le remède (validé par le fondateur le 15 nov. 2026) ─────────────────────
 *
 * `x-real-ip` : l'edge de Railway le pose lui-même, avec l'adresse du client,
 * une seule (documentation Railway, Networking → Specs & Limits : « X-Real-IP
 * for identifying client's remote IP »). L'équipe Railway le recommande pour
 * une limite de débit et dit que l'edge remplace celui qu'un visiteur
 * enverrait ; ses plages d'adresses de proxy ne sont pas publiées, ce qui
 * exclut `trustedProxies`.
 *
 * À revérifier après chaque changement d'hébergeur ou de CDN devant le site :
 * derrière un autre proxy, `x-real-ip` peut devenir l'adresse de ce proxy.
 */
export const AUTH_IP_ADDRESS: { ipAddressHeaders: string[] } = {
  ipAddressHeaders: ["x-real-ip"],
};

/**
 * Dès que Better Auth sait lire l'adresse du visiteur, il la range aussi dans
 * chaque ligne de `session` (colonne `ip_address`, vide jusqu'ici en
 * production). Rien dans l'app ne s'en sert : l'adresse compte les tentatives,
 * en mémoire, dix secondes. Rendu par le crochet `session.create.before` de
 * auth.ts, ceci la retire de la ligne avant l'écriture — on ne conserve pas
 * une donnée personnelle de plus pour corriger un compteur.
 */
export const SESSION_WITHOUT_IP = { data: { ipAddress: "" } };
