import { describe, expect, test } from "bun:test";
import {
  daysUntil,
  firstSchedule,
  MASTERED_AFTER_DAYS,
  nextSchedule,
} from "../src/api/lib/memory-schedule";

const T0 = new Date("2026-08-19T20:00:00.000Z");
const DAY = 86_400_000;
const at = (days: number) => new Date(T0.getTime() + days * DAY);

describe("le premier rendez-vous", () => {
  test("est fixé à demain, pas à tout de suite", () => {
    const s = firstSchedule(T0);
    expect(s.intervalDays).toBe(1);
    expect(s.dueAt.getTime()).toBe(T0.getTime() + DAY);
    expect(s.reviews).toBe(0);
    expect(s.status).toBe("open");
  });
});

describe("l'intervalle double à chaque réussite", () => {
  test("1 · 2 · 4 · 8 · 16 · 32 · 64", () => {
    const seen: number[] = [];
    let s = firstSchedule(T0);
    for (let i = 0; i < 7; i++) {
      seen.push(s.intervalDays);
      s = nextSchedule(s, true, at(i));
    }
    expect(seen).toEqual([1, 2, 4, 8, 16, 32, 64]);
  });

  test("le compteur de réussites suit", () => {
    let s = firstSchedule(T0);
    expect(s.reviews).toBe(0);
    s = nextSchedule(s, true, T0);
    expect(s.reviews).toBe(1);
    s = nextSchedule(s, true, T0);
    expect(s.reviews).toBe(2);
  });

  test("la date suit l'intervalle", () => {
    const s = nextSchedule({ intervalDays: 8, reviews: 3 }, true, T0);
    expect(s.intervalDays).toBe(16);
    expect(s.dueAt.getTime()).toBe(T0.getTime() + 16 * DAY);
  });
});

describe("un échec ramène à un jour", () => {
  test("l'intervalle retombe, quel qu'il fût", () => {
    const s = nextSchedule({ intervalDays: 32, reviews: 5 }, false, T0);
    expect(s.intervalDays).toBe(1);
    expect(s.dueAt.getTime()).toBe(T0.getTime() + DAY);
  });

  test("le compteur repart de zéro", () => {
    // Trois réussites suivies d'un échec ne valent pas trois réussites : la
    // notion n'est pas « presque acquise », elle est à reprendre.
    const s = nextSchedule({ intervalDays: 8, reviews: 3 }, false, T0);
    expect(s.reviews).toBe(0);
  });

  test("une lacune ratée ne se clôt jamais", () => {
    const s = nextSchedule({ intervalDays: 64, reviews: 6 }, false, T0);
    expect(s.status).toBe("open");
  });
});

describe("quand la notion est acquise", () => {
  test("elle se clôt au-delà de soixante jours", () => {
    const s = nextSchedule({ intervalDays: 32, reviews: 5 }, true, T0);
    expect(s.intervalDays).toBeGreaterThan(MASTERED_AFTER_DAYS);
    expect(s.status).toBe("resolved");
  });

  test("elle reste ouverte tant qu'on est sous le plafond", () => {
    const s = nextSchedule({ intervalDays: 16, reviews: 4 }, true, T0);
    expect(s.intervalDays).toBe(32);
    expect(s.status).toBe("open");
  });

  test("six réussites d'affilée suffisent", () => {
    // 2 · 4 · 8 · 16 · 32 puis 64, qui franchit les soixante jours.
    // J'avais d'abord écrit « sept » : ce test l'a démenti.
    let s = firstSchedule(T0);
    const states: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = nextSchedule(s, true, at(i));
      states.push(s.status);
    }
    expect(states).toEqual(["open", "open", "open", "open", "open", "resolved"]);
  });
});

describe("les lignes écrites avant la migration", () => {
  test("un intervalle nul ne double pas éternellement zéro", () => {
    // Les lacunes déjà en base n'ont pas de colonne `intervalDays`. Sans le
    // plancher, 0 × 2 = 0 : elles reviendraient toutes les heures, à vie.
    const s = nextSchedule({ intervalDays: 0, reviews: 0 }, true, T0);
    expect(s.intervalDays).toBe(2);
  });

  test("un intervalle négatif est ramené au plancher", () => {
    const s = nextSchedule({ intervalDays: -5, reviews: 0 }, true, T0);
    expect(s.intervalDays).toBe(2);
  });
});

describe("le compte à rebours affiché", () => {
  test("arrondit vers le haut", () => {
    expect(daysUntil(new Date(T0.getTime() + 0.3 * DAY), T0)).toBe(1);
    expect(daysUntil(new Date(T0.getTime() + 3.2 * DAY), T0)).toBe(4);
  });

  test("une lacune en retard rend zéro, jamais un négatif", () => {
    expect(daysUntil(new Date(T0.getTime() - 5 * DAY), T0)).toBe(0);
  });
});
