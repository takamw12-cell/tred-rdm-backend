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

  return enforceTredPalette(svg).trim();
}

/* ── Charte TRED : aucun violet dans un schéma ─────────────────────────────
 *
 * Le modèle peut écrire fill="#8b5cf6" ou stroke="purple" malgré le prompt.
 * Toute teinte violette (teinte 238°–330°, saturée — 238° pour attraper le
 * lilas #ECECFF des boîtes mermaid) est remplacée par son
 * rôle TRED selon sa clarté : sombre → encre, moyenne → jaune, claire → jaune
 * très pâle. Les autres couleurs (bleu des forces, rouge, vert…) ne bougent pas.
 */

const VIOLET_NAMES =
  /^(purple|violet|indigo|fuchsia|magenta|orchid|plum|lavender|thistle|mediumpurple|blueviolet|darkviolet|darkorchid|darkmagenta|mediumorchid|rebeccapurple|slateblue|mediumslateblue|darkslateblue)$/i;

function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  if (h.length !== 6 && h.length !== 8) return null;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue =
    max === r ? ((g - b) / d + (g < b ? 6 : 0)) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { h: hue, s, l };
}

function tredFor(color: string): string | null {
  const c = color.trim();
  if (VIOLET_NAMES.test(c)) {
    return /^(lavender|thistle|plum)$/i.test(c) ? "#FBF3D6" : /^(purple|indigo|darkviolet|darkmagenta|darkslateblue|rebeccapurple)$/i.test(c) ? "#1A1A1A" : "#EAB308";
  }
  if (!c.startsWith("#")) return null;
  const hsl = hexToHsl(c);
  if (!hsl || hsl.s < 0.25 || hsl.h < 238 || hsl.h > 330) return null;
  if (hsl.l < 0.38) return "#1A1A1A";
  if (hsl.l > 0.82) return "#FBF3D6";
  return "#EAB308";
}

export function enforceTredPalette(svg: string): string {
  // Attributs fill/stroke/stop-color/color="…" et déclarations CSS inline.
  return svg
    .replace(
      /\b(fill|stroke|stop-color|color|flood-color|lighting-color)\s*=\s*(["'])([^"']+)\2/gi,
      (whole, attr: string, q: string, value: string) => {
        const t = tredFor(value);
        return t ? `${attr}=${q}${t}${q}` : whole;
      },
    )
    .replace(
      /\b(fill|stroke|stop-color|color)\s*:\s*(#[0-9a-f]{3,8}|[a-z]+)/gi,
      (whole, prop: string, value: string) => {
        const t = tredFor(value);
        return t ? `${prop}:${t}` : whole;
      },
    );
}
