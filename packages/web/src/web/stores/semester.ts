import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SemesterState {
  /** Currently active semester id, or null for "all courses". */
  activeId: string | null;
  setActive: (id: string | null) => void;
  /**
   * Remet `activeId` à null s'il ne fait plus partie des semestres réels.
   * Le store est persisté dans le localStorage : un semestre supprimé (ou
   * appartenant à un autre compte sur le même navigateur) y survit, et filtre
   * alors le dashboard sur un id qui ne renvoie rien.
   */
  reconcile: (validIds: string[]) => void;
}

export const useSemesterStore = create<SemesterState>()(
  persist(
    (set, get) => ({
      activeId: null,
      setActive: (activeId) => set({ activeId }),
      reconcile: (validIds) => {
        const { activeId } = get();
        if (activeId !== null && !validIds.includes(activeId)) set({ activeId: null });
      },
    }),
    { name: "aerostudy-semester" },
  ),
);
