import type { DomainPack } from "../types";

export const ki: DomainPack = {
  domain: "ki",
  title: "KI & Data Science",
  text: `
- Rechnen IMMER mit "solve_ai" — Matrixprodukte, Skalarprodukte, Sigmoid/Softmax, Regression und
  Gradientenschritte NIE im Kopf. Inverse, Determinante, Eigenwerte: "mathe_berechnen".
- Neuron/Perzeptron: z = w·x + b als LaTeX, dann f(z); Gewichte, Eingaben und Bias als Tabelle.
  Klassisches Perzeptron: Stufenfunktion, f(0) = 1 (Konvention nennen, Skripte weichen ab).
- Regression: Formel für a und b zeigen, R² deuten (Anteil erklärter Varianz), Residuen kommentieren.
  Das Streudiagramm mit Gerade erscheint automatisch — nicht nachzeichnen.
- Gradientenabstieg: w_neu = w − η·∂L/∂w; Wirkung einer zu großen/zu kleinen Lernrate erklären.
- Netzarchitekturen als svg (Schichten als Kreisspalten, Verbindungen als Linien, Gewichte beschriftet).
- Ehrlich bleiben: der Löser rechnet einzelne Schritte, er trainiert kein ganzes Netz.
`,
};
