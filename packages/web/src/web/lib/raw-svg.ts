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
  "path|text|tspan|textpath|line|polyline|polygon|rect|circle|ellipse|g|defs|marker|use|symbol|image|switch|style|" +
  "lineargradient|radialgradient|stop|clippath|mask|pattern|filter|fe[a-z]+|foreignobject|title|desc|metadata|" +
  "animate|animatemotion|animatetransform|set|mpath";
const PAIRED = new RegExp(`<(${SVG_ELEMENTS})\\b[^<>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
/**
 * Une balise seule n'est retirée que si elle ne peut pas être autre chose :
 * une fermeture, une balise avec attribut (`x="155"`), une balise auto-fermée,
 * ou un nom sans ambiguïté. Un « <text> » ou un « <title> » nu dans une phrase
 * (un exemple, un espace réservé) reste lisible.
 */
const UNAMBIGUOUS = "svg|g|defs|path|tspan|textpath|polyline|polygon|rect|circle|ellipse|lineargradient|radialgradient|clippath|foreignobject|marker";
const SINGLE = new RegExp(
  `<\\/(?:${SVG_ELEMENTS}|svg)\\s*>|<(?:${SVG_ELEMENTS}|svg)\\b[^<>]*(?:=[^<>]*|\\/)>|<(?:${UNAMBIGUOUS})\\s*>`,
  "gi",
);
/** Une balise SVG commencée mais pas encore fermée par « > » (réponse en cours d'écriture). */
const UNFINISHED = new RegExp(`<\\/?(?:${SVG_ELEMENTS}|svg)\\b[^<>]*$`, "i");
const TRIGGER = new RegExp(`<(?:\\?xml|\\/?(?:${SVG_ELEMENTS}|svg)\\b)`, "i");

function fixText(part: string): string {
  if (!TRIGGER.test(part)) return part;
  const strip = (s: string) =>
    s
      .replace(/<\?xml[^>]*\?>/gi, "")
      .replace(/<!DOCTYPE\s+svg[^>]*>/gi, "")
      // Ouvert, pas encore fermé (flux) : caché pour l'instant.
      .replace(/<svg\b[\s\S]*$/i, "")
      // Isolés (un morceau de dessin sans son <svg>, une fermeture seule) : retirés.
      .replace(PAIRED, "")
      .replace(SINGLE, "")
      .replace(UNFINISHED, "");
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
