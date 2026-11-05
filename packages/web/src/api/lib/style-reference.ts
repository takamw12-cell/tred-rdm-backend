/**
 * Choix de la « Stilvorlage » pour la génération d'exercices : le document du
 * Lehrender dont le nouvel exercice doit reprendre le style.
 *
 * Règles, dans l'ordre :
 *   1. une Altklausur (kind = "klausur") passe avant un Übungsblatt ("uebung") ;
 *   2. à type égal, le document qui parle le plus du sujet demandé
 *      (Fach / Kapitel) — compté dans le titre et le début du texte ;
 *   3. à égalité, le plus récent.
 *
 * Module pur : testé dans tests/style-reference.test.ts.
 */

/** Longueur de l'extrait de la vorlage injecté dans le prompt. Assez pour
 *  voir l'en-tête, deux ou trois Aufgaben et la répartition des points. */
export const STYLE_SAMPLE_CHARS = 8000;

export interface StyleCandidate {
  id: string;
  title: string;
  kind: string;
  textContent: string;
  createdAt?: Date | number | null;
}

const terms = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 4);

export function pickStyleReference<T extends StyleCandidate>(docs: T[], query: string): T | null {
  const usable = docs.filter(
    (d) => (d.kind === "klausur" || d.kind === "uebung") && d.textContent.trim().length > 200,
  );
  if (usable.length === 0) return null;

  const q = new Set(terms(query));
  const score = (d: T) => {
    const hay = terms(`${d.title} ${d.title} ${d.textContent.slice(0, 20000)}`);
    let hits = 0;
    for (const t of hay) if (q.has(t)) hits++;
    return hits;
  };
  const time = (d: T) => (d.createdAt ? new Date(d.createdAt).getTime() : 0);

  return [...usable].sort(
    (a, b) =>
      Number(b.kind === "klausur") - Number(a.kind === "klausur") ||
      score(b) - score(a) ||
      time(b) - time(a),
  )[0];
}
