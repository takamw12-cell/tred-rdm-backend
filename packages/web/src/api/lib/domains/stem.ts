import type { DomainFamily } from "./types";

/** Maths, physique, informatique, ingénierie : les solveurs existants. */
export const stem: DomainFamily = {
  id: "stem",
  label: "MINT / Ingenieurwissenschaften",
  subjects: ["mathematik", "physik", "mechanik", "elektrotechnik", "thermodynamik", "informatik", "ki", "datenverarbeitung", "technisches_zeichnen", "stroemungslehre", "regelungstechnik", "werkstoffkunde", "dampf_kaeltetechnik", "chemie"],
  // Le prompt principal (NIVEAU 1–10) EST la méthode STEM : rien à ajouter.
  prompt: "",
  allowedTools: [
    "rechnen", "balkenstatik", "statik_berechnen", "schaltung_berechnen", "thermo_berechnen", "physik_berechnen",
    "mathe_berechnen", "solve_cyber", "solve_ai", "solve_open_math", "elektro_berechnen", "werkstoff_berechnen",
    "chemie_berechnen", "schule_berechnen", "skizze", "suche_in_unterlagen",
    "recherche_connaissances_externes",
  ],
  evaluation: { kind: "solver" },
  rag: "Skripte, Übungsblätter und Altklausuren des Kurses (Formeln, Musterlösungen).",
};
