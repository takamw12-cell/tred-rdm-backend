import { describe, expect, test } from "bun:test";
import { createIdleTimer } from "../src/web/lib/idle-timer";

/** Horloge et minuteries simulées : aucun vrai délai dans les tests. */
function harness(options: { canIdle?: () => boolean } = {}) {
  let time = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  const changes: boolean[] = [];
  const timer = createIdleTimer({
    delayMs: 15_000,
    graceMs: 800,
    onChange: (idle) => changes.push(idle),
    canIdle: options.canIdle,
    now: () => time,
    setTimer: (fn, ms) => {
      timers.set(next, { at: time + ms, fn });
      return next++;
    },
    clearTimer: (h) => void timers.delete(h as number),
  });
  const advance = (ms: number) => {
    const end = time + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      time = due[1].at;
      due[1].fn();
    }
    time = end;
  };
  return { timer, changes, advance };
}

describe("createIdleTimer (mode immersif)", () => {
  test("devient inactif après 15 s sans activité, pas avant", () => {
    const { timer, changes, advance } = harness();
    advance(14_999);
    expect(timer.idle).toBe(false);
    advance(1);
    expect(timer.idle).toBe(true);
    expect(changes).toEqual([true]);
  });

  test("une activité relance les 15 s", () => {
    const { timer, advance } = harness();
    advance(10_000);
    timer.activity();
    advance(14_999);
    expect(timer.idle).toBe(false);
    advance(1);
    expect(timer.idle).toBe(true);
  });

  test("la première activité fait revenir l'interface, puis le cycle reprend", () => {
    const { timer, changes, advance } = harness();
    advance(15_000);
    timer.activity();
    expect(timer.idle).toBe(false);
    advance(15_000);
    expect(changes).toEqual([true, false, true]);
  });

  test("force() entre tout de suite et ignore l'activité pendant le délai de grâce", () => {
    const { timer, advance } = harness();
    timer.force();
    expect(timer.idle).toBe(true);
    advance(300);
    timer.activity(); // le mouvement de souris qui suit le clic sur le bouton
    expect(timer.idle).toBe(true);
    advance(600);
    timer.activity();
    expect(timer.idle).toBe(false);
  });

  test("n'efface pas l'interface quand canIdle refuse (boîte de dialogue ouverte)", () => {
    let dialog = true;
    const { timer, advance } = harness({ canIdle: () => !dialog });
    advance(15_000);
    expect(timer.idle).toBe(false);
    dialog = false;
    advance(15_000);
    expect(timer.idle).toBe(true);
  });

  test("dispose() arrête tout", () => {
    const { timer, changes, advance } = harness();
    timer.dispose();
    advance(60_000);
    timer.activity();
    timer.force();
    expect(changes).toEqual([]);
  });
});
