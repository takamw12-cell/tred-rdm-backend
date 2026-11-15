import { z } from "zod";
import { findQuote, normText, pagesOf } from "./citations";
import { UNTRUSTED_NOTE, wrapDocument } from "./untrusted";

/**
 * « Fall-Check » (2026-11-15) — un défi tiré du document de l'étudiant.
 *
 * Règle du fondateur : zéro hallucination. Le modèle propose des cas, mais
 * chacun doit recopier la phrase du document qui prouve sa réponse ; cette
 * phrase est ensuite cherchée MOT POUR MOT dans le texte du document
 * (`groundChallenge`). Un cas dont la preuve n'y est pas ne sort jamais, et
 * l'étudiant voit toujours la phrase et sa page à côté de la réponse.
 *
 * Règles pures ici (tests/doc-challenge.test.ts) ; la route est
 * POST /api/agent/doc-challenge dans api/index.ts.
 */

/** Diagnostic (médecine), arbre de décision (droit), notion (toutes filières). */
export const CHALLENGE_MODES = ["diagnosis", "decision", "concept"] as const;
export type ChallengeMode = (typeof CHALLENGE_MODES)[number];

export const CHALLENGE_CASES = 4;
export const CHALLENGE_OPTIONS = 4;
/** Ce qu'on envoie du document, au plus (≈ 6 000 jetons). */
export const CHALLENGE_EXCERPT_CHARS = 24_000;

export const challengeRequestSchema = z.object({
  documentId: z.string().min(1).max(100),
  mode: z.enum(CHALLENGE_MODES),
  locale: z.string().max(8).optional(),
});

export const challengeModelSchema = z.object({
  faelle: z
    .array(
      z.object({
        situation: z.string().min(10).max(700).describe("Der Fall / die Ausgangslage, nur mit Angaben aus dem Dokument"),
        frage: z.string().min(5).max(300),
        optionen: z.array(z.string().min(1).max(200)).length(CHALLENGE_OPTIONS),
        richtig: z.number().int().min(0).max(CHALLENGE_OPTIONS - 1),
        beleg: z.string().min(20).max(500).describe("Der Satz aus dem Dokument, WÖRTLICH kopiert, der die richtige Antwort belegt"),
        erklaerung: z.string().min(5).max(500).describe("1–2 Sätze: wie der Beleg zur richtigen Antwort führt"),
      }),
    )
    .min(1)
    .max(CHALLENGE_CASES + 2),
});
export type ChallengeFromModel = z.infer<typeof challengeModelSchema>;

export interface ChallengeQuestion {
  situation: string;
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  /** La phrase du document, telle que le modèle l'a recopiée — et qu'on y a retrouvée. */
  quote: string;
  /** La page du document où elle se trouve. */
  page: number;
}

/**
 * Ne garde que les cas PROUVÉS : la phrase citée est dans le document, mot
 * pour mot (à la casse et à la ponctuation près). « Presque » ne suffit pas —
 * une reformulation peut changer un mot, et donc le sens. Écarte aussi les
 * options en double et deux cas bâtis sur la même phrase ; mélange les
 * options. `rand` est injectable pour les tests.
 */
export function groundChallenge(raw: ChallengeFromModel, textContent: string, rand: () => number = Math.random): ChallengeQuestion[] {
  const pages = pagesOf(textContent);
  const seen = new Set<string>();
  const out: ChallengeQuestion[] = [];
  for (const f of raw.faelle) {
    if (new Set(f.optionen.map((o) => o.trim().toLowerCase())).size !== f.optionen.length) continue;
    const hit = findQuote(pages, f.beleg);
    if (!hit?.exact) continue;
    const key = normText(f.beleg);
    if (seen.has(key)) continue;
    seen.add(key);
    const order = f.optionen.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    out.push({
      situation: f.situation.trim(),
      question: f.frage.trim(),
      options: order.map((i) => f.optionen[i]!.trim()),
      correct: order.indexOf(f.richtig),
      explanation: f.erklaerung.trim(),
      quote: f.beleg.trim(),
      page: hit.page,
    });
  }
  return out.slice(0, CHALLENGE_CASES);
}

/**
 * La partie du document envoyée au modèle. Un document court part entier ; un
 * long, par une fenêtre qui commence au début d'une page tirée au sort — deux
 * parties ne portent donc pas toujours sur les mêmes pages.
 */
