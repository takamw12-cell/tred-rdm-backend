/**
 * Carte de maîtrise : relie un concept de l'Engineering DNA aux lacunes
 * réelles que le tuteur a diagnostiquées (table misconception — « Denklücken »).
 *
 *   lacune OUVERTE qui touche le concept   → weak     (rouge)
 *   lacunes toutes RÉSOLUES                → mastered (vert)
 *   rien de diagnostiqué                   → untested (gris)
 *
 * Correspondance lexicale (sans IA, instantanée) : un mot significatif du
 * concept (≥ 5 lettres, sans accents) présent dans le sujet ou l'intitulé de
 * la lacune. « Biegemoment » rattrape « Biegemoment am Kragarm falsch ».
 */
export type MasteryState = "mastered" | "weak" | "untested";

export interface GapLike {
  topic: string;
  label: string;
  status: string;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss");

export function conceptKeywords(label: string): string[] {
  return norm(label)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 5);
}

export function masteryFor<G extends GapLike>(
  conceptLabel: string,
  gaps: G[],
): { state: MasteryState; mastery: number; open: G[]; resolved: G[] } {
  const keys = conceptKeywords(conceptLabel);
  const hits = gaps.filter((g) => {
    const hay = norm(`${g.topic} ${g.label}`);
    return keys.some((k) => hay.includes(k));
  });
  const open = hits.filter((g) => g.status === "open");
  const resolved = hits.filter((g) => g.status === "resolved");
  if (hits.length === 0) return { state: "untested", mastery: 0, open, resolved };
  return {
    state: open.length > 0 ? "weak" : "mastered",
    mastery: Math.round((resolved.length / hits.length) * 100),
    open,
    resolved,
  };
}
