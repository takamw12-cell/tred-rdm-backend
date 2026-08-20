import type { KnowState } from "@/stores/learning";
import type { Locale } from "@/i18n/types";

// Bewusst ein type-Alias statt eines interface: React Flow verlangt, dass die
// Node-Daten auf Record<string, unknown> passen. TypeScript vergibt eine
// implizite Index-Signatur nur an Alias-Objekttypen, nicht an interfaces.
export type DnaNodeData = {
  label: string;
  state: KnowState;
  mastery: number; // 0-100
  category: Record<Locale, string>;
  description: Record<Locale, string>;
};

export interface DnaNode {
  id: string;
  data: DnaNodeData;
  position: { x: number; y: number };
}

export interface DnaEdge {
  id: string;
  source: string;
  target: string;
}

// 10 nodes, 12 edges — a knowledge graph of Technische Mechanik / Aerodynamik.
export const dnaNodes: DnaNode[] = [
  {
    id: "grundlagen",
    position: { x: 340, y: 0 },
    data: {
      label: "Statik-Grundlagen",
      state: "mastered",
      mastery: 100,
      category: { de: "Grundlagen", fr: "Fondamentaux", en: "Fundamentals" },
      description: {
        de: "Kräfte, Momente und Gleichgewicht am starren Körper.",
        fr: "Forces, moments et équilibre du corps rigide.",
        en: "Forces, moments and equilibrium of the rigid body.",
      },
    },
  },
  {
    id: "schwerpunkt",
    position: { x: 90, y: 130 },
    data: {
      label: "Schwerpunkt",
      state: "mastered",
      mastery: 92,
      category: { de: "Statik", fr: "Statique", en: "Statics" },
      description: {
        de: "Bestimmung des Massenmittelpunkts von Flächen und Körpern.",
        fr: "Détermination du centre de masse de surfaces et de corps.",
        en: "Determining the mass center of areas and bodies.",
      },
    },
  },
  {
    id: "schnittgroessen",
    position: { x: 590, y: 130 },
    data: {
      label: "Schnittgrößen",
      state: "learning",
      mastery: 64,
      category: { de: "Statik", fr: "Statique", en: "Statics" },
      description: {
        de: "Normalkraft, Querkraft und Biegemoment im Balken.",
        fr: "Normalkraft, Querkraft et Biegemoment dans la poutre.",
        en: "Normalkraft, Querkraft and Biegemoment in the beam.",
      },
    },
  },
  {
    id: "querkraft",
    position: { x: 430, y: 270 },
    data: {
      label: "Querkraft",
      state: "learning",
      mastery: 58,
      category: { de: "Festigkeitslehre", fr: "Résistance des matériaux", en: "Strength of materials" },
      description: {
        de: "Effort tranchant — Ableitung des Biegemoments.",
        fr: "Effort tranchant — dérivée du Biegemoment.",
        en: "Shear force — derivative of the Biegemoment.",
      },
    },
  },
  {
    id: "biegemoment",
    position: { x: 720, y: 270 },
    data: {
      label: "Biegemoment",
      state: "learning",
      mastery: 55,
      category: { de: "Festigkeitslehre", fr: "Résistance des matériaux", en: "Strength of materials" },
      description: {
        de: "Moment fléchissant — Grundlage der Biegespannung.",
        fr: "Moment fléchissant — base de la contrainte de flexion.",
        en: "Bending moment — basis of bending stress.",
      },
    },
  },
  {
    id: "spannung",
    position: { x: 120, y: 400 },
    data: {
      label: "Spannung & Dehnung",
      state: "mastered",
      mastery: 88,
      category: { de: "Werkstoffkunde", fr: "Science des matériaux", en: "Materials science" },
      description: {
        de: "Spannung σ, Dehnung ε und das Hooke'sche Gesetz.",
        fr: "Spannung σ, Dehnung ε et la loi de Hooke.",
        en: "Spannung σ, Dehnung ε and Hooke's law.",
      },
    },
  },
  {
    id: "flaeche",
    position: { x: 430, y: 400 },
    data: {
      label: "Flächenträgheitsmoment",
      state: "new",
      mastery: 20,
      category: { de: "Festigkeitslehre", fr: "Résistance des matériaux", en: "Strength of materials" },
      description: {
        de: "Moment quadratique — Steifigkeit des Querschnitts.",
        fr: "Moment quadratique — rigidité de la section.",
        en: "Second moment of area — section stiffness.",
      },
    },
  },
  {
    id: "biegespannung",
    position: { x: 720, y: 400 },
    data: {
      label: "Biegespannung",
      state: "new",
      mastery: 12,
      category: { de: "Festigkeitslehre", fr: "Résistance des matériaux", en: "Strength of materials" },
      description: {
        de: "σ = M / W — verknüpft Biegemoment und Flächenträgheitsmoment.",
        fr: "σ = M / W — relie Biegemoment et Flächenträgheitsmoment.",
        en: "σ = M / W — links Biegemoment and Flächenträgheitsmoment.",
      },
    },
  },
  {
    id: "knickung",
    position: { x: 250, y: 540 },
    data: {
      label: "Knickung",
      state: "new",
      mastery: 0,
      category: { de: "Festigkeitslehre", fr: "Résistance des matériaux", en: "Strength of materials" },
      description: {
        de: "Flambement — Stabilität schlanker Druckstäbe (Euler).",
        fr: "Flambement — stabilité des barres élancées (Euler).",
        en: "Buckling — stability of slender columns (Euler).",
      },
    },
  },
  {
    id: "auftrieb",
    position: { x: 620, y: 540 },
    data: {
      label: "Auftrieb & Widerstand",
      state: "learning",
      mastery: 48,
      category: { de: "Aerodynamik", fr: "Aérodynamique", en: "Aerodynamics" },
      description: {
        de: "Portance et traînée — aerodynamische Grundkräfte am Profil.",
        fr: "Portance et traînée — forces aérodynamiques de base du profil.",
        en: "Lift and drag — basic aerodynamic forces on the airfoil.",
      },
    },
  },
];

export const dnaEdges: DnaEdge[] = [
  { id: "e1", source: "grundlagen", target: "schwerpunkt" },
  { id: "e2", source: "grundlagen", target: "schnittgroessen" },
  { id: "e3", source: "schwerpunkt", target: "spannung" },
  { id: "e4", source: "schnittgroessen", target: "querkraft" },
  { id: "e5", source: "schnittgroessen", target: "biegemoment" },
  { id: "e6", source: "querkraft", target: "biegemoment" },
  { id: "e7", source: "spannung", target: "flaeche" },
  { id: "e8", source: "biegemoment", target: "biegespannung" },
  { id: "e9", source: "flaeche", target: "biegespannung" },
  { id: "e10", source: "spannung", target: "knickung" },
  { id: "e11", source: "flaeche", target: "knickung" },
  { id: "e12", source: "biegespannung", target: "auftrieb" },
];
