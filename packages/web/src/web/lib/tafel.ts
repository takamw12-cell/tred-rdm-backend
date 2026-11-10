/**
 * Tafel-Modus — la réponse du tuteur, écrite au tableau.
 *
 *   [[TAFEL schritt="Runde 1"]] … [[/TAFEL]]          (format du prompt, NIVEAU 7)
 *   [[REASONING]] @@STEP: Physik … [[/REASONING]]     (calculs, NIVEAU 7)
 *   [[PROFESSEUR]] … [[/PROFESSEUR]]                 (ce que le prof DIT, NIVEAU 7)
 *
 * Depuis le 2026-11-11 (décision fondateur), ce que le professeur dit à voix
 * haute n'est plus le contenu du tableau : un vrai prof écrit la formule en
 * silence, puis se retourne et explique l'intuition. Le bloc [[PROFESSEUR]]
 * n'est PAS écrit au tableau ; c'est le seul texte que la voix (ElevenLabs)
 * reçoit.
 *
 * Depuis le 2026-11-09 (décision fondateur), le Hörsaal n'a plus de chat :
 * TOUTE la réponse s'affiche sur la Tafel. `tafelPage` la découpe, dans
 * l'ordre, en feuilles (les blocs) et en texte libre (hors blocs, écrit
 * directement sur le verre — rien n'est perdu si le modèle oublie une balise).
 * `splitChoices` repère les options A), B), C) d'un QCM : elles deviennent
 * des boutons. `writingChunks` découpe en paragraphes pour l'écriture
 * « ligne par ligne ».
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
  /** Le texte hors des blocs (écrit sur le verre, sans feuille). */
  commentary: string;
  /** Les paroles du professeur : le contenu des blocs [[PROFESSEUR]]. */
  spoken: string;
}

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

/**
 * Un morceau de la page du tableau, dans l'ordre où le professeur l'écrit :
 *   • `step`  — un bloc [[TAFEL]] ou un @@STEP : une feuille titrée ;
 *   • `voice` — ce qui est écrit hors des blocs : écrit, lui aussi, au
 *     tableau (Hörsaal sans chat, décision fondateur 2026-11-09), mais
 *     directement sur le verre, sans feuille. Rien n'est jamais perdu, même
 *     quand le modèle oublie les balises.
 */
export type TafelBlock =
  | { kind: "voice"; body: string }
  /** [[PROFESSEUR]] : dit à voix haute, jamais écrit au tableau. */
  | { kind: "spoken"; body: string; complete: boolean }
  | ({
      kind: "step";
      /** Clé stable (feuilles déplacées en tête). */
      id?: string;
      /** Étape de calcul (@@STEP) : numérotée et cochée au tableau. */
      derivation?: boolean;
    } & TafelStep);