export function excerptFor(textContent: string, maxChars: number = CHALLENGE_EXCERPT_CHARS, rand: () => number = Math.random): string {
  if (textContent.length <= maxChars) return textContent;
  const starts = [...textContent.matchAll(/\[\[SEITE \d+\]\]/g)].map((m) => m.index ?? 0).filter((i) => i + Math.min(maxChars, 2000) <= textContent.length);
  const start = starts.length ? starts[Math.min(starts.length - 1, Math.floor(rand() * starts.length))]! : 0;
  return textContent.slice(start, start + maxChars);
}

const MODE_RULES: Record<ChallengeMode, string> = {
  diagnosis:
    "MODUS Diagnose: Jeder Fall beschreibt eine Patientin oder einen Patienten NUR mit Symptomen, Befunden und Werten, die im Dokument genau diesem Krankheitsbild zugeordnet sind. Gefragt ist die Diagnose (oder der nächste diagnostische Schritt, wenn das Dokument ihn nennt). Die falschen Antworten sind andere Krankheitsbilder oder Schritte AUS DEM DOKUMENT. Enthält das Dokument keine klinischen Inhalte, erzeuge stattdessen Fälle nach den Regeln des Modus Begriff.",
  decision:
    "MODUS Entscheidung: Jeder Fall schildert einen kurzen Sachverhalt, auf den eine Norm, Regel, Voraussetzung oder Ausnahme AUS DEM DOKUMENT passt. Gefragt ist die einschlägige Norm oder Regel bzw. ob die Ausnahme greift. Die falschen Antworten sind andere Normen, Regeln oder Ausnahmen AUS DEM DOKUMENT. Erfinde keine Paragraphen und keine Rechtsprechung.",
  concept:
    "MODUS Begriff: Jeder Fall ist eine kurze Anwendungssituation zu einem Begriff, einer Formel oder einem Verfahren AUS DEM DOKUMENT. Gefragt ist, was laut Dokument gilt. Die falschen Antworten sind die typischen Verwechslungen mit anderen Inhalten des Dokuments.",
};

export function challengeSystemPrompt(mode: ChallengeMode, langLabel: string): string {
  return `Du erstellst für TRED ein Lernspiel ausschließlich aus dem Dokument einer Studentin oder eines Studenten.

Erzeuge ${CHALLENGE_CASES} bis ${CHALLENGE_CASES + 2} Fälle mit je einer Frage und ${CHALLENGE_OPTIONS} Antworten, genau eine richtig.

${MODE_RULES[mode]}

STRENGE REGELN:
- Verwende NUR, was im Dokument steht. Kein Wissen von außen, keine erfundenen Zahlen, Symptome, Normen oder Namen.
- beleg: der Satz (oder Teilsatz, mindestens acht Wörter) aus dem Dokument, der die richtige Antwort belegt — WÖRTLICH kopiert, Zeichen für Zeichen, ohne Auslassung, ohne Umformulierung, ohne Übersetzung. Ein Beleg, der nicht wörtlich im Dokument steht, wird verworfen.
- Jeder Fall stützt sich auf eine ANDERE Stelle des Dokuments.
- Die richtige Antwort darf nicht wörtlich in der Fallbeschreibung stehen.
- Kurz: Fall höchstens 3 Sätze, Antworten höchstens 12 Wörter.
- erklaerung: 1–2 Sätze, die nur wiedergeben, was der Beleg sagt.
- Sprache von Fall, Frage, Antworten und Erklärung: ${langLabel}. Der Beleg bleibt in der Sprache des Dokuments. Fachbegriffe des Dokuments bleiben unverändert.
- Marken wie [[SEITE 3]] sind Seitenangaben, kein Inhalt: nicht in den Beleg kopieren.
- Reicht das Dokument nicht für ${CHALLENGE_CASES} belegte Fälle, erzeuge weniger.

${UNTRUSTED_NOTE}`;
}

/** Le document, enfermé dans sa balise : il ne peut pas la fermer lui-même. */
export function challengePrompt(doc: { title: string; kind: string }, excerpt: string): string {
  return wrapDocument({ title: doc.title, kind: doc.kind, content: excerpt });
}
