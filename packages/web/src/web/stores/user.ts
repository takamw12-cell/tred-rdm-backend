import { create } from "zustand";
import { persist } from "zustand/middleware";

export type PlanId = "founder" | "free" | "standard" | "premium";

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  university: string;
  degree: string;
  semester: string;
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
