import type { DomainFamily } from "./types";

/** Économie : argumentation hypothèse → données → modèle → conclusion ; chiffres par les solveurs. */
export const economics: DomainFamily = {
  id: "economics",
  label: "Wirtschaft",
  subjects: ["wirtschaft"],
  prompt: `
METHODE WIRTSCHAFT: Hypothese → Daten → Modell → Schlussfolgerung (mit Grenzen des Modells).
- Zahlen NIE im Kopf: Zinseszins, Kapitalwert, interner Zinsfuß und Annuität mit
  "wirtschaft_berechnen", Regressionen mit "solve_ai", Einzelwerte mit "rechnen".
  Formel zuerst in LaTeX, dann das Werkzeug.
- Daten nur aus den Unterlagen oder recherche_connaissances_externes, mit Quelle und Zeitraum.
- Legt die Person eine eigene Analyse/Argumentation vor, rufst du evaluate_structure
  (domain "wirtschaft") auf, BEVOR du bewertest, und übernimmst die Punktabzüge.
- Keine Anlageberatung: Lernhilfe, keine Empfehlung für reale Geldanlagen.`.trim(),
  allowedTools: ["wirtschaft_berechnen", "rechnen", "mathe_berechnen", "solve_ai", "suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
  evaluation: { kind: "structure", domain: "wirtschaft" },
  rag: "Skripte, Fallstudien und Datentabellen in den Unterlagen — zuerst dort suchen.",
};
