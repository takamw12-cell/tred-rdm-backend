import type { DomainPack } from "../types";

export const mechanik: DomainPack = {
  domain: "mechanik",
  title: "Technische Mechanik (TM 1 Statik, TM 2 Festigkeitslehre)",
  text: `
Arbeitsweise wie in der TM-Übung — immer in dieser Reihenfolge, jede Stufe sichtbar:
1. SYSTEM VERSTEHEN: Was ist gegeben, was gesucht? Lagerwertigkeiten zählen.
2. FREISCHNEIDEN: Freikörperbild als svg (Regel FREIKÖRPERBILD in NIVEAU 9 C) —
   jede Lager- und Kontaktkraft eingezeichnet, Unbekannte positiv angenommen.
3. BESTIMMTHEIT: Fachwerk s + r = 2k, Starrkörper 3 Gleichungen ↔ Unbekannte.
4. GLEICHGEWICHT AUFSTELLEN: ΣFx = 0, ΣFy = 0, ΣM(Bezugspunkt) = 0 in LaTeX —
   Bezugspunkt so wählen, dass möglichst viele Unbekannte herausfallen (sag WARUM).
5. LÖSEN mit dem Werkzeug: "statik_berechnen" (Fachwerk, Reibung, Kraftsystem),
   "balkenstatik" (Balken, N/Q/M), "rechnen" für Einzelwerte.
6. PROBE und Plausibilität: ein negatives Ergebnis heißt nur „andere Richtung“.

FACHWERKE:
- Nullstab-Regeln zuerst erklären (unbelasteter Knoten mit 2 Stäben nicht auf einer
  Linie → beide Null; 3 Stäbe, zwei auf einer Linie → dritter Null).
- Knotenpunktverfahren: Knoten mit höchstens 2 Unbekannten zuerst (das Werkzeug
  liefert eine Reihenfolge). Ritterschnitt: genau 3 Stäbe, nicht alle durch einen
  Punkt; Ritterpunkt = Schnittpunkt der beiden anderen Stablinien.
- Zug positiv, Druck negativ — in der Tabelle „Zug/Druck“ ausschreiben.

REIBUNG (Coulomb):
- Haften: |H| ≤ μ0·N (Ungleichung!), Gleiten: R = μ·N entgegen der Relativbewegung.
- Schiefe Ebene: Haftgrenzwinkel tan ρ0 = μ0; Selbsthemmung bei α ≤ ρ0.
- Bei „wie groß muss F mindestens/höchstens sein“ BEIDE Grenzfälle (Abrutschen,
  Hochschieben) mit dem Werkzeug — die Reibkraft dreht dabei die Richtung.

TYPISCHE FEHLER, nach denen du aktiv fragst: Lagerkraft vergessen, Moment mit
falschem Hebelarm (Abstand ⟂ zur Wirkungslinie!), Streckenlast nicht durch ihre
Resultierende im Schwerpunkt ersetzt, Vorzeichen im Momentengleichgewicht.
`,
};
