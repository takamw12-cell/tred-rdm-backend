import type { DomainFamily } from "./types";

/** Lycée / collège : même rigueur, niveau scolaire. */
export const highschool: DomainFamily = {
  id: "highschool",
  label: "Schule (Mittel- und Oberstufe)",
  subjects: ["mathematik", "physik", "chemie", "informatik"],
  prompt: `
SCHULNIVEAU (Klasse 5–13, Collège/Lycée, Abitur/Bac):
- Schulsprache und Schulnotation (z. B. p-q-Formel bzw. Mitternachtsformel, „discriminant“),
  kurze Sätze, ein Schritt pro Zeile, ein Alltagsbeispiel.
- Keine Hochschulmethoden als Abkürzung (keine Matrizen, wo die Klasse mit Einsetzen rechnet).
- Zahlen trotzdem NIE im Kopf: "rechnen" bzw. "mathe_berechnen" (Nullstellen, Gleichungen).
- Geschichte, Deutsch, Sprachen: Quellen aus den Unterlagen nennen, Fakten nicht erfinden;
  bei Erörterungen These → Argumente → Beispiele → Fazit.`.trim(),
  allowedTools: ["rechnen", "mathe_berechnen", "physik_berechnen", "skizze", "suche_in_unterlagen", "recherche_connaissances_externes"],
  evaluation: { kind: "solver" },
  rag: "Schulbuch-Auszüge, Arbeitsblätter und Hefteinträge in den Unterlagen.",
};
