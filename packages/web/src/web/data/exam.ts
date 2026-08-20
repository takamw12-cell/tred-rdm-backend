// Exam mode is always in German only (by design). No i18n here.
export interface ExamQuestion {
  id: string;
  title: string;
  points: number;
  prompt: string; // supports LaTeX ($...$)
  solution: string;
}

export const examDurationSeconds = 2 * 60 * 60; // 2 hours

export const examQuestions: ExamQuestion[] = [
  {
    id: "a1",
    title: "Aufgabe 1 — Querkraft & Biegemoment",
    points: 12,
    prompt:
      "Ein einfach gestützter Balken (Länge $L = 6\\,\\text{m}$) trägt eine konstante Streckenlast $q = 4\\,\\text{kN/m}$. Bestimmen Sie den Verlauf der Querkraft $Q(x)$ und des Biegemoments $M(x)$ sowie das maximale Biegemoment.",
    solution:
      "Auflagerkräfte: $A = B = \\frac{qL}{2} = 12\\,\\text{kN}$.\nQuerkraft: $Q(x) = 12 - 4x\\ [\\text{kN}]$.\nBiegemoment: $M(x) = 12x - 2x^2\\ [\\text{kNm}]$.\nMaximum bei $x = 3\\,\\text{m}$: $M_{max} = 18\\,\\text{kNm}$.",
  },
  {
    id: "a2",
    title: "Aufgabe 2 — Flächenträgheitsmoment",
    points: 8,
    prompt:
      "Berechnen Sie das Flächenträgheitsmoment $I_y$ eines Rechteckquerschnitts mit Breite $b = 40\\,\\text{mm}$ und Höhe $h = 120\\,\\text{mm}$ bezüglich der horizontalen Schwerachse.",
    solution:
      "$I_y = \\dfrac{b\\,h^3}{12} = \\dfrac{40 \\cdot 120^3}{12} = 5.76 \\times 10^6\\,\\text{mm}^4$.",
  },
  {
    id: "a3",
    title: "Aufgabe 3 — Spannung",
    points: 10,
    prompt:
      "Ein Stab mit Querschnittsfläche $A = 200\\,\\text{mm}^2$ wird mit $F = 30\\,\\text{kN}$ auf Zug belastet. Berechnen Sie die Normalspannung und beurteilen Sie, ob Stahl (Streckgrenze $R_e = 235\\,\\text{MPa}$) ausreicht.",
    solution:
      "$\\sigma = \\dfrac{F}{A} = \\dfrac{30000}{200} = 150\\,\\text{MPa}$.\nDa $150\\,\\text{MPa} < 235\\,\\text{MPa}$, hält der Stab (Sicherheit $\\approx 1.57$).",
  },
];

export const totalPoints = examQuestions.reduce((s, q) => s + q.points, 0);
