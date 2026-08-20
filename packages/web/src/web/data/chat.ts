import type { Locale } from "@/i18n/types";

export interface ChatSource {
  doc: string;
  page: number;
}

export interface CannedAnswer {
  keywords: string[];
  content: Record<Locale, string>;
  source: ChatSource;
}

// Simulated AI answers. Technical German terms are preserved in every language,
// glossed inline, with LaTeX formulas rendered via KaTeX.
export const cannedAnswers: CannedAnswer[] = [
  {
    keywords: ["querkraft", "shear", "tranchant", "effort"],
    source: { doc: "TM2_Kap3.pdf", page: 7 },
    content: {
      de: `Die **Querkraft** (Schnittgröße quer zur Balkenachse) ergibt sich aus dem Gleichgewicht am Teilstück.

Für einen einfach gestützten Balken mit Streckenlast $q$ gilt:

$$Q(x) = \\frac{qL}{2} - qx$$

- **Querkraft** ist maximal an den Auflagern.
- Sie ist die Ableitung des **Biegemoment** (moment fléchissant): $Q(x) = \\dfrac{dM(x)}{dx}$.`,
      fr: `La **Querkraft** (effort tranchant, grandeur de coupe perpendiculaire à l'axe) découle de l'équilibre du tronçon.

Pour une poutre simplement appuyée sous charge répartie $q$ :

$$Q(x) = \\frac{qL}{2} - qx$$

- La **Querkraft** est maximale aux appuis.
- Elle est la dérivée du **Biegemoment** (moment fléchissant) : $Q(x) = \\dfrac{dM(x)}{dx}$.`,
      en: `The **Querkraft** (shear force, an internal quantity perpendicular to the beam axis) follows from equilibrium of the segment.

For a simply supported beam under distributed load $q$:

$$Q(x) = \\frac{qL}{2} - qx$$

- The **Querkraft** is maximal at the supports.
- It is the derivative of the **Biegemoment** (bending moment): $Q(x) = \\dfrac{dM(x)}{dx}$.`,
    },
  },
  {
    keywords: ["flächenträgheitsmoment", "flachentragheitsmoment", "moment quadratique", "second moment"],
    source: { doc: "TM2_Kap4.pdf", page: 12 },
    content: {
      de: `Das **Flächenträgheitsmoment** (moment quadratique) beschreibt den Widerstand eines Querschnitts gegen **Biegung**.

Für ein Rechteck (Breite $b$, Höhe $h$):

$$I = \\frac{b\\,h^3}{12}$$

Je größer $I$, desto steifer ist der Querschnitt bei gleicher Fläche.`,
      fr: `Le **Flächenträgheitsmoment** (moment quadratique) décrit la résistance d'une section à la **Biegung** (flexion).

Pour un rectangle (largeur $b$, hauteur $h$) :

$$I = \\frac{b\\,h^3}{12}$$

Plus $I$ est grand, plus la section est rigide à surface égale.`,
      en: `The **Flächenträgheitsmoment** (second moment of area) describes a cross-section's resistance to **Biegung** (bending).

For a rectangle (width $b$, height $h$):

$$I = \\frac{b\\,h^3}{12}$$

The larger $I$, the stiffer the section for the same area.`,
    },
  },
  {
    keywords: ["biegemoment", "bending moment", "moment fléchissant"],
    source: { doc: "TM2_Kap3.pdf", page: 9 },
    content: {
      de: `Das **Biegemoment** $M(x)$ ist das Integral der **Querkraft**:

$$M(x) = \\int Q(x)\\,dx$$

Die maximale Biegespannung folgt dann aus:

$$\\sigma = \\frac{M}{I}\\,y_{max} = \\frac{M}{W}$$

wobei $W$ das Widerstandsmoment ist.`,
      fr: `Le **Biegemoment** $M(x)$ est l'intégrale de la **Querkraft** :

$$M(x) = \\int Q(x)\\,dx$$

La contrainte de flexion maximale découle alors de :

$$\\sigma = \\frac{M}{I}\\,y_{max} = \\frac{M}{W}$$

où $W$ est le module de résistance (Widerstandsmoment).`,
      en: `The **Biegemoment** $M(x)$ is the integral of the **Querkraft**:

$$M(x) = \\int Q(x)\\,dx$$

The maximum bending stress then follows from:

$$\\sigma = \\frac{M}{I}\\,y_{max} = \\frac{M}{W}$$

where $W$ is the section modulus (Widerstandsmoment).`,
    },
  },
];

export const fallbackAnswer: CannedAnswer = {
  keywords: [],
  source: { doc: "Skript_Uebersicht.pdf", page: 2 },
  content: {
    de: `Gute Frage! Ich fasse die wichtigsten Punkte zusammen und behalte die deutschen Fachbegriffe bei, z. B. **Spannung** (contrainte) und **Dehnung** (déformation).

Stell mir gern eine konkretere Frage zu einem Kapitel — ich verweise dann auf die passende Seite im Skript.`,
    fr: `Bonne question ! Je résume les points clés en gardant les termes techniques allemands, par ex. **Spannung** (contrainte) et **Dehnung** (déformation).

Pose-moi une question plus précise sur un chapitre — je te renverrai à la bonne page du polycopié.`,
    en: `Good question! I'll summarize the key points while keeping the German technical terms, e.g. **Spannung** (stress) and **Dehnung** (strain).

Ask me something more specific about a chapter — I'll point you to the right page in the script.`,
  },
};

export function findAnswer(question: string): CannedAnswer {
  const q = question.toLowerCase();
  return cannedAnswers.find((a) => a.keywords.some((k) => q.includes(k))) ?? fallbackAnswer;
}
