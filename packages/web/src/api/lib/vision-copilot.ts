import { z } from "zod";

/**
 * Co-pilote vision (V2 — Pilier 3, FONDATIONS).
 *
 * L'étudiant partage son écran ou sa caméra ; le navigateur échantillonne
 * une image toutes les N secondes (web/lib/screen-capture.ts) et l'envoie à
 * POST /api/vision/frame, qui la passera à Claude Vision avec le contexte
 * de la conversation.
 *
 * ── Décisions déjà prises ─────────────────────────────────────────────────
 *
 *   • Pas de paquet en plus : getDisplayMedia / getUserMedia + un <canvas>
 *     suffisent pour échantillonner des images. LiveKit (déjà installé pour
 *     le professeur virtuel) ne sert que si on veut un jour du flux continu
 *     côté serveur — inutile pour 1 image toutes les 5–10 s.
 *   • Les images ne sont JAMAIS stockées : elles passent en mémoire vers le
 *     modèle et disparaissent. Pas d'S3, pas de base.
 *   • Bornes : JPEG/PNG/WebP, ≤ 1,5 Mo, ≤ 1600 px de large côté client,
 *     au plus 1 image toutes les 4 s par compte (le coût est par image).
 *   • Inerte sans ANTHROPIC_API_KEY (503), comme le reste.
 */

export const MAX_FRAME_BYTES = 1_500_000;
export const MIN_FRAME_INTERVAL_MS = 4000;

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/;

export const visionFrameSchema = z.object({
  /** data:image/jpeg;base64,… */
  image: z
    .string()
    .max(Math.ceil((MAX_FRAME_BYTES * 4) / 3) + 40)
    .regex(DATA_URL, "image must be a base64 data URL (jpeg, png, webp)"),
  mode: z.enum(["screen", "camera"]),
  /** Ce que l'étudiant demande en partageant (« Où est mon erreur ? »). */
  question: z.string().max(1000).optional(),
  conversationId: z.string().max(64).optional(),
  locale: z.string().max(8).optional(),
});
export type VisionFrameRequest = z.infer<typeof visionFrameSchema>;

/** Ce que le modèle rendra (forme prévue — pas encore produite). */
export interface VisionObservation {
  /** Ce que TRED voit, en une phrase (« Du stellst gerade das Momentengleichgewicht um A auf. »). */
  seen: string;
  /** Une erreur repérée, s'il y en a une — jamais la solution complète (règle d'or). */
  issue?: { where: string; hint: string };
  /** Faut-il interrompre l'étudiant maintenant ? Sinon TRED se tait. */
  speak: boolean;
}

/** Taille réelle d'une image data URL, en octets. */
export function dataUrlBytes(dataUrl: string): number {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}
