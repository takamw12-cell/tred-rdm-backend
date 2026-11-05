/**
 * Styles d'apprentissage (modèle VARK simplifié).
 *
 * Partagé entre la route des réglages (validation) et le tuteur (prompt).
 * Sans dépendance à la base : importable partout, y compris dans les tests.
 * La lecture en base est dans learning-style-store.ts.
 * `balanced` = aucun parti pris.
 *
 * Défaut : `interactive` (décision fondateur, 5 nov. 2026) — le tuteur pose
 * une question à chaque étape. Les lignes déjà en base restent telles quelles ;
 * migre-style-interactif.mjs bascule les « balanced » existants.
 */
export const LEARNING_STYLES = ["visual", "auditory", "text", "interactive", "balanced"] as const;
export type LearningStyle = (typeof LEARNING_STYLES)[number];

export const DEFAULT_LEARNING_STYLE: LearningStyle = "interactive";

export const isLearningStyle = (v: unknown): v is LearningStyle =>
  typeof v === "string" && (LEARNING_STYLES as readonly string[]).includes(v);
