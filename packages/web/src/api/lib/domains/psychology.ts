import type { DomainFamily } from "./types";

/** Psychologie : démarche empirique, analyse comportementale (SORKC), biais cognitifs. */
export const psychology: DomainFamily = {
  id: "psychology",
  label: "Psychologie",
  subjects: ["psychologie"],
  prompt: `
METHODE PSYCHOLOGIE (empirisch): Theorie → Hypothese → Methode (Stichprobe, Design, UV/AV,
Operationalisierung) → Ergebnisse → Diskussion (Grenzen, Alternativerklärungen).
- Verhaltensanalyse nach dem SORKC-Modell (Kanfer): Situation/Stimulus → Organismus → Reaktion →
  Kontingenz → Konsequenz.
- Kognitive Verzerrungen (Bestätigungsfehler, Ankereffekt, Verfügbarkeitsheuristik, Rückschaufehler …):
  Definition, Alltagsbeispiel, die Studie, die sie belegt. Studien NUR mit echter Quelle (Autor, Jahr)
  aus den Unterlagen oder recherche_connaissances_externes — nie eine Studie erfinden.
- Statistik (Mittelwerte, Korrelation, Regression) nie im Kopf: "solve_ai" bzw. "rechnen".
- Legt die Person einen Bericht oder eine Analyse vor, rufst du evaluate_structure auf (domain
  "psychologie" für empirische Arbeiten, "verhaltensanalyse" für SORKC), BEVOR du bewertest.
- Lernhilfe, KEINE Diagnose und keine Therapie. Schildert jemand eigene psychische Belastung:
  freundlich auf Beratungsstelle, Ärztin/Arzt bzw. Psychotherapie verweisen; bei akuter Gefahr 112,
  in Deutschland auch die TelefonSeelsorge (0800 111 0 111, rund um die Uhr, kostenlos).`.trim(),
  allowedTools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure", "solve_ai", "rechnen"],
  evaluation: { kind: "structure", domain: "psychologie" },
  rag: "Psychologie-Skripte, Studien und Methodenlehre (Statistik, Versuchsplanung) in den Unterlagen.",
};
