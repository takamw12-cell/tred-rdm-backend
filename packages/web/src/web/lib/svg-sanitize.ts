/**
 * Nettoyage d'un SVG écrit par le modèle, avant `dangerouslySetInnerHTML`.
 *
 * Sorti de `diagram-blocks.tsx` (sans changement des règles d'origine) pour
 * être testé, et complété pour les animations SMIL (NIVEAU 9d du prompt).
 *
 * Pourquoi les animations demandent des règles à elles : `<set>` et
 * `<animate>` peuvent RÉÉCRIRE un attribut après coup. Un
 * `<a><set attributeName="href" to="javascript:…"/></a>` passe la règle sur
 * `href` (il n'y a pas d'attribut href écrit en dur) et devient un lien qui
 * exécute du code. Le modèle lit des PDF téléversés ; une consigne cachée
 * dans un PDF suffirait. On n'autorise donc l'animation que sur une liste
 * fermée d'attributs de présentation.
 */

/** Attributs qu'une animation a le droit de modifier. Tout le reste est retiré. */
const ANIMATABLE = new Set([
  "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry",
  "width", "height", "d", "points", "transform",
  "opacity", "fill", "fill-opacity", "stroke", "stroke-opacity", "stroke-width",
  "stroke-dasharray", "stroke-dashoffset", "offset", "font-size", "stop-color",
]);

const ANIMATION_RE =
  /<(animate|animateMotion|animateTransform|set)\b([^>]*?)(\/>|>([\s\S]*?)<\/\1\s*>)/gi;

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(attrs);
  return m ? (m[2] ?? m[3] ?? "") : null;
}

function keepAnimation(tag: string, attrs: string): boolean {
  // <set> ne sert qu'à basculer une valeur : rien qu'une animation ne fasse,
  // et c'est le vecteur le plus direct. Retiré sans exception.
  if (tag.toLowerCase() === "set") return false;

  // animateMotion déplace l'élément, il n'a pas d'attributeName.
  const target = attr(attrs, "attributeName");
  if (target !== null && !ANIMATABLE.has(target.trim().toLowerCase())) return false;
  if (target === null && tag.toLowerCase() === "animate") return false;

  // Valeurs : nombres, couleurs, chemins. Jamais un schéma d'URL ni une
  // entité qui pourrait en cacher un.
  for (const name of ["values", "from", "to", "by"]) {
    const v = attr(attrs, name);
    if (v !== null && /javascript|&#|:/i.test(v)) return false;
  }
  return true;
}

export function sanitizeSvg(raw: string): string {
  let svg = raw.trim();

  // Keep only the <svg>…</svg> region if the model wrapped it in prose.
  const start = svg.toLowerCase().indexOf("<svg");
  const end = svg.toLowerCase().lastIndexOf("</svg>");
  if (start >= 0 && end > start) svg = svg.slice(start, end + "</svg>".length);

  // Drop <script>…</script> blocks entirely.
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Drop <foreignObject> (can embed arbitrary HTML/scripts).
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  // Strip inline event handlers: onload="…", onclick='…', onmouseover=… .
  // (Couvre aussi onbegin / onend / onrepeat des animations.)
  svg = svg.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  svg = svg.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  // Neutralise external / javascript references in href and xlink:href.
  // Les références internes (#id) restent : <mpath href="#fil"/> en dépend.
  svg = svg.replace(/\s(?:xlink:)?href\s*=\s*"(?!#)[^"]*"/gi, "");
  svg = svg.replace(/\s(?:xlink:)?href\s*=\s*'(?!#)[^']*'/gi, "");

  // Animations : liste fermée d'attributs, <set> interdit.
  svg = svg.replace(ANIMATION_RE, (whole, tag: string, attrs: string) =>
    keepAnimation(tag, attrs) ? whole : "",
  );

  return svg.trim();
}
