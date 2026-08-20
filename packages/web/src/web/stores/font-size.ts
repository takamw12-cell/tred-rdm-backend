import { create } from "zustand";
import { persist } from "zustand/middleware";

// Accessibility reading-size control. Scales reading text (chat answers,
// dictionary, exercises, LaTeX) WITHOUT touching layout, spacing or diagrams —
// the scale is applied only to elements marked `.reading-scalable` via a
// `data-font-size` attribute on <html> (see styles.css).
export type FontSize = "small" | "medium" | "large";

interface FontSizeState {
  size: FontSize;
  setSize: (size: FontSize) => void;
}

export function applyFontSize(size: FontSize) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.fontSize = size;
}

export const useFontSizeStore = create<FontSizeState>()(
  persist(
    (set) => ({
      size: "small",
      setSize: (size) => {
        set({ size });
        applyFontSize(size);
      },
    }),
    {
      name: "aerostudy-font-size",
      onRehydrateStorage: () => (state) => {
        applyFontSize(state?.size ?? "small");
      },
    },
  ),
);
