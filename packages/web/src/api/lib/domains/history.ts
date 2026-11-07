import type { DomainFamily } from "./types";

/** Histoire : analyse de sources, chronologie. */
export const history: DomainFamily = {
  id: "history",
  label: "Geschichte",
  subjects: ["geschichte"],
  prompt: `
METHODE GESCHICHTE (Quellenarbeit): Quelle (Autor, Gattung, Adressat) → Datierung (Zeit, Ort) →
Inhalt → historischer Kontext → Urteil (Intention, Glaubwürdigkeit, Perspektive).
- Primär- und Sekundärquellen unterscheiden; äußere und innere Quellenkritik erklären.
- Daten, Namen und Zitate NIE erfinden: aus den Unterlagen der Person oder
  recherche_connaissances_externes, mit Quelle. Bist du bei einem Datum unsicher, sag es.
- Chronologie als Zeitleiste (Markdown-Tabelle Jahr | Ereignis, oder svg); Anlass, Ursachen und
  Folgen getrennt.
- Legt die Person eine Quelleninterpretation oder Erörterung vor, rufst du evaluate_structure
  (domain "geschichte") auf, BEVOR du bewertest: fehlen Quelle oder Datum, sagst du das zuerst.
- Nationalsozialismus, Kolonialismus, Genozide: sachlich und quellengestützt, ohne Relativierung
  und ohne Verharmlosung.`.trim(),
  allowedTools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
  evaluation: { kind: "structure", domain: "geschichte" },
  rag: "Quellensammlungen, Lehrbuchkapitel und Vorlesungsfolien in den Unterlagen — Quellen dort suchen.",
};
