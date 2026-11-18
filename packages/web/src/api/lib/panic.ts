import { z } from "zod";
import { findQuote, normText, pagesOf } from "./citations";
import { UNTRUSTED_NOTE, wrapDocument } from "./untrusted";

/**
 * « Panik-Modus » (18 nov. 2026) — la veille d'un examen, une feuille de
 * secours tirée d'UN document de l'étudiant : les trois notions les plus
 * difficiles et les trois formules clés.
 *
 * Même règle que le Fall-Check : rien d'inventé. Chaque notion et chaque
 * formule recopie la phrase du document qui la porte ; cette phrase est
 * cherchée MOT POUR MOT dans le document (`groundCheatSheet`). Ce qui n'y est
 * pas ne s'affiche pas, et l'étudiant voit la page à côté de chaque ligne.
 * Une feuille de secours fausse, la veille d'un examen, serait pire que rien.
 *
 * Modèle rapide (Haiku), trois feuilles par jour et par compte (USER_LIMITS.panic).
 * Règles pures ici (tests/panic.test.ts) ; route POST /api/agent/panic.
 */

export const PANIC_ITEMS = 3;
/** Ce qu'on envoie du document, au plus (≈ 12 000 jetons pour le modèle rapide). */
export const PANIC_EXCERPT_CHARS = 48_000;
export const PANIC_PER_DAY = 3;

export const panicRequestSchema = z.object({
  documentId: z.string().min(1).max(100),
  locale: z.string().max(8).optional(),
});

export const panicModelSchema = z.object({
  konzepte: z
    .array(
      z.object({
        titel: z.string().min(2).max(90),
        kern: z.string().min(10).max(320).describe("Das Wesentliche in ein bis zwei Sätzen, nur aus dem Dokument"),
        beleg: z.string().min(10).max(400).describe("Der Satz aus dem Dokument, wörtlich kopiert"),
      }),
    )
    .max(PANIC_ITEMS + 2),
  formeln: z
    .array(
      z.object({
        name: z.string().min(2).max(90),
        latex: z.string().min(1).max(240).describe("Die Formel in LaTeX, ohne $"),
        bedeutung: z.string().min(5).max(260).describe("Was die Größen bedeuten, in einem Satz"),
        beleg: z.string().min(10).max(400).describe("Der Satz oder die Zeile aus dem Dokument, in der die Formel steht, wörtlich kopiert"),
      }),
    )
    .max(PANIC_ITEMS + 2),
});
export type PanicFromModel = z.infer<typeof panicModelSchema>;

export interface CheatSheet {
  concepts: Array<{ title: string; core: string; quote: string; page: number }>;
  formulas: Array<{ name: string; latex: string; meaning: string; quote: string; page: number }>;
}

/** Une formule LaTeX sans délimiteur, sur une ligne, sans commande qui sort du mode mathématique. */
export function cleanLatexForDisplay(latex: string): string | null {
  const out = latex.trim().replace(/^\$+|\$+$/g, "").replace(/\s*\n\s*/g, " ").trim();
  if (!out || /\\(input|include|write|def|newcommand|href|url|html)\b/i.test(out)) return null;
  return out;
}

/** Ne garde que ce qui est PROUVÉ par une phrase retrouvée dans le document ; au plus trois de chaque. */
export function groundCheatSheet(raw: PanicFromModel, textContent: string): CheatSheet {
  const pages = pagesOf(textContent);
  const seen = new Set<string>();
  const proven = (beleg: string): number | null => {
    const hit = findQuote(pages, beleg);
    if (!hit?.exact) return null;
    const key = normText(beleg);
    if (seen.has(key)) return null;
    seen.add(key);
    return hit.page;
  };
  const sheet: CheatSheet = { concepts: [], formulas: [] };
  for (const k of raw.konzepte) {
    const page = proven(k.beleg);
    if (page !== null && sheet.concepts.length < PANIC_ITEMS) sheet.concepts.push({ title: k.titel.trim(), core: k.kern.trim(), quote: k.beleg.trim(), page });
  }
  for (const f of raw.formeln) {
    const latex = cleanLatexForDisplay(f.latex);
    if (!latex) continue;
    const page = proven(f.beleg);
    if (page !== null && sheet.formulas.length < PANIC_ITEMS) sheet.formulas.push({ name: f.name.trim(), latex, meaning: f.bedeutung.trim(), quote: f.beleg.trim(), page });
  }
  return sheet;
}

export function panicSystemPrompt(langLabel: string): string {
  return `Du erstellst für TRED einen Notfall-Spickzettel aus dem Dokument einer Studentin oder eines Studenten. Die Klausur ist in weniger als 24 Stunden.

Gib aus:
- konzepte: die ${PANIC_ITEMS} anspruchsvollsten, am stärksten mathematisch-technischen Konzepte des Dokuments.
- formeln: die ${PANIC_ITEMS} wichtigsten Formeln des Dokuments.

STRENGE REGELN:
- Verwende NUR, was im Dokument steht. Kein Wissen von außen, keine erfundenen Formeln, Zahlen oder Begriffe.
- beleg: der Satz oder die Zeile aus dem Dokument (mindestens acht Wörter oder die ganze Formelzeile), die das Konzept bzw. die Formel trägt — WÖRTLICH kopiert, Zeichen für Zeichen, ohne Umformulierung, ohne Übersetzung.
- Jeder Eintrag stützt sich auf eine ANDERE Stelle des Dokuments.
- Direkt und knapp: keine Einleitung, kein Trost, keine Lerntipps.
- latex: die Formel so, wie sie im Dokument steht, in LaTeX, ohne Dollarzeichen.
- Sprache von titel, kern, name und bedeutung: ${langLabel}. Der Beleg bleibt in der Sprache des Dokuments.
- Marken wie [[SEITE 3]] sind Seitenangaben, kein Inhalt: nicht in den Beleg kopieren.
- Enthält das Dokument weniger als ${PANIC_ITEMS} belegbare Konzepte oder Formeln, gib weniger aus. Ein leeres Feld ist besser als ein erfundenes.

${UNTRUSTED_NOTE}`;
}

export function panicPrompt(doc: { title: string; kind: string }, excerpt: string): string {
  return wrapDocument({ title: doc.title, kind: doc.kind, content: excerpt });
}
