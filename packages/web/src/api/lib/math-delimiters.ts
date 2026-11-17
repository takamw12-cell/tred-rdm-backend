/**
 * Délimiteurs de formules — une seule convention jusqu'à l'écran : `$…$`
 * dans le texte, `$$…$$` en bloc.
 *
 * Brief fondateur du 17 nov. 2026 : une capture montrait
 * F_r = m(\ddot{r} - r\dot{\varphi}^2) en LaTeX brut. remark-math (le
 * Markdown du client) ne reconnaît QUE `$` et `$$`. Le modèle écrit pourtant
 * parfois `\(…\)`, `\[…\]`, ou une formule sans aucun délimiteur.
 *
 *   - `MathDelimiterNormalizer` / `mathDelimiterTransform` : convertit
 *     `\(` `\)` → `$` et `\[` `\]` → `$$`, en flux, côté serveur, avant
 *     l'envoi au navigateur (api/index.ts). Caractère par caractère : un
 *     délimiteur coupé entre deux morceaux du flux est converti quand même.
 *   - `normalizeMathDelimiters` : la même chose sur un texte entier. Le
 *     client la rappelle pour les anciens messages et les autres contenus
 *     générés (exercices, fiches…). Idempotente.
 *   - `wrapBareLatexLines` : une ligne qui n'est QU'UNE formule sans
 *     délimiteur est enveloppée. Une phrase contenant une commande ne l'est
 *     pas : on ne devine pas où la formule commence.
 *   - `escapeCurrencyDollars` : « $5 » est un prix, pas une formule.
 *
 * Module pur, sans dépendance : importé par le serveur et par le client.
 * Testé dans tests/math-delimiters.test.ts et tests/markdown-katex.test.tsx.
 */

/**
 * Conversion en flux. L'état tient en trois choses : un `\` en attente (le
 * caractère suivant décide), une suite de backticks en cours de comptage, et
 * la longueur de la clôture de code ouverte (0 = hors code). Dans le code,
 * rien n'est converti.
 *
 * `\\` est traité comme une paire : `\\[4pt]` (saut de ligne LaTeX) n'ouvre
 * donc pas de bloc.
 */
export class MathDelimiterNormalizer {
  private slash = false;
  private ticks = 0;
  private code = 0;

  push(chunk: string): string {
    let out = "";
    for (const ch of chunk) {
      if (this.slash) {
        this.slash = false;
        if (ch === "(" || ch === ")") out += "$";
        else if (ch === "[" || ch === "]") out += "$$";
        else out += `\\${ch}`; // \\, \$, \{, \alpha, \` … tels quels.
        continue;
      }
      if (ch === "`") {
        this.ticks += 1;
        continue;
      }
      if (this.ticks) out += this.closeTicks();
      if (this.code) out += ch;
      else if (ch === "\\") this.slash = true;
      else out += ch;
    }
    return out;
  }

  flush(): string {
    let out = this.ticks ? this.closeTicks() : "";
    if (this.slash) out += "\\";
    this.slash = false;
    this.code = 0;
    return out;
  }

  private closeTicks(): string {
    const n = this.ticks;
    this.ticks = 0;
    if (this.code === 0) this.code = n;
    else if (this.code === n) this.code = 0;
    return "`".repeat(n);
  }
}

export function normalizeMathDelimiters(text: string): string {
  if (!text || !text.includes("\\")) return text;
  const n = new MathDelimiterNormalizer();
  return n.push(text) + n.flush();
}

type StreamPart = { type: string; id?: string; text?: string };

/**
 * `experimental_transform` de l'AI SDK : réécrit le texte (et le résumé du
 * raisonnement) à mesure qu'il sort du modèle. Un normaliseur par bloc ; ce
 * qui reste en attente part juste avant la fin du bloc. Générique : les
 * parties du flux sont rendues telles quelles, seul `text` change.
 */
export function mathDelimiterTransform<P extends { type: string }>() {
  return (_opts: { stopStream: () => void }) => {
    const open = new Map<string, { kind: string; id?: string; n: MathDelimiterNormalizer }>();
    const kindOf = (type: string) =>
      type === "text-delta" || type === "text-end" ? "text" : type === "reasoning-delta" || type === "reasoning-end" ? "reasoning" : null;
    const delta = (kind: string, id: string | undefined, text: string) => ({ type: `${kind}-delta`, id, text }) as unknown as P;
    return new TransformStream<P, P>({
      transform(chunk, controller) {
        const part = chunk as unknown as StreamPart;
        const kind = kindOf(part.type);
        if (kind) {
          const k = `${kind}:${part.id ?? ""}`;
          if (part.type.endsWith("-delta")) {
            let entry = open.get(k);
            if (!entry) open.set(k, (entry = { kind, id: part.id, n: new MathDelimiterNormalizer() }));
            const text = entry.n.push(part.text ?? "");
            if (text) controller.enqueue({ ...part, text } as unknown as P);
            return;
          }
          const rest = open.get(k)?.n.flush() ?? "";
          open.delete(k);
          if (rest) controller.enqueue(delta(kind, part.id, rest));
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        // Flux coupé sans « -end » : on ne perd pas le dernier caractère.
        for (const { kind, id, n } of open.values()) {
          const rest = n.flush();
          if (rest) controller.enqueue(delta(kind, id, rest));
        }
        open.clear();
      },
    });
  };
}

/** Découpe en morceaux de code (indices impairs) et de texte (indices pairs). */
const CODE_SPLIT = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;

/**
 * Les `$` d'un prix. Une formule commence par `$` et finit par un `$` collé
 * à son contenu (règle de Pandoc). Un `$` suivi d'un chiffre est donc un prix
 * quand le `$` suivant manque, est précédé d'un espace, est suivi d'un
 * chiffre ou se trouve dans un autre paragraphe. « 5 $ » (chiffre, espace
 * facultatif, `$`, puis espace ou ponctuation) aussi. Toutes les autres
 * formules gardent le comportement de remark-math : le tuteur écrit `$x$`
 * partout, on n'y touche pas.
 */
export function escapeCurrencyDollars(text: string): string {
  if (!text || !text.includes("$")) return text;
  return text
    .split(CODE_SPLIT)
    .map((part, i) => (i % 2 === 1 ? part : escapeInText(part)))
    .join("");
}

function escapeInText(s: string): string {
  const singles: number[] = [];
  let display = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\") {
      i++;
      continue;
    }
    if (s[i] !== "$") continue;
    if (s[i + 1] === "$") {
      display = !display;
      while (s[i + 1] === "$") i++;
      continue;
    }
    if (!display) singles.push(i);
  }
  const escape = new Set<number>();
  let opener: number | null = null;
  for (let j = 0; j < singles.length; j++) {
    const p = singles[j];
    if (opener !== null) {
      opener = null;
      continue;
    }
    const next = s[p + 1] ?? "";
    if (/\d/.test(next)) {
      const q = singles[j + 1];
      const closes =
        q !== undefined && !/\s/.test(s[q - 1]) && !/\d/.test(s[q + 1] ?? "") && !s.slice(p, q).includes("\n\n");
      if (!closes) {
        escape.add(p);
        continue;
      }
    } else if (/\d\s?$/.test(s.slice(Math.max(0, p - 2), p)) && /^(?:\s|[.,;:!?)]|$)/.test(next)) {
      escape.add(p);
      continue;
    }
    opener = p;
  }
  if (escape.size === 0) return s;
  let out = "";
  for (let i = 0; i < s.length; i++) out += escape.has(i) ? "\\$" : s[i];
  return out;
}

