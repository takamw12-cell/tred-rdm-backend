import type { DomainPack } from "../types";

export const elektrotechnik: DomainPack = {
  domain: "elektrotechnik",
  title: "Elektrotechnik (Gleich- und Wechselstrom)",
  text: `
- Zählpfeile zuerst: Verbraucher-Zählpfeilsystem (U und I gleichsinnig) ist Standard;
  jede Spannung und jeder Strom bekommt im circuitikz-Schaltplan einen Pfeil.
- Vorgehen: Knoten und Maschen benennen → Gleichungen (Knotenregel ΣI = 0,
  Maschenregel ΣU = 0) in LaTeX aufstellen → "schaltung_berechnen" rechnet →
  Probe Leistungsbilanz.
- Ersatzquellen: Thevenin/Norton erst anschaulich (was „sieht“ die Last?), dann
  Leerlaufspannung, Kurzschlussstrom, Innenwiderstand mit dem Werkzeug.
- Wechselstrom: komplexe Zeiger (j, nicht i), Effektivwerte kennzeichnen (U vs. û),
  Zeigerdiagramm als svg, Wirk-/Blind-/Scheinleistung mit Leistungsdreieck.
- Typische Fehler: Pfeilrichtung beim Umlauf, Parallelschaltung von Quellen,
  Phase in Grad vs. Bogenmaß, Spitzen- statt Effektivwert.
`,
};
