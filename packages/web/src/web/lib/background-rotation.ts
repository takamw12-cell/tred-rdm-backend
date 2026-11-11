/**
 * La rotation du fond dynamique, sans DOM : quand changer d'image, et quand
 * le fond est en pause. Testé dans tests/background-rotation.test.ts.
 *
 * ── Pourquoi une horloge et pas un simple setInterval(10 s) ───────────────
 *
 * Sur téléphone et tablette, le navigateur suspend ou ralentit les minuteurs
 * dès que l'onglet passe à l'arrière-plan, et iOS ne signale pas toujours le
 * retour (`visibilitychange` manquant après un changement d'app). Un
 * intervalle arrêté au départ et jamais relancé laissait le fond figé.
 *
 * Ici, un battement court demande à chaque fois « est-il temps ? » en
 * comparant l'heure au dernier changement. Peu importe combien de battements
 * le système a sautés : au premier qui passe, l'image change.
 */

/** Battement de contrôle (ms). Court : c'est lui qui rattrape un minuteur suspendu. */
export const ROTATION_TICK_MS = 1_000;
/** Au-delà, un chargement d'image est abandonné : la rotation ne reste jamais bloquée dessus. */
export const PRELOAD_TIMEOUT_MS = 6_000;
/** Au-delà, un fondu « en cours » est considéré comme perdu. */
export const BUSY_TIMEOUT_MS = 9_000;

/**
 * Le fond n'est en pause que si l'utilisateur l'a demandé (bouton Pause, choix
 * retenu sur l'appareil).
 *
 * Avant le 2026-11-11, le réglage système « réduire les animations » le
 * mettait aussi en pause : sur les téléphones et tablettes où il est actif
 * (souvent avec l'économie d'énergie), le fond restait figé sur la première
 * image, sans que rien ne l'explique. Un fondu d'opacité toutes les 10 s n'est
 * pas un mouvement ; le bouton Pause reste là pour qui veut l'arrêter.
 */
export function pausedFromStorage(saved: string | null): boolean {
  return saved === "1";
}

/** Faut-il passer à l'image suivante maintenant ? */
export function shouldRotate(s: { now: number; lastSwitch: number; rotateMs: number; hidden: boolean; paused: boolean; imageCount: number }): boolean {
  if (s.paused || s.hidden || s.imageCount < 2) return false;
  return s.now - s.lastSwitch >= s.rotateMs;
}

/** Un fondu resté « en cours » trop longtemps (chargement perdu) ne bloque plus les suivants. */
export function busyExpired(busySince: number | null, now: number): boolean {
  return busySince !== null && now - busySince > BUSY_TIMEOUT_MS;
}
