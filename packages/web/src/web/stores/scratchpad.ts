import { create } from "zustand";
import { persist } from "zustand/middleware";

// Persistent scratchpad / brouillon next to the chat. Autosaves to
// localStorage so a student never loses their working-out on reload.
interface ScratchpadState {
  content: string;
  setContent: (content: string) => void;
  clear: () => void;
}

export const useScratchpadStore = create<ScratchpadState>()(
  persist(
    (set) => ({
      content: "",
      setContent: (content) => set({ content }),
      clear: () => set({ content: "" }),
    }),
    { name: "aerostudy-scratchpad" },
  ),
);
