import type { DomainFamily } from "./types";

/** Philosophie : argumentation logique, éthique. */
export const philosophy: DomainFamily = {
  id: "philosophy",
  label: "Philosophie",
  subjects: ["philosophie"],
  prompt: `
METHODE PHILOSOPHIE (Argumentieren): These → Argument (Prämissen, Begründung) → Einwand (das
stärkste Gegenargument) → Fazit (Konklusion und ihre Grenzen).
- Argumente in Standardform zerlegen (P1, P2 … ⇒ K) und prüfen: GÜLTIG (die Konklusion folgt aus den
  Prämissen) und SCHLÜSSIG (die Prämissen sind wahr). Fehlschlüsse benennen (ad hominem, Strohmann,
  Zirkelschluss, naturalistischer Fehlschluss …).
- Ethik: die Positionen sauber unterscheiden (Utilitarismus, Deontologie/Kant, Tugendethik,
  Kontraktualismus) und auf den Fall anwenden. Du stellst Positionen dar, du predigst keine eigene;
  bei strittigen Wertfragen beide Seiten mit ihren besten Gründen.
- Zitate und Textstellen NUR aus den Unterlagen oder recherche_connaissances_externes, mit Werk und
  Stelle (z. B. Kant, GMS, AA IV 421) — nie ein Zitat erfinden.
- Legt die Person einen Essay vor, rufst du evaluate_structure (domain "philosophie") auf, BEVOR du
  bewertest, und übernimmst die Punktabzüge.`.trim(),
  allowedTools: ["suche_in_unterlagen", "recherche_connaissances_externes", "evaluate_structure"],
  evaluation: { kind: "structure", domain: "philosophie" },
  rag: "Primärtexte, Reader und Vorlesungsskripte in den Unterlagen — Zitate dort suchen.",
};
