import { db } from "../database";
import { avatarUsage } from "../database/schema";

/**
 * Estimation du coût d'une session « professeur virtuel ».
 *
 *   coût = secondes d'avatar × prix/s  +  caractères TTS × prix/caractère
 *
 * Les prix sont des ESTIMATIONS réglables par variables d'environnement, car
 * ils changent selon le fournisseur et l'abonnement (voir GUIDE_FOUNDER.md) :
 *
 *   AVATAR_PRICE_USD_PER_SEC    défaut 0.05  (tarif HeyGen « Avatar Realtime »
 *                               à l'usage. LiveAvatar Lite revient à ~0.0017 $/s)
 *   TTS_PRICE_USD_PER_1K_CHARS  défaut 0.10  (ElevenLabs, ordre de grandeur)
 *
 * Les défauts sont volontairement pessimistes : un budget surestimé ne fait
 * jamais de mauvaise surprise sur la facture.
 */

function priceFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw === undefined || raw === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function avatarPrices() {
  return {
    avatarUsdPerSec: priceFromEnv("AVATAR_PRICE_USD_PER_SEC", 0.05),
    ttsUsdPer1kChars: priceFromEnv("TTS_PRICE_USD_PER_1K_CHARS", 0.1),
  };
}

export interface AvatarSessionMeasure {
  /** Durée de streaming vidéo de l'avatar, en secondes. */
  durationSec: number;
  /** Caractères envoyés au TTS. 0 si l'avatar fournit sa propre voix. */
  ttsChars: number;
}

/** Coût estimé en centimes de dollar, arrondi au centime supérieur. */
export function estimateAvatarCostCents(
  { durationSec, ttsChars }: AvatarSessionMeasure,
  prices = avatarPrices(),
): number {
  const sec = Math.max(0, durationSec);
  const chars = Math.max(0, ttsChars);
  const usd = sec * prices.avatarUsdPerSec + (chars / 1000) * prices.ttsUsdPer1kChars;
  return Math.ceil(usd * 100);
}

/**
 * Compteur à faire vivre pendant une session : on lui signale le texte parlé,
 * et à la fin il donne la mesure et le coût.
 */
export function createAvatarCostMeter(now: () => number = Date.now) {
  const startedAt = now();
  let ttsChars = 0;
  return {
    addSpokenText(text: string) {
      ttsChars += text.length;
    },
    measure(): AvatarSessionMeasure {
      return { durationSec: Math.round((now() - startedAt) / 1000), ttsChars };
    },
    costCents(): number {
      return estimateAvatarCostCents(this.measure());
    },
  };
}

/** Écrit une ligne dans `avatar_usage`. À appeler à la fin de chaque session. */
export async function logAvatarSession(userId: string, measure: AvatarSessionMeasure) {
  const costCents = estimateAvatarCostCents(measure);
  await db.insert(avatarUsage).values({
    id: crypto.randomUUID(),
    userId,
    durationSec: Math.round(measure.durationSec),
    ttsChars: measure.ttsChars,
    costCents,
  });
  return costCents;
}

/**
 * Coût estimé d'une image ou d'une vidéo générée (Replicate), en centimes.
 *
 *   MEDIA_IMAGE_PRICE_USD          défaut 0.003  (Flux Schnell, ordre de grandeur)
 *   MEDIA_VIDEO_PRICE_USD_PER_SEC  défaut 0.10   (pessimiste, tous modèles vidéo)
 */
export function estimateMediaCostCents(kind: "image" | "video", seconds = 0): number {
  const usd =
    kind === "image"
      ? priceFromEnv("MEDIA_IMAGE_PRICE_USD", 0.003)
      : Math.max(0, seconds) * priceFromEnv("MEDIA_VIDEO_PRICE_USD_PER_SEC", 0.1);
  return Math.ceil(usd * 100);
}
