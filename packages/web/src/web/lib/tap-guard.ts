/**
 * Clic ou glissé ? (2026-11-16)
 *
 * Three.js ne donne que la distance entre l'appui et le relâchement. Un doigt
 * qui fait tourner le modèle puis revient à son point de départ passait donc
 * pour un clic et choisissait une pièce. Ici on additionne tout le CHEMIN
 * parcouru depuis l'appui : au-delà de quelques pixels, c'est un glissé.
 */
export const TAP_MAX_TRAVEL = 8;

export function travelTracker() {
  let travel = 0;
  let last: [number, number] | null = null;
  return {
    down(x: number, y: number) {
      travel = 0;
      last = [x, y];
    },
    move(x: number, y: number) {
      if (!last) return;
      travel += Math.hypot(x - last[0], y - last[1]);
      last = [x, y];
    },
    up() {
      last = null;
    },
    /** Le dernier geste a-t-il été un glissé ? Reste vrai jusqu'au prochain appui. */
    dragged: () => travel > TAP_MAX_TRAVEL,
  };
}

const tracker = travelTracker();
if (typeof window !== "undefined") {
  // En phase de capture : OrbitControls garde le pointeur pour lui, mais l'événement passe d'abord ici.
  window.addEventListener("pointerdown", (e) => tracker.down(e.clientX, e.clientY), true);
  window.addEventListener("pointermove", (e) => tracker.move(e.clientX, e.clientY), true);
  window.addEventListener("pointerup", () => tracker.up(), true);
  window.addEventListener("pointercancel", () => tracker.up(), true);
}

/** À appeler dans un `onClick` de la scène : vrai si le geste qui vient de finir était un glissé. */
export const draggedSinceDown = () => tracker.dragged();
