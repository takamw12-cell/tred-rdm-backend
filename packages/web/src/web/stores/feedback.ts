import { create } from "zustand";

/** Ouverture de la modale de feedback — partagée par le bouton flottant et la barre latérale. */
interface FeedbackUiState {
  open: boolean;
  openFeedback: () => void;
  close: () => void;
}

export const useFeedbackUi = create<FeedbackUiState>((set) => ({
  open: false,
  openFeedback: () => set({ open: true }),
  close: () => set({ open: false }),
}));