/**
 * `$$ E = mc^2 $$` sur une seule ligne : remark-math le lit comme une
 * formule EN LIGNE (petite, dans le paragraphe). Le prompt demande « $$…$$
 * groß » : une ligne qui n'est qu'une formule `$$…$$` est ouverte sur trois
 * lignes, ce qui en fait un vrai bloc. L'indentation (liste) est gardée ; le
 * code et les formules au milieu d'une phrase ne sont pas touchés.
 */
export function expandDisplayLines(text: string): string {
  if (!text || !text.includes("$$")) return text;
  const lines = text.split("\n");
  let fence: string | null = null;
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (fence) {
      if (t.startsWith(fence)) fence = null;
      out.push(line);
      continue;
    }
    const f = /^(`{3,}|~{3,})/.exec(t);
    if (f) fence = f[1];
    const m = f ? null : /^(\s*)\$\$((?:(?!\$\$).)+)\$\$\s*$/.exec(line);
    if (m && m[2].trim()) {
      const [, indent, body] = m;
      out.push(`${indent}$$`, `${indent}${body.trim()}`, `${indent}$$`);
    } else out.push(line);
  }
  return out.join("\n");
}

/** Commandes qui ne s'écrivent que dans une formule. */
const MATH_CMD =
  /\\(?:d?dot|vec|hat|bar|tilde|frac|dfrac|sqrt|int|iint|oint|sum|prod|lim|partial|nabla|infty|cdot|times|approx|neq|leq|geq|pm|mp|to|rightarrow|Rightarrow|left|right|mathrm|mathbf|varphi|phi|alpha|beta|gamma|delta|Delta|epsilon|varepsilon|eta|theta|vartheta|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|omega|Omega|Phi|Sigma|Gamma|Lambda|Theta|Psi|psi|chi|zeta)(?![A-Za-z])/;

/**
 * Une ligne entière en LaTeX, sans délimiteurs → `$$…$$`. Avec une puce ou
 * une étiquette devant (« - **Radial:** … », « Kraft: … »), seule la formule
 * passe en `$…$`. Le reste ne doit contenir aucun mot (trois lettres de
 * suite hors commandes) et doit contenir une relation (=, <, ≈…) ou une
 * fraction, une intégrale, une somme : sinon c'est une phrase, on la laisse.
 */
export function wrapBareLatexLines(text: string): string {
  if (!text || !text.includes("\\")) return text;
  const lines = text.split("\n");
  let fence: string | null = null;
  let display = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (fence) {
      if (t.startsWith(fence)) fence = null;
      continue;
    }
    const f = /^(`{3,}|~{3,})/.exec(t);
    if (f) {
      fence = f[1];
      continue;
    }
    if (display) {
      if (t.endsWith("$$")) display = false;
      continue;
    }
    if (t.startsWith("$$") && (t === "$$" || !t.slice(2).includes("$$"))) {
      display = true;
      continue;
    }
    if (line.includes("$") || line.includes("`") || !MATH_CMD.test(line)) continue;
    const m = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:\*\*[^*\n]{1,40}\*\*\s*|[^\\$\n:=]{1,40}:\s+)?)(.*?)\s*$/.exec(line);
    if (!m) continue;
    const [, prefix, formula] = m;
    if (!formula || !MATH_CMD.test(formula) || !looksLikeFormula(formula)) continue;
    lines[i] = prefix.trim() === "" ? `${prefix}$$${formula}$$` : `${prefix}$${formula}$`;
  }
  return lines.join("\n");
}

function looksLikeFormula(s: string): boolean {
  const stripped = s
    .replace(/\\(?:text|mathrm|operatorname)\{[^}]*\}/g, "")
    .replace(/\\[A-Za-z]+/g, "")
    .replace(/\\./g, "");
  return !/\p{L}{3,}/u.test(stripped) && /[=<>≈≤≥]|\\(?:frac|int|sum|sqrt)/.test(s);
}
