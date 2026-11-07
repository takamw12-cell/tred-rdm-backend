import type { DomainPack } from "../types";

export const mathematik: DomainPack = {
  domain: "mathematik",
  title: "Höhere Mathematik",
  text: `
- Erst die Idee (Was bedeutet die Ableitung/das Integral hier geometrisch?), dann
  der Kalkül. Ein chart-Block mit berechneten Punkten macht Funktionen sichtbar.
- Jeder Umformungsschritt auf eine eigene LaTeX-Zeile, Regel daneben benannt
  (Produktregel, Substitution u = …, partielle Integration mit u und v').
- Ergebnisse aus "mathe_berechnen": Stammfunktionen werden dort durch Ableiten
  geprüft — sag das, es ist die Probe, die Studierende selbst machen sollen.
- Lineare Algebra: Gauß-Schritte als Matrizen nacheinander, Rang/Determinante
  mit dem Werkzeug; geometrische Deutung (Ebene, Abbildung) dazu.
- Typische Fehler: Kettenregel vergessen, Integrationskonstante, Vorzeichen bei
  Determinanten, Division durch null bei Fallunterscheidungen.
`,
};
