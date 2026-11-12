/**
 * Le profil d'études enregistré côté serveur (filière, Hochschule, semestre,
 * niveau, style d'apprentissage) et la règle de synchronisation avec le
 * navigateur. Module PUR : partagé par le serveur et l'interface, testé.
 *
 * Colonnes de `user_access` : studiengang, universitaet, semester, niveau,
 * learning_style, profile_updated_at (migre-profil-complet.mjs).
 */
import { z } from "zod";
import { LEARNING_STYLES } from "./learning-style";

export const STUDY_LEVEL_VALUES = ["", "school", "bachelor", "master", "phd"] as const;

/** Texte libre venu du navigateur : une ligne, sans caractères de contrôle, borné. */
const line = (max: number) =>
  z
    .string()
    .max(400)
    // eslint-disable-next-line no-control-regex
    .transform((v) => v.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max));

export const studyFieldsSchema = z.object({
  /** Filière : nom allemand de la liste, ou saisie libre (« Biophysik »). */
  degree: line(80),
  university: line(100),
  semester: line(20),
  studyLevel: z.enum(STUDY_LEVEL_VALUES),
});

/** Entrée de `account.updateProfile`. Le style d'apprentissage est facultatif. */
export const profileUpdateSchema = studyFieldsSchema.extend({
  learningStyle: z.enum(LEARNING_STYLES).optional(),
});

export type StudyFields = z.infer<typeof studyFieldsSchema>;
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export const EMPTY_STUDY: StudyFields = { degree: "", university: "", semester: "", studyLevel: "" };

/** Réponse de `account.getProfile`. */
export interface StoredProfile {
  /** Faux tant que migre-profil-complet.mjs n'a pas tourné : le navigateur garde la main. */
  migrated: boolean;
  /** Vrai dès que l'étudiant a enregistré son profil une fois. */
  saved: boolean;
  profile: StudyFields & { learningStyle: (typeof LEARNING_STYLES)[number] };
  updatedAt: number | null;
}

export function pickStudy(p: Partial<Record<keyof StudyFields, unknown>> | null | undefined): StudyFields {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  const level = s(p?.studyLevel);
  return {
    degree: s(p?.degree),
    university: s(p?.university),
    semester: s(p?.semester),
    studyLevel: (STUDY_LEVEL_VALUES as readonly string[]).includes(level) ? (level as StudyFields["studyLevel"]) : "",
  };
}

export const sameStudy = (a: StudyFields, b: StudyFields) =>
  a.degree === b.degree && a.university === b.university && a.semester === b.semester && a.studyLevel === b.studyLevel;

export const isEmptyStudy = (s: StudyFields) => sameStudy(s, EMPTY_STUDY);

/**
 * L'ancien profil de démonstration, identique dans tous les navigateurs
 * jusqu'en novembre 2026. Ce ne sont pas les études de l'étudiant : on ne
 * l'envoie jamais au serveur. (Une vraie étudiante de la FH Aachen a choisi
 * son école dans la liste, qui enregistre « FH Aachen », pas « fhAachen ».)
 */
export const isLegacyDemoStudy = (s: StudyFields) =>
  s.university === "fhAachen" && s.degree === "Luft- und Raumfahrttechnik" && s.semester === "3" && s.studyLevel === "bachelor";

export type SyncDecision =
  | { action: "keep" }
  /** Le serveur fait foi : le navigateur prend son profil. */
  | { action: "pull"; study: StudyFields }
  /** Premier enregistrement : le profil du navigateur monte au serveur. */
  | { action: "push"; study: StudyFields };

/**
 * À la connexion : qui a raison, le navigateur ou le serveur ?
 * - serveur pas encore migré → rien ne change ;
 * - le serveur a un profil → il gagne, sur tous les appareils ;
 * - le serveur n'en a pas → le profil du navigateur y est envoyé une fois,
 *   sauf s'il est vide ou si c'est l'ancien profil de démonstration.
 */
export function reconcileProfile(local: StudyFields, server: StoredProfile | null | undefined): SyncDecision {
  if (!server || !server.migrated) return { action: "keep" };
  if (server.saved) {
    const study = pickStudy(server.profile);
    return sameStudy(local, study) ? { action: "keep" } : { action: "pull", study };
  }
  if (isEmptyStudy(local) || isLegacyDemoStudy(local)) return { action: "keep" };
  return { action: "push", study: local };
}
