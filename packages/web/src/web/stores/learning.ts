import { create } from "zustand";
import { persist } from "zustand/middleware";

export type KnowState = "mastered" | "learning" | "new";

interface LearningState {
  // term id -> knowledge state (overrides the seeded default)
  termStates: Record<string, KnowState>;
  setTermState: (id: string, state: KnowState) => void;
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set) => ({
      termStates: {},
      setTermState: (id, state) =>
        set((s) => ({ termStates: { ...s.termStates, [id]: state } })),
    }),
    { name: "aerostudy-learning" },
  ),
);
