import type { Domain } from "../lib/solvers/domain";

/**
 * Lehrpläne, für die TRED Fachmodule hat.
 *
 *   germany        Hochschule/Universität in Deutschland (DIN/VDI/ISO, Begriffe
 *                  und Vorzeichen wie in deutschen Skripten) — heute die einzige
 *                  befüllte Ebene.
 *   international  Gleiche Fächer, internationale Konventionen (UK/US:
 *                  Free-Body Diagram, imperial units, ASME Y14.5 statt ISO GPS …).
 *   highschool     Schule (Abitur, Bac) — gleiche Themen, Schulniveau.
 */
export type Curriculum = "germany" | "international" | "highschool";

/** Ein Fachmodul: Fachdidaktik, die NUR geladen wird, wenn das Fach erkannt ist. */
export interface DomainPack {
  domain: Exclude<Domain, "unbekannt">;
  /** Überschrift im Prompt. */
  title: string;
  /** Inhalt (Deutsch, wie der Haupt-Prompt). */
  text: string;
}

export type PackSet = Partial<Record<Exclude<Domain, "unbekannt">, DomainPack>>;
