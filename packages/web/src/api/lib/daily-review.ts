/**
 * Les cartes du jour (2026-11-15) : parmi les cartes DUES, les cinq à
 * proposer aujourd'hui sur le Dashboard.
 *
 * La répétition espacée existe déjà (lib/flashcards.ts, type SM-2 : facilité,
 * intervalle, échecs) : elle dit QUAND une carte est due. Ici on choisit
 * lesquelles montrer en premier — celles qui touchent les concepts les plus
 * fragiles de l'étudiant (lib/concept-mastery.ts), puis les plus en retard,
 * puis les plus souvent ratées.
 *
 * Module pur : la route (routes/flashcards.ts) fournit les cartes dues et les
 * concepts fragiles du compte de la session.
 */
import { conceptKey } from "./concept-mastery";

export const DAILY_CARDS = 5;

export interface DueCard {
  topic: string;
  frontContent: string;
  nextReviewDate: Date | number;
  lapses: number;
}

const time = (v: Date | number) => (v instanceof Date ? v.getTime() : Number(v));

/**
 * Rang d'une carte : i si elle NOMME le i-ème concept fragile (dans sa
 * matière ou sa question) ; N + i si elle n'en partage que la matière — une
 * carte qui nomme un concept fragile, même le moins fragile, passe donc avant
 * toute carte « de la même matière ». Les cinq places couvrent ainsi d'abord
 * les concepts eux-mêmes. `Infinity` : aucun lien avec un concept fragile.
 */
function weakRank(card: DueCard, weak: { concept: string; topic: string }[]): number {
  const topic = conceptKey(card.topic ?? "");
  const text = ` ${topic} ${conceptKey(card.frontContent ?? "")} `.replace(/ /g, "");
  let best = Number.POSITIVE_INFINITY;
  weak.forEach((w, i) => {
    const concept = conceptKey(w.concept ?? "").replace(/ /g, "");
    const subject = conceptKey(w.topic ?? "");
    if (concept.length >= 3 && text.includes(concept)) best = Math.min(best, i);
    else if (subject.length >= 3 && subject === topic) best = Math.min(best, weak.length + i);
  });
  return best;
}

/** Les cartes à proposer aujourd'hui, dans l'ordre. Ne modifie pas la liste reçue. */
export function pickDailyCards<T extends DueCard>(due: readonly T[], weak: readonly { concept: string; topic: string }[], limit: number = DAILY_CARDS): T[] {
  const list = [...weak];
  return due
    .map((card, index) => ({ card, index, rank: weakRank(card, list) }))
    .sort((a, b) => a.rank - b.rank || time(a.card.nextReviewDate) - time(b.card.nextReviewDate) || b.card.lapses - a.card.lapses || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.card);
}
