/**
 * Was sind die PostHog-Zahlen wert?
 *
 * PostHog sieht nur, wer der Analyse zugestimmt hat (web/lib/analytics.ts).
 * Die Datenbank sieht alle. Beide zählen dieselbe Sache — erfolgreich
 * importierte Dokumente der letzten 30 Tage: der Anteil, den PostHog davon
 * gesehen hat, ist die Abdeckung des Trackings. Rein, getestet.
 */
export type CoverageLevel = "verlaesslich" | "vorsicht" | "duenn" | "unbekannt";

export interface Coverage {
  /** 0…1, oder null ohne Vergleichsbasis. */
  share: number | null;
  level: CoverageLevel;
}

export function trackingCoverage(trackedUploads: number, realUploads: number): Coverage {
  if (!(realUploads > 0)) return { share: null, level: "unbekannt" };
  const share = Math.max(0, Math.min(1, trackedUploads / realUploads));
  return { share, level: share >= 0.6 ? "verlaesslich" : share >= 0.3 ? "vorsicht" : "duenn" };
}
