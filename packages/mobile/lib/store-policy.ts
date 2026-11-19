import { Platform } from "react-native";

/**
 * Ce que l'app a le droit de vendre, selon le magasin qui la distribue.
 *
 * App Store (règle 3.1.1) : un bien numérique — Pass, abonnement, crédits —
 * ne se vend dans une app iOS que par l'achat intégré d'Apple. TRED encaisse
 * par Stripe : sur iOS, l'app n'affiche donc AUCUN bouton d'achat, aucun prix
 * et aucun lien vers un paiement. La même règle interdit d'inviter à payer
 * ailleurs : le message affiché dit seulement que l'achat n'est pas possible
 * ici, sans adresse ni lien. Un compte qui a déjà un accès le garde et le
 * voit ; il ne peut simplement rien acheter depuis l'iPhone.
 *
 * Google Play (règle « Paiements ») : même principe — un bien numérique vendu
 * dans l'app doit passer par Google Play Billing. Décision du fondateur
 * (19 nov. 2026) : sur Android aussi, aucun achat, aucun prix, aucun lien.
 * Le message affiché est le même, sans adresse ni invitation à payer ailleurs.
 *
 * Seule la version web (navigateur) garde les achats Stripe.
 */
export function purchasesHiddenOn(os: string): boolean {
  return os === "ios" || os === "android";
}

export const purchasesHidden: boolean = purchasesHiddenOn(Platform.OS);
