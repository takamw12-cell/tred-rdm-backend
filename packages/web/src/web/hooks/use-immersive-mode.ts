import { useCallback, useEffect, useRef, useState } from "react";
import { createIdleTimer, type IdleTimer } from "@/lib/idle-timer";

/** Délai d'inactivité avant que l'interface s'efface (ms). */
export const IMMERSIVE_DELAY_MS = 15_000;

/**
 * Tout ce qui compte comme « l'étudiant est là », sur tous les appareils :
 * souris et clavier (ordinateur), toucher et glisser (téléphone, tablette),
 * stylet (`pointerdown`), molette, pavé tactile et défilement.
 */
const EVENTS = ["mousemove", "mousedown", "pointerdown", "touchstart", "touchmove", "keydown", "wheel", "scroll"] as const;

/** Une boîte de dialogue ou un menu ouvert : on n'efface pas l'interface dessous. */
function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]') !== null;
}

/**
 * Mode immersif : après `delayMs` sans souris, clavier ni toucher, `isImmersive`
 * passe à vrai (l'interface s'efface, il ne reste que le fond). La première
 * action la fait revenir. `enter()` force le mode tout de suite (bouton zen).
 *
 * `body[data-immersive]` permet au CSS d'effacer aussi ce qui vit hors du
 * layout (le bouton Pause du fond, monté dans un portail).
 */
export function useImmersiveMode({ enabled = true, delayMs = IMMERSIVE_DELAY_MS }: { enabled?: boolean; delayMs?: number } = {}) {
  const [isImmersive, setImmersive] = useState(false);
  const timer = useRef<IdleTimer | null>(null);

  useEffect(() => {
    if (!enabled) {
      setImmersive(false);
      return;
    }
    const t = createIdleTimer({ delayMs, onChange: setImmersive, canIdle: () => !overlayOpen() && !document.hidden });
    timer.current = t;

    // Chrome envoie un `mousemove` sans déplacement quand ce qui est sous le
    // curseur change (ici : l'interface qui s'efface). On ne compte que les
    // vrais déplacements, sinon le mode immersif s'annulerait lui-même.
    let lastX = -1;
    let lastY = -1;
    const onEvent = (e: Event) => {
      if (e.type === "mousemove") {
        const { clientX, clientY } = e as MouseEvent;
        if (clientX === lastX && clientY === lastY) return;
        lastX = clientX;
        lastY = clientY;
      }
      t.activity();
    };
    for (const name of EVENTS) document.addEventListener(name, onEvent, { passive: true });
    return () => {
      for (const name of EVENTS) document.removeEventListener(name, onEvent);
      t.dispose();
      timer.current = null;
    };
  }, [enabled, delayMs]);

  useEffect(() => {
    if (isImmersive) document.body.dataset.immersive = "true";
    else delete document.body.dataset.immersive;
    return () => {
      delete document.body.dataset.immersive;
    };
  }, [isImmersive]);

  const enter = useCallback(() => timer.current?.force(), []);
  return { isImmersive, enter };
}
