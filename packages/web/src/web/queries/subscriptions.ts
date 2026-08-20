import { orpc } from "../lib/api";

/** Tarif, Limits und Verbrauch des angemeldeten Kontos — Quelle der Wahrheit. */
export const subscriptionMeOptions = () => orpc.subscriptions.me.queryOptions();

/** Schlüssel zum gezielten Neuladen nach Rückkehr von Stripe. */
export const subscriptionMeKey = () => orpc.subscriptions.me.key();
