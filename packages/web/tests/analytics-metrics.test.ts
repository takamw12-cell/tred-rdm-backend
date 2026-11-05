import { describe, expect, test } from "bun:test";
import { computeCoreMetrics } from "../src/api/analytics/metrics";

describe("Kennzahlen des Betreiber-Dashboards", () => {
  const today = "2026-11-20";
  const signups = [
    { userId: "a", day: "2026-11-01" }, // aktiv am 02. (D1) und am 09. (Woche 2)
    { userId: "b", day: "2026-11-01" }, // nur am Registrierungstag aktiv
    { userId: "c", day: "2026-11-19" }, // zu jung für D1 (Tag 1 = heute, Fenster nicht vorbei)
    { userId: "d", day: "2026-11-20" }, // heute registriert
  ];
  const activity = [
    { userId: "a", day: "2026-11-01" },
    { userId: "a", day: "2026-11-02" },
    { userId: "a", day: "2026-11-09" },
    { userId: "b", day: "2026-11-01" },
    { userId: "c", day: "2026-11-19" },
    { userId: "d", day: "2026-11-20" },
  ];
  const m = computeCoreMetrics(signups, activity, today);

  test("Registrierungen pro Tag: 30 Tage, Lücken mit 0", () => {
    expect(m.signupsPerDay).toHaveLength(30);
    expect(m.signupsPerDay.at(-1)).toEqual({ day: "2026-11-20", count: 1 });
    expect(m.signupsPerDay.find((d) => d.day === "2026-11-01")?.count).toBe(2);
    expect(m.signupsPerDay.find((d) => d.day === "2026-11-05")?.count).toBe(0);
  });

  test("Retention nur über Kohorten, deren Fenster vorbei ist", () => {
    expect(m.retention.d1).toEqual({ cohort: 2, returned: 1, rate: 0.5 });
    expect(m.retention.d7).toEqual({ cohort: 2, returned: 1, rate: 0.5 });
    // a an 3 Tagen, b und c an 1 Tag; d (heute) zählt nicht.
    expect(m.retention.returning).toEqual({ cohort: 3, returned: 1, rate: 1 / 3 });
  });

  test("Aktive Nutzer", () => {
    expect(m.active.today).toBe(1);
    expect(m.active.last7d).toBe(2);
    expect(m.active.last30d).toBe(4);
    expect(m.totals).toEqual({ users: 4, signups7d: 2, signups30d: 4 });
  });

  test("Leere Datenbank: keine Division durch null", () => {
    const e = computeCoreMetrics([], [], today);
    expect(e.retention.d1.rate).toBeNull();
    expect(e.active.today).toBe(0);
  });
});
