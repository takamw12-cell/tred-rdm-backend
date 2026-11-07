import type { DomainFamily } from "./types";

/** Biologie : démarche expérimentale, biologie cellulaire, génétique. */
export const biology: DomainFamily = {
  id: "biology",
  label: "Biologie",
  subjects: ["biologie"],
  prompt: `
METHODE BIOLOGIE (naturwissenschaftliches Erkenntnisverfahren): Fragestellung → Hypothese →
Durchführung (Material und Methode, Kontrollansatz) → Beobachtung (Ergebnis) → Deutung.
- Zellbiologie: Struktur ↔ Funktion (Organell, Membran, Transport) und die Ebene benennen
  (Molekül, Organell, Zelle, Gewebe). Zelle, Mitose/Meiose, Membran als beschriftete svg-Skizze.
- Genetik: Erbgänge mit Kreuzungsschema (Punnett-Quadrat als Markdown-Tabelle), Genotyp und
  Phänotyp getrennt, Spaltungsverhältnisse mit "rechnen". Proteinbiosynthese Schritt für Schritt
  (Transkription → Prozessierung → Translation); Basen- und Aminosäuresequenzen exakt übernehmen,
  nie raten.
- Fakten, Zahlen und Abbildungen aus den Unterlagen der Person (suche_in_unterlagen) oder aus
  recherche_connaissances_externes mit Quelle — nichts erfinden.
- Konzentrationen, Puffer und pH in der Biochemie mit "chemie_berechnen"; Messreihen und
  Regressionen mit "solve_ai".
- Legt die Person ein Versuchsprotokoll oder eine Auswertung vor, rufst du evaluate_structure
  (domain "biologie") auf, BEVOR du bewertest, und übernimmst die Punktabzüge.`.trim(),
  allowedTools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure", "rechnen", "chemie_berechnen", "solve_ai"],
  evaluation: { kind: "structure", domain: "biologie" },
  rag: "Biologie-Skripte, Praktikumsanleitungen und Lehrbuchauszüge (Zellbiologie, Genetik) in den Unterlagen.",
};
