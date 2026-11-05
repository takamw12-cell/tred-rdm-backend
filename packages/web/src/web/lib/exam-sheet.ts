/**
 * Une Klausur prête à passer : des tâches (énoncé + points) et la correction.
 *
 * La Klausur générée par le serveur (mode « klausur », Stilvorlage =
 * l'Altklausur de l'étudiant) arrive en UN texte. On le découpe en tâches
 * aux en-têtes « Aufgabe N », en lisant les points annoncés (« (12 Punkte) »,
 * « 12 P. », « [12 Pkt] »). Si le découpage échoue, la Klausur reste une
 * seule tâche — jamais de perte de contenu.
 */
export interface ExamTask {
  id: string;
  title: string;
  points: number;
  prompt: string;
  /** Correction propre à la tâche (Beispielklausur) ; sinon correction globale. */
  solution?: string;
}

export interface ExamSheet {
  title: string;
  tasks: ExamTask[];
  totalPoints: number;
  /** Correction complète (Klausur générée). */
  solution?: string;
  /** Bewertungsschema. */
  scale?: string;
  /** Document du prof dont le style a été repris ; null = aucun trouvé. */
  styleSource?: { id: string; title: string; kind: string } | null;
  /** false = Beispielklausur intégrée (génération impossible). */
  generated: boolean;
}

const HEADING_RE = /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*)?[ \t]*Aufgabe[ \t]+(\d+)\b[^\n]*$/gim;
const POINTS_RE = /(\d+(?:[.,]5)?)\s*(?:Punkte?|Pkt\.?|P\.)(?![a-zäöü])/i;

export function splitTasks(statement: string, totalPoints: number): ExamTask[] {
  const heads = [...statement.matchAll(HEADING_RE)];
  if (heads.length < 2) {
    return [{ id: "t1", title: "Klausur", points: Math.max(0, totalPoints), prompt: statement.trim() }];
  }
  const tasks: ExamTask[] = heads.map((h, i) => {
    const start = h.index ?? 0;
    const end = i + 1 < heads.length ? (heads[i + 1]!.index ?? statement.length) : statement.length;
    const heading = h[0];
    const body = statement.slice(start + heading.length, end).trim();
    const pts = POINTS_RE.exec(heading) ?? POINTS_RE.exec(body.slice(0, 200));
    const title = heading
      .replace(/^[ \t]*#{1,6}[ \t]*/, "")
      .replace(/\*\*/g, "")
      .replace(/\s*[([]?\s*\d+(?:[.,]5)?\s*(?:Punkte?|Pkt\.?|P\.)\s*[)\]]?/i, "")
      .trim();
    return {
      id: `t${i + 1}`,
      title: title || `Aufgabe ${h[1]}`,
      points: pts ? Number(pts[1]!.replace(",", ".")) : 0,
      prompt: body,
    };
  });
  // Points manquants : on répartit le reste du total sur les tâches sans points.
  const known = tasks.reduce((s, t) => s + t.points, 0);
  const missing = tasks.filter((t) => t.points === 0);
  if (missing.length && totalPoints > known) {
    const each = Math.floor((totalPoints - known) / missing.length);
    for (const t of missing) t.points = each;
  }
  // Texte avant la première « Aufgabe » (consignes, hilfsmittel) : gardé.
  const preamble = statement.slice(0, heads[0]!.index ?? 0).trim();
  if (preamble) tasks[0]!.prompt = `${preamble}\n\n${tasks[0]!.prompt}`;
  return tasks;
}
