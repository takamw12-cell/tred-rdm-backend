/**
 * Tafel-Modus — découpe une réponse du tuteur en deux voix.
 *
 *   [[REASONING]] @@STEP: Physik … [[/REASONING]]   (format du prompt, NIVEAU 7)
 *   [[TAFEL schritt="Physik"]] … [[/TAFEL]]         (accepté aussi)
 *
 * Ce qui est DANS ces blocs va au tableau (étapes numérotées). Le reste
 * est la voix du Professeur (commentaire, question). Une réponse sans aucun
 * bloc reste une réponse normale : rien ne change pour les questions simples.
 *
 * Fonctionne PENDANT le streaming : un bloc ouvert mais pas encore fermé est
 * une étape `complete: false` (le tableau la montre « en cours d'écriture »).
 *
 * Module pur, testé dans tests/tafel.test.ts.
 */

export interface TafelStep {
  /** Libellé de l'étape (« Beobachtung », « Physik », « Gleichung », …). */
  label: string;
  /** Contenu Markdown (LaTeX, ```svg, ```circuitikz …). */
  body: string;
  /** false tant que le [[/TAFEL]] n'est pas arrivé. */
  complete: boolean;
}

export interface TafelSplit {
  steps: TafelStep[];
  /** La voix du Professeur : tout ce qui est hors des blocs TAFEL. */
  commentary: string;
}

const OPEN_RE = /\[\[\s*TAFEL\b([^\]]*)\]\]/gi;
const CLOSE_RE = /\[\[\s*\/\s*TAFEL\s*\]\]/i;

function labelOf(attrs: string, index: number): string {
  const m = /schritt\s*=\s*["“„]?([^"”“\]]+)["”“]?/i.exec(attrs);
  return m?.[1]?.trim() || `Schritt ${index + 1}`;
}

/**
 * Le format en étapes que le prompt utilise DÉJÀ (NIVEAU 7) :
 *   [[REASONING]] @@STEP: Beobachtung … @@STEP: Endgleichung … [[/REASONING]]
 * Chaque @@STEP devient une étape de la Tafel. Bloc non fermé (streaming) :
 * la dernière étape est en cours d'écriture.
 */
const REASONING_RE = /\[\[\s*REASONING\s*\]\]([\s\S]*?)(\[\[\s*\/\s*REASONING\s*\]\]|$)/gi;

function reasoningSteps(body: string, closed: boolean): TafelStep[] {
  const parts = body.split(/^\s*@@STEP:\s*(.+?)\s*$/m);
  // parts = [avant, titre1, corps1, titre2, corps2, …]
  const out: TafelStep[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ label: parts[i].trim(), body: (parts[i + 1] ?? "").trim(), complete: true });
  }
  if (out.length === 0 && body.trim()) {
    out.push({ label: "Schritt 1", body: body.trim(), complete: closed });
  }
  if (!closed && out.length > 0) out[out.length - 1].complete = false;
  // Un « @@STE… » à moitié écrit ne doit pas apparaître dans le corps.
  if (out.length > 0) {
    const last = out[out.length - 1];
    last.body = last.body.replace(/\n?[ \t]*@@[A-Z]*:?[ \t]*$/i, "").trim();
  }
  return out;
}

export function splitTafel(raw: string): TafelSplit {
  // 1. Les blocs [[REASONING]] du NIVEAU 7 passent au tableau en premier.
  const fromReasoning: TafelStep[] = [];
  raw = raw.replace(REASONING_RE, (_m, body: string, close: string) => {
    fromReasoning.push(...reasoningSteps(body, !!close));
    return "\n\n";
  });

  const steps: TafelStep[] = [...fromReasoning];
  let commentary = "";
  let cursor = 0;

  OPEN_RE.lastIndex = 0;
  for (let m = OPEN_RE.exec(raw); m; m = OPEN_RE.exec(raw)) {
    commentary += raw.slice(cursor, m.index);
    const bodyStart = m.index + m[0].length;
    const rest = raw.slice(bodyStart);
    const close = CLOSE_RE.exec(rest);
    if (!close) {
      // Bloc encore ouvert (streaming) : tout le reste lui appartient.
      steps.push({ label: labelOf(m[1] ?? "", steps.length), body: rest.trim(), complete: false });
      cursor = raw.length;
      break;
    }
    steps.push({
      label: labelOf(m[1] ?? "", steps.length),
      body: rest.slice(0, close.index).trim(),
      complete: true,
    });
    cursor = bodyStart + close.index + close[0].length;
    OPEN_RE.lastIndex = cursor;
  }
  commentary += raw.slice(cursor);

  // Un « [[TA… » coupé en plein streaming ne doit pas s'afficher chez le Prof.
  commentary = commentary.replace(/\[\[?(?:\s*\/?\s*T(?:A(?:F(?:E(?:L)?)?)?)?[^\]]*)?$/i, "");

  return { steps, commentary: commentary.replace(/\n{3,}/g, "\n\n").trim() };
}

/** Le dernier libellé ressemble-t-il au résultat final ? (carte mise en avant) */
export function isFinalStep(label: string): boolean {
  return /endgleichung|ergebnis|lösung|resultat|result|final/i.test(label);
}

/**
 * Déplace vers la Tafel les blocs ```<lang> que le CODE (pas le modèle) a
 * insérés dans la réponse — le schéma de poutre calculé par balkenstatik
 * (```balkendiagramm) arrive à l'endroit de l'appel d'outil, donc dans la
 * voix du Professeur. Sa place est au tableau, en premier.
 */
export function moveFencedToBoard(split: TafelSplit, lang: string, label: string): TafelSplit {
  const re = new RegExp("```" + lang + "[ \\t]*\\n[\\s\\S]*?```", "g");
  const blocks = split.commentary.match(re) ?? [];
  if (blocks.length === 0) return split;
  return {
    steps: [...blocks.map((b) => ({ label, body: b, complete: true })), ...split.steps],
    commentary: split.commentary.replace(re, "").replace(/\n{3,}/g, "\n\n").trim(),
  };
}
