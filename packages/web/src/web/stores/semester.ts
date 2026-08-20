import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SemesterState {
  /** Currently active semester id, or null for "all courses". */
  activeId: string | null;
  setActive: (id: string | null) => void;
}

export const useSemesterStore = create<SemesterState>()(
  persist(
    (set) => ({
      activeId: null,
      setActive: (activeId) => set({ activeId }),
    }),
    { name: "aerostudy-semester" },
  ),
);
