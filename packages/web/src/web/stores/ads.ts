import { create } from "zustand";
import { canShowInterstitial } from "@/lib/ad-mediation";

/**
 * File d'attente de l'interstitiel de fin de session.
 *
 * Une session qui se TERMINE (examen rendu, longue conversation quittée)
 * demande un interstitiel ; l'hôte (components/InterstitialAdScreen.tsx)
 * l'affiche sur la page suivante — jamais sur une page de travail — si la
 * fréquence le permet. L'historique vit sur l'appareil (localStorage) : il
 * ne sert qu'à espacer les écrans, pas à suivre qui que ce soit.
 */
export type InterstitialReason = "exam_end" | "long_chat";

const KEY = "tred-ad-interstitials";

function readHistory(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((n): n is number => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function writeHistory(h: number[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h.slice(-10)));
  } catch {
    /* navigation privée : l'espacement vaut pour cette visite seulement */
  }
}

interface AdState {
  /** Demandé par une session qui vient de se terminer. */
  pending: InterstitialReason | null;
  /** Affiché en ce moment. */
  showing: InterstitialReason | null;
  request: (reason: InterstitialReason) => void;
  /**
   * Transforme la demande en affichage si `allowed` (règle d'or + tarif) ET
   * si la fréquence le permet — l'affichage est alors noté dans
   * l'historique. Dans tous les cas la demande est consommée.
   */
  promote: (allowed: boolean) => void;
  dismiss: () => void;
}

export const useAdStore = create<AdState>()((set, get) => ({
  pending: null,
  showing: null,
  request: (reason) => set({ pending: reason }),
  promote: (allowed) => {
    const { pending, showing } = get();
    if (!pending || showing) return;
    const now = Date.now();
    const h = readHistory();
    if (allowed && canShowInterstitial(h, now)) {
      writeHistory([...h, now]);
      set({ pending: null, showing: pending });
    } else set({ pending: null });
  },
  dismiss: () => set({ showing: null }),
}));
