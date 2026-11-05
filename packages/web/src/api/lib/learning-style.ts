/**
 * Styles d'apprentissage (modèle VARK simplifié).
 *
 * Partagé entre la route des réglages (validation) et le tuteur (prompt).
 * Sans dépendance à la base : importable partout, y compris dans les tests.
 * La lecture en base est dans learning-style-store.ts.
 * `balanced` = aucun parti pris : le comportement d'avant.
 */
export const LEARNING_STYLES = ["visual", "auditory", "text", "interactive", "balanced"] as const;
export type LearningStyle = (typeof LEARNING_STYLES)[number];

export const isLearningStyle = (v: unknown): v is LearningStyle =>
  typeof v === "string" && (LEARNING_STYLES as readonly string[]).includes(v);
