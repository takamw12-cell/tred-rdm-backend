import { create } from "zustand";
import type { PaywallMetric } from "@/lib/pricing-copy";

/**
 * La fenêtre de limite, ouvrable de partout.
 *
 * Le chat avait sa propre fenêtre ; les vidéos, les exercices et les
 * Formelsammlungen affichaient un simple « erreur ». Chaque surface qui
 * reçoit un 402 appelle maintenant `showPaywall` (lib/paywall.ts), et
 * <PaywallHost /> (monté dans le layout) affiche la même fenêtre partout.
 */
export interface PaywallInfo {
  metric: PaywallMetric;
  plan?: string;
  used?: number;
  limit?: number;
  /** Crédits nécessaires pour cette action ; null = non payable en crédits. */
  creditCost?: number | null;
  rewardedAd?: { seconds: number; credits: number } | null;
}

interface PaywallState {
  info: PaywallInfo | null;
  /** Relance l'action bloquée une fois le compte débloqué (essai, crédit). */
  retry: (() => void) | null;
  show: (info: PaywallInfo, retry?: () => void) => void;
  hide: () => void;
}

export const usePaywallStore = create<PaywallState>((set) => ({
  info: null,
  retry: null,
  show: (info, retry) => set({ info, retry: retry ?? null }),
  hide: () => set({ info: null, retry: null }),
}));
