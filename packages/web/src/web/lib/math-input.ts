/**
 * Saisie de formules dans le Hörsaal (bouton « fx », 18 nov. 2026).
 *
 * L'étudiant compose sa formule dans un champ MathLive (components/
 * math-input.tsx) ; elle rejoint ensuite sa question sous la forme `$…$`,
 * que le reste de l'app sait déjà lire : la question recopiée au tableau
 * passe par MarkdownContent (KaTeX), et le tuteur reçoit du LaTeX ordinaire.
 *
 * Module pur : tests/math-input.test.ts.
 */

/** Ce qu'un champ de formule vide ou presque renvoie : rien à insérer. */
const EMPTY = /^[\s\\,;:!]*$/;

/** La formule telle qu'elle part dans la question : `$…$`, sur une ligne, sans `$` parasite. */
export function formulaToken(latex: string): string {
  const clean = latex.replace(/\$/g, "").replace(/\s*\n\s*/g, " ").trim();
  return EMPTY.test(clean) ? "" : `$${clean}$`;
}

/**
 * Pose la formule dans le texte, à l'endroit du curseur (fin du texte par
 * défaut), avec une espace de chaque côté quand il en manque une.
 */
export function insertFormula(text: string, latex: string, cursor: number = text.length): { text: string; cursor: number } {
  const token = formulaToken(latex);
  if (!token) return { text, cursor };
  const at = Math.max(0, Math.min(text.length, cursor));
  const before = text.slice(0, at);
  const after = text.slice(at);
  const left = before && !/\s$/.test(before) ? " " : "";
  const right = after && !/^\s/.test(after) ? " " : "";
  const next = `${before}${left}${token}${right}${after}`;
  return { text: next, cursor: (before + left + token).length };
}

/** La palette : ce qu'on tape le plus souvent en première année, dans l'ordre d'un cours. */
export const MATH_PALETTE: ReadonlyArray<{ label: string; insert: string; name: string }> = [
  { label: "x²", insert: "#@^{2}", name: "Quadrat" },
  { label: "xⁿ", insert: "#@^{#?}", name: "Potenz" },
  { label: "a⁄b", insert: "\\frac{#@}{#?}", name: "Bruch" },
  { label: "√", insert: "\\sqrt{#0}", name: "Wurzel" },
  { label: "∫", insert: "\\int_{#?}^{#?} #? \\, dx", name: "Integral" },
  { label: "d⁄dx", insert: "\\frac{d}{dx} #?", name: "Ableitung" },
  { label: "Σ", insert: "\\sum_{#?}^{#?} #?", name: "Summe" },
  { label: "lim", insert: "\\lim_{#? \\to #?} #?", name: "Grenzwert" },
  { label: "π", insert: "\\pi", name: "Pi" },
  { label: "∞", insert: "\\infty", name: "Unendlich" },
  { label: "≤", insert: "\\le", name: "kleiner gleich" },
  { label: "≠", insert: "\\ne", name: "ungleich" },
  { label: "→", insert: "\\vec{#0}", name: "Vektor" },
  { label: "α", insert: "\\alpha", name: "Alpha" },
  { label: "Δ", insert: "\\Delta", name: "Delta" },
  { label: "ω", insert: "\\omega", name: "Omega" },
];
