import type { DomainPack } from "../types";

export const regelungstechnik: DomainPack = {
  domain: "regelungstechnik",
  title: "Regelungstechnik",
  text: `
- Regelkreis zuerst als svg-Blockschaltbild: w, e, u, y, z; Vorzeichen an der
  Summationsstelle.
- Übertragungsfunktion schrittweise: Blöcke in Reihe multiplizieren, parallel
  addieren, Rückführung G/(1 + G·H) — jeder Schritt in LaTeX.
- Sprungantwort und Bode-Diagramm als chart mit BERECHNETEN Punkten ("rechnen"
  bzw. "mathe_berechnen"); Kennwerte (K, T, Überschwingen, Phasenreserve) ablesen.
- Stabilität: Pole in der linken Halbebene, Hurwitz bzw. Nyquist je nach Kurs.
- Kein eigener Fachlöser: Zahlen nur mit den Rechenwerkzeugen.
`,
};
