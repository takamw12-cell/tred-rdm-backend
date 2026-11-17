/**
 * SVG brut dans le texte du tuteur — jamais affiché comme du code.
 *
 * Brief fondateur du 17 nov. 2026 : le modèle a écrit `<svg>…<text>…<path>`
 * directement dans sa réponse. react-markdown n'interprète pas le HTML brut :
 * les balises s'affichaient en toutes lettres sur la Tafel.
 *
 * Plutôt que `rehype-raw` (qui rendrait vivant TOUT le HTML écrit par le
 * modèle, et dont le nettoyage GitHub retire de toute façon les balises SVG,
 * en laissant leur texte en vrac), le texte est réécrit avant l'analyse :
 *
 *   - un `<svg>…</svg>` complet devient un bloc ```svg : il passe par
 *     SvgBlock et son nettoyage (lib/svg-sanitize.ts), donc il est DESSINÉ ;
 *   - un `<svg` pas encore fermé (réponse en cours d'écriture) est caché
 *     jusqu'à sa fermeture ;
 *   - des éléments SVG isolés (`<path …/>`, `<text>…</text>`, `<g>`…) hors
 *     de tout `<svg>`, et une déclaration `<?xml …?>`, sont retirés : ils ne
 *     dessinent rien et ne doivent pas s'afficher en texte.
 *
 * Le code (blocs ``` et `code`) n'est jamais touché : un exemple de SVG
 * qu'on montre exprès reste lisible. Module pur, testé dans
 * tests/raw-svg.test.ts.
 */

/** Morceaux de code (indices impairs) et de texte (indices pairs). */
const CODE_SPLIT = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

const SVG_ELEMENTS =
  "path|text|tspan|line|polyline|polygon|rect|circle|ellipse|g|defs|marker|use|symbol|lineargradient|radialgradient|stop|clippath|mask|pattern|foreignobject|title|desc";
const PAIRED = new RegExp(`<(${SVG_ELEMENTS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
const SINGLE = new RegExp(`<\\/?(?:${SVG_ELEMENTS})\\b[^>]*\\/?>`, "gi");

function fixText(part: string): string {
  if (!/<(?:svg|\?xml|\/?(?:path|text|line|g|rect|circle|polyline|polygon)\b)/i.test(part)) return part;
  const strip = (s: string) =>
    s
      .replace(/<\?xml[^>]*\?>/gi, "")
      // Ouvert, pas encore fermé (flux) : caché pour l'instant.
      .replace(/<svg\b[\s\S]*$/i, "")
      // Isolés : retirés.
      .replace(PAIRED, "")
      .replace(SINGLE, "");
  // Les <svg> complets (indices impairs) deviennent des blocs ```svg ; le
  // reste est nettoyé sans toucher à leur contenu.
  return part
    .split(/(<svg\b[\s\S]*?<\/svg\s*>)/i)
    .map((seg, i) => (i % 2 === 1 ? `\n\n\`\`\`svg\n${seg.trim()}\n\`\`\`\n\n` : strip(seg)))
    .join("");
}

export function fenceRawSvg(text: string): string {
  if (!text || !text.includes("<")) return text;
  return text
    .split(CODE_SPLIT)
    .map((part, i) => (i % 2 === 1 ? part : fixText(part)))
    .join("");
}
