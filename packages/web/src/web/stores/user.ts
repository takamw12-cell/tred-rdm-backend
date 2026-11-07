import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlanId = "founder" | "free" | "standard" | "premium";

/** Niveau d'études : le tuteur adapte profondeur et rythme (api/lib/study-profile.ts). */
export const STUDY_LEVELS = ["school", "bachelor", "master", "phd"] as const;
export type StudyLevel = (typeof STUDY_LEVELS)[number];

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  university: string;
  degree: string;
  semester: string;
  /** Optionnel : les profils enregistrés avant nov. 2026 ne l'ont pas. */
  studyLevel?: StudyLevel | "";
  nativeLanguage: string;
  germanLevel: string;
}

interface UserState {
  onboarded: boolean;
  profile: Profile;
  plan: PlanId;
  germanMode: boolean;
  setProfile: (profile: Profile) => void;
  setPlan: (plan: PlanId) => void;
  setGermanMode: (v: boolean) => void;
  reset: () => void;
}

const defaultProfile: Profile = {
  firstName: "Wilfred",
  lastName: "Takam",
  email: "wilfred@aerostudy.ai",
  university: "fhAachen",
  degree: "Luft- und Raumfahrttechnik",
  semester: "3",
  studyLevel: "bachelor",
  nativeLanguage: "fr",
  germanLevel: "B1",
};

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      onboarded: false,
      profile: defaultProfile,
      plan: "founder",
      germanMode: true,
      setProfile: (profile) => set({ profile, onboarded: true }),
      setPlan: (plan) => set({ plan }),
      setGermanMode: (germanMode) => set({ germanMode }),
      reset: () => set({ onboarded: false, profile: defaultProfile, plan: "free" }),
    }),
    { name: "aerostudy-user" },
  ),
);
