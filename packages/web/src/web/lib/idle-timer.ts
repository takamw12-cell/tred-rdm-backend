/**
 * Minuterie d'inactivité, sans DOM : la logique du mode immersif du Dashboard.
 *
 * Après `delayMs` sans activité, `onChange(true)` ; à la première activité,
 * `onChange(false)` et la minuterie repart. `force()` passe tout de suite en
 * mode inactif (bouton « mode zen ») : pendant `graceMs`, l'activité est
 * ignorée, sinon le clic qui vient de l'activer (et le mouvement de souris qui
 * le suit) l'annulerait aussitôt.
 *
 * `canIdle` permet de refuser l'inactivité (une boîte de dialogue ouverte) :
 * la minuterie repart simplement pour un tour.
 */
export interface IdleTimerOptions {
  delayMs: number;
  graceMs?: number;
  onChange: (idle: boolean) => void;
  canIdle?: () => boolean;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface IdleTimer {
  /** Une action de l'utilisateur : sort du mode inactif et relance la minuterie. */
  activity(): void;
  /** Passe en mode inactif sans attendre. */
  force(): void;
  /** Arrête tout (démontage). */
  dispose(): void;
  readonly idle: boolean;
}

export function createIdleTimer(options: IdleTimerOptions): IdleTimer {
  const {
    delayMs,
    graceMs = 800,
    onChange,
    canIdle = () => true,
    now = () => Date.now(),
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  } = options;

  let idle = false;
  let handle: unknown = null;
  let forcedAt = -Infinity;
  let disposed = false;

  const setIdle = (next: boolean) => {
    if (idle === next) return;
    idle = next;
    onChange(next);
  };

  const arm = () => {
    if (handle !== null) clearTimer(handle);
    handle = setTimer(() => {
      handle = null;
      if (disposed) return;
      if (canIdle()) setIdle(true);
      else arm();
    }, delayMs);
  };

  arm();

  return {
    activity() {
      if (disposed) return;
      if (now() - forcedAt < graceMs) return;
      setIdle(false);
      arm();
    },
    force() {
      if (disposed) return;
      forcedAt = now();
      if (handle !== null) clearTimer(handle);
      handle = null;
      setIdle(true);
    },
    dispose() {
      disposed = true;
      if (handle !== null) clearTimer(handle);
      handle = null;
    },
    get idle() {
      return idle;
    },
  };
}
