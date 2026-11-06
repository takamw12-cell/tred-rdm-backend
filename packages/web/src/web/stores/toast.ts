import { create } from "zustand";

/**
 * Notifications éphémères (« Danke für dein Feedback! »). Volontairement
 * minimal : pas de dépendance, une file courte, disparition automatique.
 * Affichées par <Toaster /> (components/toaster.tsx), monté dans le layout.
 */
export type ToastTone = "success" | "error";
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: Toast[];
  show: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
const DURATION_MS = 4000;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, tone = "success") => {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-2), { id, message, tone }] });
    setTimeout(() => get().dismiss(id), DURATION_MS);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/** Raccourci hors composant : `toast("…")`. */
export const toast = (message: string, tone?: ToastTone) => useToastStore.getState().show(message, tone);
