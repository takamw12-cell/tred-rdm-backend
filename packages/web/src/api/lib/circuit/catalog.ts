/**
 * Katalog der Bauteile und Gesetze — der Wissensgraph der Schaltungstechnik.
 *
 * Brief des Gründers vom 17. Nov. 2026 (Verwechslung R1–R4 auf einem
 * Schaltplan): das Modell darf nur Bauteile und Gesetze verwenden, die hier
 * stehen.
 *
 *   - Bauteile: `circuitElementSchema` (solveCircuit.ts) ist eine
 *     geschlossene Liste. Ein erfundenes Bauteil („Memristor“, „R_eq“ als
 *     eigener Typ …) scheitert schon an der Eingabeprüfung des Werkzeugs.
 *     tests/circuit-pipeline.test.ts prüft, dass Katalog und Schema
 *     dieselben Typen kennen.
 *   - Gesetze: jede Gleichung, die der Code aufstellt und zeigt, trägt die
 *     Kennung eines Gesetzes aus `LAWS`. Der Löser kennt keine anderen.
 *
 * Grenze (ehrlich): den freien Erklärtext des Modells prüft dieser Katalog
 * nicht. Er legt fest, was RECHNET und was als Gleichung auf der Tafel steht.
 *
 * Modul rein, ohne Abhängigkeit: Server und Browser lesen es.
 */

export type LawId =
  | "knotenregel"
  | "maschenregel"
  | "ohm"
  | "spannungsquelle"
  | "stromquelle"
  | "kondensator_dc"
  | "spule_dc"
  | "impedanz_c"
  | "impedanz_l"
  | "impedanz"
  | "opv_ideal"
  | "leistungsbilanz";

export interface Law {
  id: LawId;
  name: string;
  /** Allgemeine Form, LaTeX. */
  formel: string;
  /** Wo das Gesetz gilt. */
  gilt: "immer" | "DC" | "AC";
}

export const LAWS: Record<LawId, Law> = {
  knotenregel: { id: "knotenregel", name: "1. Kirchhoffsches Gesetz (Knotenregel)", formel: String.raw`\sum_k I_k = 0`, gilt: "immer" },
  maschenregel: { id: "maschenregel", name: "2. Kirchhoffsches Gesetz (Maschenregel)", formel: String.raw`\sum_k U_k = 0`, gilt: "immer" },
  ohm: { id: "ohm", name: "Ohmsches Gesetz", formel: String.raw`U = R \cdot I`, gilt: "immer" },
  spannungsquelle: { id: "spannungsquelle", name: "Ideale Spannungsquelle", formel: String.raw`U = U_0`, gilt: "immer" },
  stromquelle: { id: "stromquelle", name: "Ideale Stromquelle", formel: String.raw`I = I_0`, gilt: "immer" },
  kondensator_dc: { id: "kondensator_dc", name: "Kondensator bei Gleichstrom (Leerlauf)", formel: String.raw`I_C = 0`, gilt: "DC" },
  spule_dc: { id: "spule_dc", name: "Spule bei Gleichstrom (Kurzschluss)", formel: String.raw`U_L = 0`, gilt: "DC" },
  impedanz_c: { id: "impedanz_c", name: "Impedanz des Kondensators", formel: String.raw`\underline{Z}_C = \frac{1}{j\omega C}`, gilt: "AC" },
  impedanz_l: { id: "impedanz_l", name: "Impedanz der Spule", formel: String.raw`\underline{Z}_L = j\omega L`, gilt: "AC" },
  impedanz: { id: "impedanz", name: "Ohmsches Gesetz, komplex", formel: String.raw`\underline{U} = \underline{Z} \cdot \underline{I}`, gilt: "immer" },
  opv_ideal: { id: "opv_ideal", name: "Idealer OPV mit Gegenkopplung", formel: String.raw`U_+ = U_-,\; I_+ = I_- = 0`, gilt: "immer" },
  leistungsbilanz: { id: "leistungsbilanz", name: "Leistungsbilanz (Tellegen)", formel: String.raw`\sum_k \underline{S}_k = 0`, gilt: "immer" },
};

export type ComponentType = "R" | "L" | "C" | "Z" | "V" | "I" | "OPV";

export interface Component {
  typ: ComponentType;
  name: string;
  /** Anschlüsse in der Reihenfolge der Netzliste. */
  anschluesse: readonly string[];
  einheit: string;
  /** Gesetze, die für dieses Bauteil gelten (zusätzlich zu Knoten- und Maschenregel). */
  gesetze: { DC: readonly LawId[]; AC: readonly LawId[] };
}

export const COMPONENTS: Record<ComponentType, Component> = {
  R: { typ: "R", name: "Widerstand", anschluesse: ["a", "b"], einheit: "Ω", gesetze: { DC: ["ohm"], AC: ["ohm"] } },
  L: { typ: "L", name: "Spule", anschluesse: ["a", "b"], einheit: "H", gesetze: { DC: ["spule_dc"], AC: ["impedanz_l", "impedanz"] } },
  C: { typ: "C", name: "Kondensator", anschluesse: ["a", "b"], einheit: "F", gesetze: { DC: ["kondensator_dc"], AC: ["impedanz_c", "impedanz"] } },
  Z: { typ: "Z", name: "Impedanz", anschluesse: ["a", "b"], einheit: "Ω", gesetze: { DC: ["impedanz"], AC: ["impedanz"] } },
  V: { typ: "V", name: "Spannungsquelle", anschluesse: ["a", "b"], einheit: "V", gesetze: { DC: ["spannungsquelle"], AC: ["spannungsquelle"] } },
  I: { typ: "I", name: "Stromquelle", anschluesse: ["a", "b"], einheit: "A", gesetze: { DC: ["stromquelle"], AC: ["stromquelle"] } },
  OPV: { typ: "OPV", name: "Operationsverstärker (ideal)", anschluesse: ["plus", "minus", "aus"], einheit: "", gesetze: { DC: ["opv_ideal"], AC: ["opv_ideal"] } },
};

export const COMPONENT_TYPES = Object.keys(COMPONENTS) as ComponentType[];

export const isComponentType = (t: unknown): t is ComponentType =>
  typeof t === "string" && Object.prototype.hasOwnProperty.call(COMPONENTS, t);

/**
 * Die Gesetze, die eine Netzliste braucht — in fester Reihenfolge, ohne
 * Doppelte. Der Löser gibt diese Liste mit aus: mehr Gesetze gibt es nicht.
 */
export function lawsFor(types: Iterable<ComponentType>, modus: "DC" | "AC"): Law[] {
  const ids = new Set<LawId>(["knotenregel", "maschenregel"]);
  for (const t of types) for (const id of COMPONENTS[t].gesetze[modus]) ids.add(id);
  ids.add("leistungsbilanz");
  return (Object.keys(LAWS) as LawId[]).filter((id) => ids.has(id)).map((id) => LAWS[id]);
}
