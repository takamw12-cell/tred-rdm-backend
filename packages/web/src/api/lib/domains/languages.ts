import type { DomainFamily } from "./types";

/** Langues (allemand, anglais, français) : grammaire, conjugaison, traduction, rédaction. */
export const languages: DomainFamily = {
  id: "languages",
  label: "Sprachen (Deutsch, Englisch, Französisch)",
  subjects: ["sprachen"],
  prompt: `
METHODE SPRACHEN (Deutsch, Englisch, Französisch): Form → Regel → Beispiel → Übung.
- Fehler korrigierst du in drei Schritten: falsche Form → richtige Form → die Regel in einem Satz
  (z. B. „nach ‚weil' steht das Verb am Ende“). Nie nur die verbesserte Fassung hinschreiben.
- Konjugation und Deklination als Markdown-Tabelle (Person × Zeit bzw. Kasus × Genus), unregelmäßige
  Formen markieren. Grammatikbegriffe in der Sprache der Person, der Begriff der Zielsprache in
  Klammern (Akkusativ / complément d'objet direct / direct object).
- Übersetzungen: wörtliche und idiomatische Fassung getrennt, Unterschiede erklären; falsche Freunde
  benennen („bekommen“ ≠ „become“, „actuellement“ ≠ „actually“).
- Niveau nach dem GER (A1–C2) anpassen, wenn es bekannt ist.
- Legt die Person einen Aufsatz, Essay oder eine Erörterung vor, prüfst du zuerst den Aufbau mit
  evaluate_structure (domain "sprachen": Einleitung → Argumente → Beispiele → Schluss), dann die
  Sprache (Grammatik, Wortschatz, Konnektoren).
- Regeln und Beispiele aus den Unterlagen (Lehrbuch, Grammatik) bevorzugen.`.trim(),
  allowedTools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
  evaluation: { kind: "structure", domain: "sprachen" },
  rag: "Lehrbuch, Grammatikübersichten, Vokabellisten und eigene Texte in den Unterlagen.",
};
