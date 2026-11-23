/**
 * Le catalogue des simulations vérifiées du « Labo ».
 *
 * Chaque entrée est une LOI DE RÉFÉRENCE écrite et relue à la main : ses
 * grandeurs (symbole, unité, bornes) et ses formules. C'est contre elle que le
 * serveur vérifie toute formule proposée par le modèle (api/lib/simulation.ts) :
 * une simulation n'est gardée que si chaque formule est identique à la loi.
 *
 * Ce fichier est lu par le serveur ET par le navigateur : il ne dépend de rien.
 * Le navigateur calcule avec `compute` ; un test vérifie que `compute` et les
 * expressions `laws` donnent les mêmes nombres.
 *
 * Ajouter une simulation : une entrée ici, puis une scène dans
 * components/SimulationScene.tsx (sans scène propre, des colonnes 3D servent).
 */
export type SceneId = "voltage_divider" | "lever" | "pendulum" | "rc_circuit";

export interface SimVariable {
  /** Le nom dans les expressions (lettres et chiffres seulement). */
  symbol: string;
  /** Le même, en LaTeX. */
  tex: string;
  /** Unité SI, en notation mathjs (dimension) … */
  unit: string;
  /** … et telle qu'on l'affiche. */
  unitLabel: string;
  label: { de: string; en: string; fr: string };
}

export interface SimInput extends SimVariable {
  min: number;
  max: number;
  value: number;
  /** Curseur logarithmique (grandeurs sur plusieurs décades). */
  log?: boolean;
  /** La couleur de cette grandeur dans la scène 3D, reprise par son curseur. */
  color?: string;
}

export interface SimScene {
  id: SceneId;
  label: { de: string; en: string; fr: string };
  /** Mots (minuscules, sans accent) qui désignent ce concept. */
  keywords: string[];
  inputs: SimInput[];
  outputs: SimVariable[];
  /** La loi de référence : une expression par grandeur calculée, sur les symboles d'entrée. */
  laws: Record<string, string>;
  compute: (v: Record<string, number>) => Record<string, number>;
}

