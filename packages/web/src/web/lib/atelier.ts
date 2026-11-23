/**
 * L'Atelier : les simulateurs interactifs de TRED, et le lien entre un thème
 * du plan d'étude et son simulateur.
 *
 * Un seul simulateur aujourd'hui (le diviseur de tension). En ajouter un :
 * une entrée ici, un composant, une ligne dans components/atelier.tsx.
 */
export interface Simulator {
  id: string;
  /** Mots (minuscules, sans accent) qui désignent ce simulateur dans un titre de tâche ou de chapitre. */
  keywords: string[];
  /** Le thème proposé à la page Exercices. */
  chapter: string;
}

export const SIMULATORS: Simulator[] = [
  {
    id: "spannungsteiler",
    keywords: ["spannungsteiler", "voltage divider", "diviseur de tension", "ohmsches gesetz", "ohm", "widerstand", "reihenschaltung", "gleichstrom", "netzwerk", "kirchhoff", "maschenregel", "resistor", "resistance", "elektrotechnik", "schaltung", "stromkreis", "circuit"],
    chapter: "Spannungsteiler",
  },
];

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Le simulateur qui correspond à un texte (titre de tâche, chapitre, matière), ou null. */
export function simulatorFor(...texts: (string | null | undefined)[]): Simulator | null {
  const hay = plain(texts.filter(Boolean).join(" "));
  if (!hay.trim()) return null;
  return SIMULATORS.find((s) => s.keywords.some((k) => new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(hay))) ?? null;
}

export const atelierHref = (id: string) => `/explorer?atelier=${encodeURIComponent(id)}`;

/** La page Exercices, préremplie sur un thème (et une matière). */
export function exercisesHref(chapter: string, subject = ""): string {
  const q = new URLSearchParams();
  if (subject.trim()) q.set("subject", subject.trim());
  if (chapter.trim()) q.set("chapter", chapter.trim());
  const s = q.toString();
  return s ? `/exercises?${s}` : "/exercises";
}

/**
 * Où mène une tâche du plan d'étude : son simulateur s'il existe (les exercices
 * du thème sont proposés à côté), sinon directement les exercices du thème.
 */
export function studyTaskHref(topic: string, subject = ""): string {
  const sim = simulatorFor(topic, subject);
  if (!sim) return exercisesHref(topic, subject);
  const q = new URLSearchParams({ atelier: sim.id });
  if (topic.trim()) q.set("topic", topic.trim());
  if (subject.trim()) q.set("subject", subject.trim());
  return `/explorer?${q.toString()}`;
}
