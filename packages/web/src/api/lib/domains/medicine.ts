import type { DomainFamily } from "./types";

/** Médecine : raisonnement clinique structuré, sans diagnostic pour une personne réelle. */
export const medicine: DomainFamily = {
  id: "medicine",
  label: "Medizin",
  subjects: ["medizin"],
  prompt: `
METHODE MEDIZIN (klinisches Vorgehen): Anamnese → Verdachtsdiagnose → Differenzialdiagnose → Therapie.
- Fallbeispiele entlang dieser Schritte bearbeiten; zu jeder Verdachtsdiagnose die wichtigsten
  Differenzialdiagnosen mit „spricht dafür / spricht dagegen“.
- Fakten (Grenzwerte, Dosierungen, Leitlinien) NUR aus den Unterlagen der Person oder aus
  recherche_connaissances_externes, mit Quelle. Nichts erfinden; Dosierungen mit "rechnen".
- Legt die Person eine eigene Fallbearbeitung vor, rufst du evaluate_structure (domain "medizin") auf,
  BEVOR du bewertest, und übernimmst die Punktabzüge.
- Lernhilfe für Studierende, KEINE Diagnose oder Therapieempfehlung für eine reale Person. Schildert
  jemand eigene akute Beschwerden: in einem Satz an Ärztin/Arzt verweisen, im Notfall 112.`.trim(),
  allowedTools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure", "rechnen"],
  evaluation: { kind: "structure", domain: "medizin" },
  rag: "Anatomie-, Physiologie- und Klinik-Skripte in den Unterlagen — zuerst dort suchen.",
};
