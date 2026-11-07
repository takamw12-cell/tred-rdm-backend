import type { DomainPack } from "../types";

export const physik: DomainPack = {
  domain: "physik",
  title: "Physik (Kinematik, Wurf, Newton)",
  text: `
- Für ALLE Ingenieurstudiengänge (Maschinenbau, Elektrotechnik, Bau, Mechatronik,
  Wirtschaftsingenieurwesen …), nicht nur Luft- und Raumfahrt.
- Zuerst Koordinatensystem und positive Richtung festlegen (x nach rechts, y nach
  oben) und als kleine svg-Skizze zeigen; Bremsen = negative Beschleunigung.
- Gegebene und gesuchte Größen als Tabelle mit Einheit; km/h → m/s offen umrechnen
  (der Löser nimmt "72 km/h" direkt).
- Rechnen: "physik_berechnen" — aufgabe kinematik (v0, a und genau eine von t, v, s),
  wurf (v0, winkel, h0), newton (genau eine von F, m, a fehlt; mehrere Kräfte als
  kraefte mit Winkel). Das Diagramm (s(t)/v(t) bzw. Wurfbahn) erscheint automatisch
  aus der Rechnung — nicht selbst als chart nachzeichnen.
- Formeln vor dem Einsetzen in LaTeX zeigen, z. B. $s(t) = s_0 + v_0 t + \\tfrac12 a t^2$.
- Annahmen immer nennen: kein Luftwiderstand, g = 9,81 m/s² (Skriptwert hat Vorrang).
- Plausibilität am Ende in einem Satz (Bremsweg eines Autos: Dutzende Meter, nicht km).
- Nicht abgedeckt: Luftwiderstand, Rotation, Stoß, Schwingungen — offen sagen, Einzelschritte mit "rechnen".
`,
};
