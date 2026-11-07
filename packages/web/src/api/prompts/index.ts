import type { Domain, DomainGuess } from "../lib/solvers/domain";
import { GERMANY } from "./germany";
import { HIGHSCHOOL } from "./highschool";
import { INTERNATIONAL } from "./international";
import type { Curriculum, DomainPack, PackSet } from "./types";

export type { Curriculum, DomainPack } from "./types";

/**
 * Domain-Based Agent : der Haupt-Prompt (agent/index.ts, gecacht) enthält
 * die Fachdidaktik im Überblick (NIVEAU 2c). Erkennt lib/solvers/domain.ts
 * das Fach der Frage, wird zusätzlich das passende FACHMODUL geladen — als
 * eigene, nicht gecachte System-Nachricht, zusammen mit dem Löser-Hinweis.
 *
 * Ein Lehrplan ohne eigenes Modul fällt auf "germany" zurück : ein
 * internationales oder schulisches Modul ergänzt, es muss nicht alles neu
 * schreiben.
 */
const SETS: Record<Curriculum, PackSet> = {
  germany: GERMANY,
  international: INTERNATIONAL,
  highschool: HIGHSCHOOL,
};

export function domainPack(domain: Domain, curriculum: Curriculum = "germany"): DomainPack | null {
  if (domain === "unbekannt") return null;
  return SETS[curriculum][domain] ?? GERMANY[domain] ?? null;
}

/**
 * Text für das Modell : Hauptfach vollständig ; ein zweites Fach nur, wenn es
 * deutlich mitspielt (sonst wird der Prompt lang, ohne dass die Antwort gewinnt).
 */
export function domainPackText(g: DomainGuess, curriculum: Curriculum = "germany"): string | null {
  const main = domainPack(g.domain, curriculum);
  if (!main) return null;
  const parts = [`FACHMODUL ${main.title.toUpperCase()} (automatisch geladen, Lehrplan: ${curriculum})`, main.text.trim()];
  const second = g.also[0] ? domainPack(g.also[0], curriculum) : null;
  if (second && second.domain !== main.domain) {
    parts.push(`ZWEITES FACH — ${second.title}: siehe NIVEAU 2c; Fachmodul auf Nachfrage.`);
  }
  return parts.join("\n");
}

/** Welcher Lehrplan gilt? Heute immer Deutschland — das Studienprofil bekommt später Land und Stufe. */
export function curriculumFor(profile?: unknown): Curriculum {
  const p = (profile ?? {}) as { country?: unknown; level?: unknown };
  if (p.level === "school") return "highschool";
  if (typeof p.country === "string" && p.country && p.country.toUpperCase() !== "DE") return "international";
  return "germany";
}