const ANY_OPEN_RE = /\[\[\s*(REASONING|TAFEL|PROFESSEUR|PROFESSOR|PROFESOR|PROFESSORE)\b([^\]]*)\]\]/gi;
const REASONING_CLOSE_RE = /\[\[\s*\/\s*REASONING\s*\]\]/i;
const SPOKEN_CLOSE_RE = /\[\[\s*\/\s*(?:PROFESSEUR|PROFESSOR|PROFESOR|PROFESSORE)\s*\]\]/i;
/** Un marqueur « [[… » coupé en plein streaming (ou un « [ » seul) en fin de texte. */
const PARTIAL_TAIL_RE = /(?:\[\[[^\]\n]*\]?|\[)\s*$/;

/** Un bloc [[TAFEL]] qui contient lui-même un [[REASONING]] : chaque @@STEP reste une feuille. */
function tafelBlockSteps(label: string, body: string, closed: boolean): TafelBlock[] {
  if (!/\[\[\s*REASONING\b/i.test(body)) {
    return body.trim() || !closed ? [{ kind: "step", label, body: body.trim(), complete: closed }] : [];
  }
  const out = tafelPage(body).map<TafelBlock>((b) =>
    b.kind === "voice" ? { kind: "step", label, body: b.body, complete: true } : b,
  );
  const last = out[out.length - 1];
  if (!closed && last?.kind === "step") out[out.length - 1] = { ...last, complete: false };
  return out;
}

/**
 * La page du tableau : TOUTE la réponse, dans l'ordre. Fonctionne pendant le
 * streaming (bloc ouvert = feuille `complete: false`, marqueur à moitié écrit
 * masqué).
 */
export function tafelPage(raw: string): TafelBlock[] {
  const blocks: TafelBlock[] = [];
  const stepCount = () => blocks.filter((b) => b.kind === "step").length;
  const voice = (text: string, atEnd: boolean) => {
    const body = (atEnd ? text.replace(PARTIAL_TAIL_RE, "") : text).replace(/\n{3,}/g, "\n\n").trim();
    if (body) blocks.push({ kind: "voice", body });
  };

  let cursor = 0;
  const re = new RegExp(ANY_OPEN_RE.source, "gi");
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    voice(raw.slice(cursor, m.index), false);
    const bodyStart = m.index + m[0].length;
    const rest = raw.slice(bodyStart);
    const tag = (m[1] ?? "").toUpperCase();
    const reasoning = tag === "REASONING";
    const spoken = tag.startsWith("PROF");
    const close = (reasoning ? REASONING_CLOSE_RE : spoken ? SPOKEN_CLOSE_RE : CLOSE_RE).exec(rest);
    const body = close ? rest.slice(0, close.index) : rest.replace(PARTIAL_TAIL_RE, "");
    if (spoken) {
      if (body.trim()) blocks.push({ kind: "spoken", body: body.trim(), complete: !!close });
    } else if (reasoning) {
      for (const s of reasoningSteps(body, !!close)) blocks.push({ kind: "step", derivation: true, ...s });
    } else {
      blocks.push(...tafelBlockSteps(labelOf(m[2] ?? "", stepCount()), body, !!close));
    }
    if (!close) return blocks; // bloc encore ouvert : tout le reste lui appartient
    cursor = bodyStart + close.index + close[0].length;
    re.lastIndex = cursor;
  }
  voice(raw.slice(cursor), true);
  return blocks;
}

/** Les deux voix d'une page (lecture à voix haute) : les feuilles, et le texte hors feuilles. */
export function pageSplit(blocks: TafelBlock[]): TafelSplit {
  const steps: TafelStep[] = [];
  const voices: string[] = [];
  const spoken: string[] = [];
  for (const b of blocks) {
    if (b.kind === "step") steps.push({ label: b.label, body: b.body, complete: b.complete });
    else if (b.kind === "spoken") spoken.push(b.body);
    else voices.push(b.body);
  }
  return { steps, commentary: voices.join("\n\n"), spoken: spoken.join("\n\n") };
}

export function splitTafel(raw: string): TafelSplit {
  return pageSplit(tafelPage(raw));
}

/** Le dernier libellé ressemble-t-il au résultat final ? (carte mise en avant) */
export function isFinalStep(label: string): boolean {
  return /endgleichung|ergebnis|lösung|resultat|result|final/i.test(label);
}

/**
 * Place en tête du tableau les blocs ```<lang> que le CODE (pas le modèle) a
 * insérés dans la réponse — le schéma de poutre calculé par balkenstatik
 * (```balkendiagramm) arrive à l'endroit de l'appel d'outil, au milieu du
 * texte. Sa place est sur une feuille à lui, en premier.
 */
export function moveFencedToPageTop(blocks: TafelBlock[], lang: string, label: string): TafelBlock[] {
  const re = new RegExp("```" + lang + "[ \\t]*\\n[\\s\\S]*?```", "g");
  const found: TafelBlock[] = [];
  const rest: TafelBlock[] = [];
  for (const b of blocks) {
    if (b.kind !== "voice") {
      rest.push(b);
      continue;
    }
    const hits = b.body.match(re) ?? [];
    if (hits.length === 0) {
      rest.push(b);
      continue;
    }
    for (const h of hits) found.push({ kind: "step", id: `${lang}-${found.length}`, label, body: h, complete: true });
    const body = b.body.replace(re, "").replace(/\n{3,}/g, "\n\n").trim();
    if (body) rest.push({ kind: "voice", body });
  }
  return found.length === 0 ? blocks : [...found, ...rest];
}

/* ── Écriture « ligne par ligne » ─────────────────────────────────────── */

/**
 * Découpe un texte Markdown en paragraphes qui apparaissent l'un après
 * l'autre au tableau. On ne coupe JAMAIS dans un bloc de code (```), une
 * formule $$…$$, ni dans la suite indentée d'un élément de liste (sinon
 * elle deviendrait un bloc de code).
 */
export function writingChunks(md: string): string[] {
  const chunks: string[] = [];
  let cur: string[] = [];
  let fence: RegExp | null = null;
  let math = false;
  let blank = false;
  const flush = () => {
    if (cur.length) chunks.push(cur.join("\n"));
    cur = [];
  };
  for (const line of md.split("\n")) {
    const t = line.trim();
    if (fence) {
      cur.push(line);
      if (fence.test(t)) fence = null;
      continue;
    }
    if (math) {
      cur.push(line);
      if (t.endsWith("$$")) math = false;
      continue;
    }
    if (t === "") {
      blank = cur.length > 0;
      continue;
    }
    // Suite indentée (élément de liste sur plusieurs paragraphes) : même morceau.
    if (blank && /^[ \t]/.test(line) && cur.length) {
      cur.push("", line);
    } else {
      if (blank) flush();
      cur.push(line);
    }
    blank = false;
    const f = /^(`{3,}|~{3,})/.exec(t);
    if (f) fence = new RegExp(`^\\${f[1][0]}{${f[1].length},}\\s*$`);
    else if (t.startsWith("$$") && (t === "$$" || !t.slice(2).includes("$$"))) math = true;
  }
  flush();
  return chunks;
}

/* ── Questions à choix multiple ──────────────────────────────────────── */

export interface Choice {
  /** « A », « B », … */
  key: string;
  /** Le texte de l'option (Markdown, LaTeX). */
  text: string;
}

export type ChoicePart = { kind: "md"; text: string } | { kind: "choices"; options: Choice[] };

/** « A) 2 V », « **B)** 4 V », « (C) 6 V », « - d. … » → { key, text }. */
export function parseChoiceLine(line: string): Choice | null {
  const s = line.trim().replace(/^[-*+]\s+/, "");
  const m = /^(\*\*|__)?\(?([A-Fa-f])(?:\)|\.|:|\])(\*\*|__)?\s+(\S.*)$/.exec(s);
  if (!m) return null;
  let text = m[4].trim();
  // « **A) 2 V** » : le gras ouvert avant la lettre se ferme en fin de ligne.
  if (m[1] && !m[3] && text.endsWith(m[1])) text = text.slice(0, -m[1].length).trim();
  return text ? { key: m[2].toUpperCase(), text } : null;
}

/**
 * Sépare les options A), B), C)… du reste du texte : la Tafel en fait des
 * boutons. Une suite n'est reconnue qu'à partir de DEUX options consécutives
 * commençant par A (lignes vides permises entre elles) ; rien n'est cherché
 * dans un bloc de code.
 */
export function splitChoices(md: string): ChoicePart[] {
  const lines = md.split("\n");
  const parts: ChoicePart[] = [];
  let text: string[] = [];
  let i = 0;
  let fence = false;
  const pushText = () => {
    const t = text.join("\n").trim();
    if (t) parts.push({ kind: "md", text: t });
    text = [];
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*(`{3,}|~{3,})/.test(line)) fence = !fence;
    const first = fence ? null : parseChoiceLine(line);
    if (first?.key !== "A") {
      text.push(line);
      i++;
      continue;
    }
    const options: Choice[] = [first];
    let j = i + 1;
    let end = i + 1;
    while (j < lines.length) {
      if (lines[j].trim() === "") {
        j++;
        continue;
      }
      const next = parseChoiceLine(lines[j]);
      if (!next || next.key.charCodeAt(0) !== options[options.length - 1].key.charCodeAt(0) + 1) break;
      options.push(next);
      j++;
      end = j;
    }
    if (options.length < 2) {
      text.push(line);
      i++;
      continue;
    }
    pushText();
    parts.push({ kind: "choices", options });
    i = end;
  }
  pushText();
  return parts;
}

/**
 * L'option choisie par l'étudiant, d'après sa réponse suivante (« B) 4 V »
 * envoyé par le bouton, ou « B » tapé à la main).
 */
export function chosenKey(reply: string | undefined): string | null {
  const m = /^\s*\(?([A-Fa-f])(?:[).:\]]|\s*$)/.exec(reply ?? "");
  return m ? m[1].toUpperCase() : null;
}
