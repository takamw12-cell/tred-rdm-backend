/**
 * Ce que l'appareil peut afficher en 3D (Explorateur, 19 nov. 2026).
 *
 *   high    ordinateur : rendu complet (ombres, occlusion, bloom, HDR)
 *   mobile  téléphone ou tablette correcte : sans post-traitement, ombre au
 *           sol réduite, définition plafonnée à 1,5×
 *   low     appareil modeste (≤ 3 Go de mémoire, ou ≤ 4 cœurs au doigt) :
 *           image fixe d'abord, 3D seulement sur demande, rendu minimal
 *   none    pas de WebGL 2 : image fixe seulement
 *
 * Pur et injectable pour les tests ; ne lève jamais.
 */
export type DeviceTier = "high" | "mobile" | "low" | "none";

export interface DeviceSignals {
  webgl2: boolean;
  /** navigator.deviceMemory (Go), absent sur Safari et Firefox. */
  memory?: number;
  cores?: number;
  coarsePointer: boolean;
  /** Économiseur de données activé. */
  saveData?: boolean;
}

export function tierOf(s: DeviceSignals): DeviceTier {
  if (!s.webgl2) return "none";
  const lowMemory = typeof s.memory === "number" && s.memory <= 3;
  const fewCores = typeof s.cores === "number" && s.cores <= 4;
  if (lowMemory || s.saveData || (s.coarsePointer && fewCores)) return "low";
  return s.coarsePointer ? "mobile" : "high";
}

let cached: DeviceTier | null = null;

export function deviceTier(): DeviceTier {
  if (cached) return cached;
  if (typeof window === "undefined") return "high";
  let webgl2 = false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    webgl2 = Boolean(gl);
    // On rend aussitôt le contexte d'essai : les téléphones en ont peu.
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webgl2 = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  cached = tierOf({
    webgl2,
    memory: nav.deviceMemory,
    cores: nav.hardwareConcurrency,
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
    saveData: nav.connection?.saveData,
  });
  return cached;
}

/** Réglages de rendu pour chaque niveau. */
export function renderSettings(tier: DeviceTier) {
  return {
    dpr: (tier === "high" ? [1, 2] : tier === "mobile" ? [1, 1.5] : [1, 1]) as [number, number],
    effects: tier === "high",
    contactShadowResolution: tier === "high" ? 512 : tier === "mobile" ? 256 : 0,
    environment: tier !== "low",
    powerPreference: (tier === "high" ? "high-performance" : "default") as WebGLPowerPreference,
    /** Matières standard sans GLSL greffé, métal atténué, lumière ciel/sol (explorer-kit.tsx). */
    safe: tier !== "high",
  };
}
