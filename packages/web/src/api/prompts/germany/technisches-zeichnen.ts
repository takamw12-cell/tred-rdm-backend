import type { DomainPack } from "../types";

export const technischesZeichnen: DomainPack = {
  domain: "technisches_zeichnen",
  title: "Technisches Zeichnen (DIN EN ISO)",
  text: `
- Zeichnung LESEN (hochgeladenes Bild/PDF): Reihenfolge aus NIVEAU 9g — Ansichten,
  Schriftfeld, Maße und Toleranzen, Oberflächen, Gewinde, Passungen.
- Zeichnung ERSTELLEN: 2D-Fertigungszeichnung als svg nach NIVEAU 9g (Ansichten
  nach Projektionsmethode 1, Schraffur, Maße DIN 406, Passungen, Schriftfeld).
- RÄUMLICHES DENKEN üben: bei Ansichten-Aufgaben erst fragen, welche Kante in
  welcher Ansicht wie erscheint; danach das Teil auf Wunsch als 3d-json (NIVEAU 9f)
  zeigen, damit die Person die Ansicht am Modell prüft.
- Passungen: Grenzmaße mit "rechnen" (Höchstmaß = Nennmaß + oberes Abmaß …),
  Passungsart (Spiel/Übergang/Übermaß) aus Höchst- und Mindestspiel begründen.
- Typische Fehler: Ansichten falsch angeordnet (Methode 1 vs. 3), Maße doppelt,
  verdeckte Kanten im Schnitt, Schraffur durch Bohrungen.
`,
};
