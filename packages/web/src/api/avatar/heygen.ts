import { NotConfiguredError, type AvatarStage } from "./pipeline";

/**
 * Étage avatar HeyGen LiveAvatar — SQUELETTE.
 *
 * Fonctionnement prévu (mode « Avatar Only ») :
 *   1. Le backend demande à LiveAvatar un jeton de session éphémère avec
 *      HEYGEN_API_KEY + HEYGEN_AVATAR_ID (+ HEYGEN_VOICE_ID).
 *   2. Le navigateur ouvre la session avec @heygen/liveavatar-web-sdk : la
 *      vidéo arrive par LiveKit, gérée par LiveAvatar lui-même.
 *   3. Le texte du LLM est envoyé à la session et l'avatar le prononce.
 *
 * Les URL exactes des endpoints seront prises dans https://docs.liveavatar.com
 * le jour de l'activation. Je ne les écris pas de mémoire : l'API est jeune
 * (SDK 0.0.x) et change encore.
 *
 * NB : `@heygen/streaming-avatar` est DÉPRÉCIÉ par HeyGen au profit de
 * `@heygen/liveavatar-web-sdk` (installé).
 */
export const heygenConfigured = (): boolean =>
  Boolean(process.env.HEYGEN_API_KEY && process.env.HEYGEN_AVATAR_ID);

export function createHeygenAvatar(): AvatarStage {
  if (!heygenConfigured()) throw new NotConfiguredError("avatar (HeyGen)");
  // Branché à l'activation (étape C du guide).
  throw new NotConfiguredError("avatar (HeyGen) — implémentation à l'activation");
}
