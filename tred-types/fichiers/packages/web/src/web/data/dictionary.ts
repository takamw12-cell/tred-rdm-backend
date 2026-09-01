import type { KnowState } from "@/stores/learning";
import type { LocalizedText } from "./localized";

export interface Term {
  id: string;
  term: string; // German technical term (preserved in all languages)
  category: string;
  defaultState: KnowState;
  translation: LocalizedText;
  definition: LocalizedText;
  example: LocalizedText;
}

export const categories = [
  "Technische Mechanik",
  "Strömungslehre",
  "Aerodynamik",
  "Werkstoffkunde",
  "Mathematik",
];

export const terms: Term[] = [
  {
    id: "querkraft",
    term: "Querkraft",
    category: "Technische Mechanik",
    defaultState: "learning",
    translation: { de: "Querkraft", fr: "effort tranchant", en: "shear force" },
    definition: {
      de: "Innere Kraft senkrecht zur Balkenachse, die aus Querbelastung resultiert.",
      fr: "Force interne perpendiculaire à l'axe de la poutre, résultant d'une charge transversale.",
      en: "Internal force perpendicular to the beam axis, resulting from transverse loading.",
    },
    example: {
      de: "Die Querkraft ist maximal an den Auflagern eines einfach gestützten Balkens.",
      fr: "La Querkraft est maximale aux appuis d'une poutre simplement appuyée.",
      en: "The Querkraft is maximal at the supports of a simply supported beam.",
    },
  },
  {
    id: "biegung",
    term: "Biegung",
    category: "Technische Mechanik",
    defaultState: "mastered",
    translation: { de: "Biegung", fr: "flexion", en: "bending" },
    definition: {
      de: "Verformung eines Bauteils durch ein Biegemoment quer zur Längsachse.",
      fr: "Déformation d'une pièce sous l'effet d'un Biegemoment transversal à l'axe.",
      en: "Deformation of a member caused by a Biegemoment transverse to the axis.",
    },
    example: {
      de: "Bei Biegung entstehen Zug- und Druckspannungen im Querschnitt.",
      fr: "En Biegung, des contraintes de traction et de compression apparaissent dans la section.",
      en: "Under Biegung, tensile and compressive stresses arise in the cross-section.",
    },
  },
  {
    id: "torsion",
    term: "Torsion",
    category: "Technische Mechanik",
    defaultState: "learning",
    translation: { de: "Torsion", fr: "torsion", en: "torsion" },
    definition: {
      de: "Verdrehung eines Stabes um seine Längsachse durch ein Torsionsmoment.",
      fr: "Rotation d'une barre autour de son axe longitudinal sous un moment de torsion.",
      en: "Twisting of a bar about its longitudinal axis by a torque.",
    },
    example: {
      de: "Eine Antriebswelle wird hauptsächlich auf Torsion beansprucht.",
      fr: "Un arbre de transmission est principalement sollicité en Torsion.",
      en: "A drive shaft is mainly loaded in Torsion.",
    },
  },
  {
    id: "flaechentraegheitsmoment",
    term: "Flächenträgheitsmoment",
    category: "Technische Mechanik",
    defaultState: "new",
    translation: {
      de: "Flächenträgheitsmoment",
      fr: "moment quadratique",
      en: "second moment of area",
    },
    definition: {
      de: "Geometrische Größe eines Querschnitts, die seinen Widerstand gegen Biegung beschreibt.",
      fr: "Grandeur géométrique d'une section décrivant sa résistance à la Biegung.",
      en: "Geometric property of a cross-section describing its resistance to Biegung.",
    },
    example: {
      de: "Ein I-Profil hat ein großes Flächenträgheitsmoment bei geringem Gewicht.",
      fr: "Un profilé en I a un grand Flächenträgheitsmoment pour un faible poids.",
      en: "An I-beam has a large Flächenträgheitsmoment for low weight.",
    },
  },
  {
    id: "spannung",
    term: "Spannung",
    category: "Werkstoffkunde",
    defaultState: "mastered",
    translation: { de: "Spannung", fr: "contrainte", en: "stress" },
    definition: {
      de: "Innere Kraft pro Flächeneinheit in einem belasteten Bauteil.",
      fr: "Force interne par unité de surface dans une pièce sollicitée.",
      en: "Internal force per unit area in a loaded member.",
    },
    example: {
      de: "Die Spannung σ = F / A darf die Streckgrenze nicht überschreiten.",
      fr: "La Spannung σ = F / A ne doit pas dépasser la limite d'élasticité.",
      en: "The Spannung σ = F / A must not exceed the yield strength.",
    },
  },
  {
    id: "dehnung",
    term: "Dehnung",
    category: "Werkstoffkunde",
    defaultState: "learning",
    translation: { de: "Dehnung", fr: "déformation relative", en: "strain" },
    definition: {
      de: "Relative Längenänderung eines Körpers unter Belastung.",
      fr: "Variation relative de longueur d'un corps sous charge.",
      en: "Relative change in length of a body under load.",
    },
    example: {
      de: "Die Dehnung ε ist dimensionslos: ε = ΔL / L.",
      fr: "La Dehnung ε est sans dimension : ε = ΔL / L.",
      en: "The Dehnung ε is dimensionless: ε = ΔL / L.",
    },
  },
  {
    id: "elastizitaetsmodul",
    term: "Elastizitätsmodul",
    category: "Werkstoffkunde",
    defaultState: "learning",
    translation: {
      de: "Elastizitätsmodul",
      fr: "module de Young",
      en: "Young's modulus",
    },
    definition: {
      de: "Materialkonstante, die Spannung und Dehnung im elastischen Bereich verknüpft.",
      fr: "Constante matérielle reliant Spannung et Dehnung dans le domaine élastique.",
      en: "Material constant linking Spannung and Dehnung in the elastic range.",
    },
    example: {
      de: "Stahl hat einen Elastizitätsmodul von etwa 210 GPa.",
      fr: "L'acier a un Elastizitätsmodul d'environ 210 GPa.",
      en: "Steel has an Elastizitätsmodul of about 210 GPa.",
    },
  },
  {
    id: "biegemoment",
    term: "Biegemoment",
    category: "Technische Mechanik",
    defaultState: "learning",
    translation: { de: "Biegemoment", fr: "moment fléchissant", en: "bending moment" },
    definition: {
      de: "Moment, das eine Biegung in einem Balkenquerschnitt hervorruft.",
      fr: "Moment provoquant une Biegung dans une section de poutre.",
      en: "Moment that causes Biegung in a beam cross-section.",
    },
    example: {
      de: "Das Biegemoment wird aus dem Integral der Querkraft berechnet.",
      fr: "Le Biegemoment se calcule à partir de l'intégrale de la Querkraft.",
      en: "The Biegemoment is computed from the integral of the Querkraft.",
    },
  },
  {
    id: "normalkraft",
    term: "Normalkraft",
    category: "Technische Mechanik",
    defaultState: "mastered",
    translation: { de: "Normalkraft", fr: "effort normal", en: "normal force" },
    definition: {
      de: "Innere Kraft entlang der Bauteilachse (Zug oder Druck).",
      fr: "Force interne le long de l'axe de la pièce (traction ou compression).",
      en: "Internal force along the member axis (tension or compression).",
    },
    example: {
      de: "In einem Fachwerkstab wirkt nur die Normalkraft.",
      fr: "Dans une barre de treillis, seule la Normalkraft agit.",
      en: "In a truss member, only the Normalkraft acts.",
    },
  },
  {
    id: "schubspannung",
    term: "Schubspannung",
    category: "Werkstoffkunde",
    defaultState: "new",
    translation: { de: "Schubspannung", fr: "contrainte de cisaillement", en: "shear stress" },
    definition: {
      de: "Spannung, die tangential zur Schnittfläche wirkt.",
      fr: "Contrainte agissant tangentiellement à la surface de coupe.",
      en: "Stress acting tangential to the cut surface.",
    },
    example: {
      de: "Die Schubspannung τ folgt aus der Querkraft und dem Querschnitt.",
      fr: "La Schubspannung τ découle de la Querkraft et de la section.",
      en: "The Schubspannung τ follows from the Querkraft and the cross-section.",
    },
  },
  {
    id: "traegheitsmoment",
    term: "Trägheitsmoment",
    category: "Technische Mechanik",
    defaultState: "new",
    translation: { de: "Trägheitsmoment", fr: "moment d'inertie", en: "moment of inertia" },
    definition: {
      de: "Widerstand eines Körpers gegen Änderung seiner Drehbewegung.",
      fr: "Résistance d'un corps au changement de son mouvement de rotation.",
      en: "Resistance of a body to change in its rotational motion.",
    },
    example: {
      de: "Das Trägheitsmoment hängt von der Massenverteilung ab.",
      fr: "Le Trägheitsmoment dépend de la répartition de la masse.",
      en: "The Trägheitsmoment depends on the mass distribution.",
    },
  },
  {
    id: "auftrieb",
    term: "Auftrieb",
    category: "Aerodynamik",
    defaultState: "mastered",
    translation: { de: "Auftrieb", fr: "portance", en: "lift" },
    definition: {
      de: "Aerodynamische Kraft senkrecht zur Anströmung, die ein Flugzeug trägt.",
      fr: "Force aérodynamique perpendiculaire à l'écoulement qui porte l'avion.",
      en: "Aerodynamic force perpendicular to the flow that carries the aircraft.",
    },
    example: {
      de: "Der Auftrieb steigt mit dem Quadrat der Geschwindigkeit.",
      fr: "L'Auftrieb augmente avec le carré de la vitesse.",
      en: "Auftrieb increases with the square of the velocity.",
    },
  },
  {
    id: "widerstand",
    term: "Widerstand",
    category: "Aerodynamik",
    defaultState: "learning",
    translation: { de: "Widerstand", fr: "traînée", en: "drag" },
    definition: {
      de: "Aerodynamische Kraft entgegen der Bewegungsrichtung.",
      fr: "Force aérodynamique opposée à la direction du mouvement.",
      en: "Aerodynamic force opposing the direction of motion.",
    },
    example: {
      de: "Ein geringer Widerstand spart Treibstoff.",
      fr: "Un faible Widerstand économise du carburant.",
      en: "Low Widerstand saves fuel.",
    },
  },
  {
    id: "stroemung",
    term: "Strömung",
    category: "Strömungslehre",
    defaultState: "learning",
    translation: { de: "Strömung", fr: "écoulement", en: "flow" },
    definition: {
      de: "Bewegung eines Fluids, laminar oder turbulent.",
      fr: "Mouvement d'un fluide, laminaire ou turbulent.",
      en: "Motion of a fluid, laminar or turbulent.",
    },
    example: {
      de: "Bei niedriger Reynolds-Zahl ist die Strömung laminar.",
      fr: "À faible Reynolds-Zahl, la Strömung est laminaire.",
      en: "At low Reynolds-Zahl the Strömung is laminar.",
    },
  },
  {
    id: "machzahl",
    term: "Machzahl",
    category: "Aerodynamik",
    defaultState: "new",
    translation: { de: "Machzahl", fr: "nombre de Mach", en: "Mach number" },
    definition: {
      de: "Verhältnis von Strömungsgeschwindigkeit zur Schallgeschwindigkeit.",
      fr: "Rapport entre la vitesse d'écoulement et la vitesse du son.",
      en: "Ratio of flow velocity to the speed of sound.",
    },
    example: {
      de: "Ab Machzahl 1 spricht man von Überschall.",
      fr: "À partir d'une Machzahl de 1, on parle de supersonique.",
      en: "From a Machzahl of 1 we speak of supersonic flight.",
    },
  },
  {
    id: "reynoldszahl",
    term: "Reynolds-Zahl",
    category: "Strömungslehre",
    defaultState: "new",
    translation: { de: "Reynolds-Zahl", fr: "nombre de Reynolds", en: "Reynolds number" },
    definition: {
      de: "Dimensionslose Kennzahl für das Verhältnis von Trägheits- zu Zähigkeitskräften.",
      fr: "Nombre sans dimension du rapport entre forces d'inertie et de viscosité.",
      en: "Dimensionless number for the ratio of inertial to viscous forces.",
    },
    example: {
      de: "Die Reynolds-Zahl bestimmt den Übergang zur Turbulenz.",
      fr: "La Reynolds-Zahl détermine la transition vers la turbulence.",
      en: "The Reynolds-Zahl governs the transition to turbulence.",
    },
  },
  {
    id: "schwerpunkt",
    term: "Schwerpunkt",
    category: "Technische Mechanik",
    defaultState: "mastered",
    translation: { de: "Schwerpunkt", fr: "centre de gravité", en: "center of gravity" },
    definition: {
      de: "Punkt, in dem die gesamte Gewichtskraft eines Körpers angreift.",
      fr: "Point où s'applique le poids total d'un corps.",
      en: "Point where the total weight of a body acts.",
    },
    example: {
      de: "Die Lage des Schwerpunkts beeinflusst die Stabilität des Flugzeugs.",
      fr: "La position du Schwerpunkt influence la stabilité de l'avion.",
      en: "The position of the Schwerpunkt affects aircraft stability.",
    },
  },
  {
    id: "steifigkeit",
    term: "Steifigkeit",
    category: "Werkstoffkunde",
    defaultState: "learning",
    translation: { de: "Steifigkeit", fr: "rigidité", en: "stiffness" },
    definition: {
      de: "Widerstand eines Bauteils gegen elastische Verformung.",
      fr: "Résistance d'une pièce à la déformation élastique.",
      en: "Resistance of a member to elastic deformation.",
    },
    example: {
      de: "Die Steifigkeit hängt von Geometrie und Elastizitätsmodul ab.",
      fr: "La Steifigkeit dépend de la géométrie et de l'Elastizitätsmodul.",
      en: "Steifigkeit depends on geometry and the Elastizitätsmodul.",
    },
  },
  {
    id: "verformung",
    term: "Verformung",
    category: "Technische Mechanik",
    defaultState: "new",
    translation: { de: "Verformung", fr: "déformation", en: "deformation" },
    definition: {
      de: "Änderung der Form eines Körpers unter Belastung.",
      fr: "Changement de forme d'un corps sous charge.",
      en: "Change in shape of a body under load.",
    },
    example: {
      de: "Elastische Verformung ist reversibel, plastische nicht.",
      fr: "La Verformung élastique est réversible, la plastique non.",
      en: "Elastic Verformung is reversible, plastic is not.",
    },
  },
  {
    id: "knickung",
    term: "Knickung",
    category: "Technische Mechanik",
    defaultState: "new",
    translation: { de: "Knickung", fr: "flambement", en: "buckling" },
    definition: {
      de: "Plötzliches seitliches Ausweichen eines schlanken Druckstabs.",
      fr: "Déviation latérale soudaine d'une barre élancée en compression.",
      en: "Sudden lateral deflection of a slender compression member.",
    },
    example: {
      de: "Die kritische Last bei Knickung folgt aus der Euler-Formel.",
      fr: "La charge critique de Knickung découle de la formule d'Euler.",
      en: "The critical load for Knickung follows from Euler's formula.",
    },
  },
];

export const TOTAL_TERMS = 200;