export const SIM_SCENES: SimScene[] = [
  {
    id: "voltage_divider",
    label: { de: "Spannungsteiler", en: "Voltage divider", fr: "Diviseur de tension" },
    keywords: ["spannungsteiler", "voltage divider", "diviseur de tension", "reihenschaltung", "series circuit"],
    inputs: [
      { symbol: "U", tex: "U", unit: "V", unitLabel: "V", label: { de: "Gesamtspannung", en: "Source voltage", fr: "Tension totale" }, min: 1, max: 24, value: 12, color: "#64748B" },
      { symbol: "R1", tex: "R_1", unit: "ohm", unitLabel: "Ω", label: { de: "Widerstand 1", en: "Resistor 1", fr: "Résistance 1" }, min: 10, max: 10_000, value: 1000, log: true, color: "#F59E0B" },
      { symbol: "R2", tex: "R_2", unit: "ohm", unitLabel: "Ω", label: { de: "Widerstand 2", en: "Resistor 2", fr: "Résistance 2" }, min: 10, max: 10_000, value: 2000, log: true, color: "#38BDF8" },
    ],
    outputs: [
      { symbol: "I", tex: "I", unit: "A", unitLabel: "A", label: { de: "Strom", en: "Current", fr: "Courant" } },
      { symbol: "U1", tex: "U_1", unit: "V", unitLabel: "V", label: { de: "Spannung an R₁", en: "Voltage across R₁", fr: "Tension sur R₁" } },
      { symbol: "U2", tex: "U_2", unit: "V", unitLabel: "V", label: { de: "Spannung an R₂", en: "Voltage across R₂", fr: "Tension sur R₂" } },
    ],
    laws: { I: "U / (R1 + R2)", U1: "U * R1 / (R1 + R2)", U2: "U * R2 / (R1 + R2)" },
    compute: ({ U, R1, R2 }) => ({ I: U! / (R1! + R2!), U1: (U! * R1!) / (R1! + R2!), U2: (U! * R2!) / (R1! + R2!) }),
  },
  {
    id: "lever",
    label: { de: "Hebelgesetz", en: "Law of the lever", fr: "Loi du levier" },
    keywords: ["hebel", "hebelgesetz", "hebelprinzip", "lever", "levier", "drehmoment", "torque", "moment de force"],
    inputs: [
      { symbol: "F1", tex: "F_1", unit: "N", unitLabel: "N", label: { de: "Kraft 1", en: "Force 1", fr: "Force 1" }, min: 1, max: 500, value: 100 },
      { symbol: "l1", tex: "l_1", unit: "m", unitLabel: "m", label: { de: "Hebelarm 1", en: "Lever arm 1", fr: "Bras de levier 1" }, min: 0.1, max: 2, value: 0.5 },
      { symbol: "l2", tex: "l_2", unit: "m", unitLabel: "m", label: { de: "Hebelarm 2", en: "Lever arm 2", fr: "Bras de levier 2" }, min: 0.1, max: 2, value: 1 },
    ],
    outputs: [
      { symbol: "M", tex: "M", unit: "N m", unitLabel: "N·m", label: { de: "Drehmoment", en: "Torque", fr: "Moment" } },
      { symbol: "F2", tex: "F_2", unit: "N", unitLabel: "N", label: { de: "Kraft 2 im Gleichgewicht", en: "Force 2 at balance", fr: "Force 2 à l'équilibre" } },
    ],
    laws: { M: "F1 * l1", F2: "F1 * l1 / l2" },
    compute: ({ F1, l1, l2 }) => ({ M: F1! * l1!, F2: (F1! * l1!) / l2! }),
  },
  {
    id: "pendulum",
    label: { de: "Fadenpendel", en: "Simple pendulum", fr: "Pendule simple" },
    keywords: ["pendel", "fadenpendel", "pendulum", "pendule", "schwingungsdauer", "periodendauer"],
    inputs: [
      { symbol: "l", tex: "l", unit: "m", unitLabel: "m", label: { de: "Fadenlänge", en: "Length", fr: "Longueur du fil" }, min: 0.1, max: 5, value: 1 },
      { symbol: "g", tex: "g", unit: "m / s^2", unitLabel: "m/s²", label: { de: "Fallbeschleunigung", en: "Gravity", fr: "Pesanteur" }, min: 1.6, max: 25, value: 9.81 },
    ],
    outputs: [
      { symbol: "T", tex: "T", unit: "s", unitLabel: "s", label: { de: "Periodendauer", en: "Period", fr: "Période" } },
      { symbol: "f", tex: "f", unit: "Hz", unitLabel: "Hz", label: { de: "Frequenz", en: "Frequency", fr: "Fréquence" } },
    ],
    laws: { T: "2 * pi * sqrt(l / g)", f: "1 / (2 * pi) * sqrt(g / l)" },
    compute: ({ l, g }) => ({ T: 2 * Math.PI * Math.sqrt(l! / g!), f: Math.sqrt(g! / l!) / (2 * Math.PI) }),
  },
  {
    id: "rc_circuit",
    label: { de: "RC-Glied", en: "RC circuit", fr: "Circuit RC" },
    keywords: ["rc-glied", "rc glied", "rc circuit", "circuit rc", "zeitkonstante", "time constant", "tiefpass", "grenzfrequenz", "kondensator laden"],
    inputs: [
      { symbol: "R", tex: "R", unit: "ohm", unitLabel: "Ω", label: { de: "Widerstand", en: "Resistor", fr: "Résistance" }, min: 100, max: 100_000, value: 1000, log: true },
      { symbol: "C", tex: "C", unit: "F", unitLabel: "F", label: { de: "Kapazität", en: "Capacitance", fr: "Capacité" }, min: 1e-7, max: 1e-3, value: 1e-4, log: true },
    ],
    outputs: [
      { symbol: "tau", tex: "\\tau", unit: "s", unitLabel: "s", label: { de: "Zeitkonstante", en: "Time constant", fr: "Constante de temps" } },
      { symbol: "fg", tex: "f_g", unit: "Hz", unitLabel: "Hz", label: { de: "Grenzfrequenz", en: "Cut-off frequency", fr: "Fréquence de coupure" } },
    ],
    laws: { tau: "R * C", fg: "1 / (2 * pi * R * C)" },
    compute: ({ R, C }) => ({ tau: R! * C!, fg: 1 / (2 * Math.PI * R! * C!) }),
  },
];

export const sceneById = (id: unknown): SimScene | null => SIM_SCENES.find((s) => s.id === id) ?? null;

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** La simulation que désigne un concept écrit par l'étudiant (« Spannungsteiler »), ou null. */
export function sceneForConcept(concept: string): SimScene | null {
  const hay = plain(concept);
  return SIM_SCENES.find((s) => s.keywords.some((k) => hay.includes(plain(k)))) ?? null;
}

/** Borne une valeur d'entrée à sa plage ; hors nombre → la valeur par défaut. */
export function clampInput(input: SimInput, value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : input.value;
  return Math.min(input.max, Math.max(input.min, n));
}

/** Curseur 0…1 → valeur (logarithmique si la grandeur le demande), et l'inverse. */
export function sliderToValue(input: SimInput, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return input.log ? input.min * (input.max / input.min) ** x : input.min + (input.max - input.min) * x;
}
export function valueToSlider(input: SimInput, value: number): number {
  const v = clampInput(input, value);
  return input.log ? Math.log(v / input.min) / Math.log(input.max / input.min) : (v - input.min) / (input.max - input.min);
}

const PREFIXES: Array<[number, string]> = [
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
  [1, ""],
  [1e-3, "m"],
  [1e-6, "µ"],
  [1e-9, "n"],
];

/** 0,004 A → « 4 mA ». Trois chiffres significatifs. Les unités composées (« N·m », « m/s² ») restent sans préfixe. */
export function formatQuantity(value: number, unitLabel: string): string {
  if (!Number.isFinite(value)) return "–";
  const simple = /^[A-Za-zΩ]+$/.test(unitLabel) && unitLabel !== "m";
  const abs = Math.abs(value);
  const [factor, prefix] = simple && abs !== 0 ? (PREFIXES.find(([f]) => abs >= f) ?? PREFIXES[PREFIXES.length - 1]!) : [1, ""];
  const n = Number((value / factor).toPrecision(3));
  return `${n} ${prefix}${unitLabel}`;
}
