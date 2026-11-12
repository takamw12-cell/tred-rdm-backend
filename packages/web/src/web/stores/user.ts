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
  /**
   * Le compte auquel ce profil local appartient. Ce magasin vit dans le
   * navigateur (localStorage) : sans propriétaire, le compte suivant sur le
   * même appareil héritait du profil du précédent.
   */
  ownerId: string | null;
  setProfile: (profile: Profile) => void;
  setPlan: (plan: PlanId) => void;
  setGermanMode: (v: boolean) => void;
  /** À appeler dès que la session est connue : rattache ou vide le profil. */
  claim: (userId: string, email?: string | null) => void;
  reset: () => void;
}

/**
 * Profil VIDE. Jusqu'en novembre 2026, ces valeurs par défaut étaient un
 * profil de démonstration avec un vrai nom et le plan fondateur : tout nouveau
 * compte le voyait à la place de son propre nom. Ne jamais remettre ici de
 * nom, d'e-mail, d'école ou de plan réels.
 */
export const EMPTY_PROFILE: Profile = {
  firstName: "",
  lastName: "",
  email: "",
  university: "",
  degree: "",
  semester: "",
  studyLevel: "",
  nativeLanguage: "",
  germanLevel: "",
};

/** L'e-mail de l'ancien profil de démonstration : sert à le reconnaître pour l'effacer. */
const LEGACY_DEMO_EMAIL = "wilfred@aerostudy.ai";

type Persisted = Pick<UserState, "onboarded" | "profile" | "plan" | "germanMode" | "ownerId">;

const sameEmail = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Rattache le profil local au compte connecté. Fonction pure (testée).
 * - même compte : rien ne change ;
 * - autre compte : tout est vidé, rien ne passe d'un étudiant à l'autre ;
 * - profil d'avant cette règle (sans propriétaire) : les réglages d'études
 *   restent, le nom n'est gardé que si son e-mail est celui du compte.
 */
export function claimProfile(state: Persisted, userId: string, email?: string | null): Persisted {
  if (state.ownerId === userId) return state;
  if (state.ownerId) {
    return { ...state, onboarded: false, profile: EMPTY_PROFILE, plan: "free", ownerId: userId };
  }
  const keepName = sameEmail(state.profile.email, email);
  return {
    ...state,
    ownerId: userId,
    plan: "free",
    profile: keepName ? state.profile : { ...state.profile, firstName: "", lastName: "", email: "" },
  };
}

/** Efface l'ancien profil de démonstration resté dans le localStorage. Pure (testée). */
export function migrateUserState(persisted: unknown): Persisted {
  const s = (persisted ?? {}) as Partial<Persisted>;
  const profile = { ...EMPTY_PROFILE, ...(s.profile ?? {}) };
  if (profile.email === LEGACY_DEMO_EMAIL) {
    profile.firstName = "";
    profile.lastName = "";
    profile.email = "";
  }
  return {
    onboarded: s.onboarded ?? false,
    profile,
    // Le plan affiché vient du serveur (subscriptions.me), jamais d'ici.
    plan: "free",
    germanMode: s.germanMode ?? true,
    ownerId: s.ownerId ?? null,
  };
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      onboarded: false,
      profile: EMPTY_PROFILE,
      plan: "free",
      germanMode: true,
      ownerId: null,
      setProfile: (profile) => set({ profile, onboarded: true }),
      setPlan: (plan) => set({ plan }),
      setGermanMode: (germanMode) => set({ germanMode }),
      claim: (userId, email) => set((state) => claimProfile(state, userId, email)),
      reset: () => set({ onboarded: false, profile: EMPTY_PROFILE, plan: "free", ownerId: null }),
    }),
    { name: "aerostudy-user", version: 1, migrate: (persisted) => migrateUserState(persisted) as UserState },
  ),
);
