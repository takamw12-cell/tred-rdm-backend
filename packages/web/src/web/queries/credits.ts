import { orpc } from "../lib/api";

/**
 * Le solde de l'étudiant : quota mensuel restant + crédits achetés.
 *
 * Le serveur sait tout faire depuis longtemps — deux cagnottes séparées, le
 * quota qui expire au mois et les crédits achetés qui n'expirent jamais,
 * dépensés dans le bon ordre. Rien, côté web, ne l'appelait.
 */
export const creditsMeOptions = () => orpc.credits.me.queryOptions();

/** Pour recharger après un achat, ou après une réponse du tuteur. */
export const creditsMeKey = () => orpc.credits.me.key();

/** L'historique — achats, consommations, remboursements. */
export const creditTransactionsOptions = (limit = 50) =>
  orpc.credits.transactions.queryOptions({ input: { limit } });
