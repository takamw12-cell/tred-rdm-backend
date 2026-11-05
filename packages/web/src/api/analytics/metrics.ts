/**
 * Kennzahlen des Betreiber-Dashboards — reine Rechnung, ohne Datenbank.
 *
 * Eingabe: Registrierungsdatum je Konto und die Tage, an denen ein Konto
 * aktiv war (eine Frage an den Tutor gestellt oder ein Dokument hochgeladen).
 * Ausgabe: Registrierungen pro Tag, aktive Nutzer, Rückkehrquoten.
 *
 * "Aktiv" ist bewusst eine TAT, kein Seitenaufruf: wer nur die Startseite
 * öffnet, ist nicht zurückgekommen, um zu lernen.
 */

export interface SignupRow {
  userId: string;
  /** YYYY-MM-DD (UTC) */
  day: string;
}

export interface ActivityRow {
  userId: string;
  day: string;
}

const DAY = 86_400_000;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY));

export interface Retention {
  /** Anteil (0–1) der Kohorte, null = Kohorte leer. */
  rate: number | null;
  /** Größe der Kohorte (Konten, die alt genug sind). */
  cohort: number;
  returned: number;
}

export interface CoreMetrics {
  signupsPerDay: { day: string; count: number }[];
  totals: { users: number; signups7d: number; signups30d: number };
  active: { today: number; last7d: number; last30d: number };
  retention: {
    /** am Tag nach der Registrierung wieder aktiv */
    d1: Retention;
    /** zwischen Tag 7 und Tag 13 wieder aktiv */
    d7: Retention;
    /** an mindestens zwei verschiedenen Tagen aktiv */
    returning: Retention;
  };
}

function rate(cohort: number, returned: number): Retention {
  return { cohort, returned, rate: cohort ? returned / cohort : null };
}

export function computeCoreMetrics(
  signups: SignupRow[],
  activity: ActivityRow[],
  today: string,
  days = 30,
): CoreMetrics {
  const byDay = new Map<string, number>();
  for (const s of signups) byDay.set(s.day, (byDay.get(s.day) ?? 0) + 1);
  const signupsPerDay = Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i - days + 1);
    return { day, count: byDay.get(day) ?? 0 };
  });

  const activeDays = new Map<string, Set<string>>();
  for (const a of activity) {
    let set = activeDays.get(a.userId);
    if (!set) activeDays.set(a.userId, (set = new Set()));
    set.add(a.day);
  }
  const activeSince = (from: string) => {
    let n = 0;
    for (const set of activeDays.values()) if ([...set].some((d) => d >= from)) n++;
    return n;
  };

  let d1c = 0, d1r = 0, d7c = 0, d7r = 0, rc = 0, rr = 0;
  for (const s of signups) {
    const set = activeDays.get(s.userId) ?? new Set<string>();
    // Kohorte erst zählen, wenn das Fenster vollständig vorbei ist.
    if (addDays(s.day, 1) < today) {
      d1c++;
      if (set.has(addDays(s.day, 1))) d1r++;
    }
    if (addDays(s.day, 13) < today) {
      d7c++;
      if ([...set].some((d) => d >= addDays(s.day, 7) && d <= addDays(s.day, 13))) d7r++;
    }
    if (s.day < today) {
      rc++;
      if (set.size >= 2) rr++;
    }
  }

  return {
    signupsPerDay,
    totals: {
      users: signups.length,
      signups7d: signups.filter((s) => s.day > addDays(today, -7)).length,
      signups30d: signups.filter((s) => s.day > addDays(today, -30)).length,
    },
    active: {
      today: activeSince(today),
      last7d: activeSince(addDays(today, -6)),
      last30d: activeSince(addDays(today, -29)),
    },
    retention: { d1: rate(d1c, d1r), d7: rate(d7c, d7r), returning: rate(rc, rr) },
  };
}
