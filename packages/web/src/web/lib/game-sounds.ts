/**
 * Les deux sons des jeux : réussite (deux notes qui montent) et erreur (une
 * note grave). Fabriqués dans le navigateur (Web Audio) : aucun fichier son,
 * rien à télécharger. Le réglage « son coupé » reste sur cet appareil.
 */
const KEY = "tred.game.muted";
let ctx: AudioContext | null = null;

export function soundMuted(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
export function setSoundMuted(muted: boolean) {
  try {
    localStorage.setItem(KEY, muted ? "1" : "0");
  } catch {
    /* stockage refusé : le réglage ne tient que pour cette page */
  }
}

/** Les notes de chaque son : [fréquence en Hz, début en s, durée en s]. */
export const SOUNDS = {
  success: [
    [659.25, 0, 0.12],
    [987.77, 0.1, 0.22],
  ],
  error: [[196, 0, 0.28]],
} as const;

export function playSound(kind: keyof typeof SOUNDS) {
  if (soundMuted() || typeof window === "undefined" || !("AudioContext" in window)) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const [hz, at, len] of SOUNDS[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === "success" ? "sine" : "triangle";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + len + 0.02);
    }
  } catch {
    /* pas de son : le jeu continue */
  }
}
