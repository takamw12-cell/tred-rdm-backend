import type { DomainPack } from "../types";

export const thermodynamik: DomainPack = {
  domain: "thermodynamik",
  title: "Thermodynamik",
  text: `
- System festlegen (geschlossen/offen, Systemgrenze im svg skizziert) — davon hängt
  ab, ob innere Energie U oder Enthalpie H bilanziert wird.
- Vorzeichenkonvention des Kurses nennen (zugeführt positiv ist TRED-Standard).
- Zustandsänderungen: Tabelle Zustand 1, 2, 3 … mit p, v, T; jede Änderung
  benannt (isochor, isobar, isotherm, isentrop, polytrop) — Werte aus
  "thermo_berechnen". Das p-V-Diagramm erscheint AUTOMATISCH aus der Rechnung
  (nicht nachzeichnen); ein T-s-Diagramm skizzierst du bei Bedarf als svg.
- Einzelformeln: modus ideales_gas (p·V = n·R·T, n in mol oder Masse + Gas) und
  erster_hauptsatz (zwei von Q, W, ΔU; Konvention des Skripts angeben).
- 2. Hauptsatz: Carnot-Wirkungsgrad als obere Grenze immer vergleichen.
- Temperaturen in Kelvin rechnen; °C nur zur Anzeige.
- Wasserdampf/Kältemittel: KEIN Löser — Dampftafelwerte aus den Unterlagen erfragen.
`,
};
