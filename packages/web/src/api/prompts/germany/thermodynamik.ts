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
  "thermo_berechnen", Diagramm p-v bzw. T-s als svg.
- 2. Hauptsatz: Carnot-Wirkungsgrad als obere Grenze immer vergleichen.
- Temperaturen in Kelvin rechnen; °C nur zur Anzeige.
- Wasserdampf/Kältemittel: KEIN Löser — Dampftafelwerte aus den Unterlagen erfragen.
`,
};
