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

/* ── Durcissement (2026-11-09) ─────────────────────────────────────────────
 * Le SVG est injecté par `dangerouslySetInnerHTML`, donc lu par le parseur
 * HTML, qui accepte bien plus que du XML propre : `<svg/onload=…>` (le « / »
 * sépare les attributs), `x="1"onload=…` (sans espace), `href=javascript:…`
 * (sans guillemets), `&#106;avascript:` (entités). Chaque règle ci-dessous
 * couvre l'une de ces formes ; tests/svg-sanitize.test.ts les attaque toutes.
 */

/** Ce qui précède un nom d'attribut pour le parseur HTML : espace, « / » ou guillemet fermant. */
const ATTR_START = "(?<=[\\s/\"'])";
/** Une valeur d'attribut : entre guillemets doubles, simples, ou nue. */
const ATTR_VALUE = "(?:\"[^\"]*\"|'[^']*'|[^\\s>]+)";

/** Éléments retirés AVEC leur contenu (fermés ou non : jusqu'à la fin si non fermés). */
const DROP_WITH_CONTENT = ["script", "foreignObject", "iframe", "object", "embed", "noscript", "template"];
/** Balises retirées seules (pas de contenu utile, ou sortie du SVG vers le HTML). */
const DROP_TAG = /<\/?\s*(?:img|iframe|embed|object|frame|frameset|base|link|meta|form|input|button|textarea|svg:script)\b[^>]*>/gi;

/** Décode les entités et retire ce qu'un navigateur ignore dans un schéma d'URL. */
function decodeForCheck(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&colon;/gi, ":")
    .replace(/&(?:tab|newline);/gi, "")
    .split("")
    // Espaces et caractères de contrôle (U+0000–U+0020, U+007F–U+009F) :
    // ignorés par le navigateur dans un schéma, donc retirés avant le test.
    .filter((ch) => {
      const c = ch.charCodeAt(0);
      return c > 0x20 && (c < 0x7f || c > 0x9f);
    })
    .join("")
    .toLowerCase();
}

const DANGEROUS_SCHEME = /(?:javascript|vbscript|livescript):|data:text\/html/;

/**
 * Une balise ouvrante, guillemets compris : un « > » DANS une valeur entre
 * guillemets ne ferme pas la balise (le parseur HTML fait pareil). Sans cela,
 * `<rect title="a>" onload=…>` laisserait passer la suite comme du « texte ».
 */
const OPEN_TAG = /<[a-zA-Z][\w:.-]*(?:"[^"]*"|'[^']*'|[^'">])*>/g;

function sanitizeTag(tag: string): string {
  // on* (onload, onclick, onbegin…) : quel que soit le séparateur.
  tag = tag.replace(new RegExp(`${ATTR_START}on[a-z]+\\s*=\\s*${ATTR_VALUE}`, "gi"), "");
  // Liens et sources : seules les références internes (#id) restent —
  // <mpath href="#fil"/> en dépend.
  tag = tag.replace(
    new RegExp(`${ATTR_START}(?:xlink:)?(?:href|src|action|formaction|data)\\s*=\\s*(?:"(?!#)[^"]*"|'(?!#)[^']*'|(?!["'#])[^\\s>]+)`, "gi"),
    "",
  );
  // Tout autre attribut dont la valeur cache un schéma exécutable.
  return tag.replace(new RegExp(`${ATTR_START}[\\w:.-]+\\s*=\\s*(${ATTR_VALUE})`, "gi"), (whole, value: string) =>
    DANGEROUS_SCHEME.test(decodeForCheck(value)) ? "" : whole,
  );
}

/** Les attributs ne vivent que dans les balises : le texte des étiquettes n'est jamais touché. */
function stripDangerousAttributes(svg: string): string {
  return svg.replace(OPEN_TAG, sanitizeTag);
}

/** CSS (bloc <style> ou attribut style) : aucune ressource externe, aucun script. */
function neutralizeCss(svg: string): string {
  return svg
    .replace(/@import[^;>]*;?/gi, "")
    .replace(/url\(\s*(['"]?)(?!#)[^)]*\)/gi, "none")
    .replace(/expression\s*\(/gi, "(")
    .replace(/behavior\s*:/gi, "x-behavior:");
}

export function sanitizeSvg(raw: string): string {
  let svg = typeof raw === "string" ? raw.trim() : "";

  // Seulement la région <svg>…</svg>. Pas de <svg> du tout : ce n'est pas un
  // schéma, on n'affiche rien (un « schéma » fait d'un <iframe srcdoc> serait
  // sinon injecté tel quel).
  const lower = svg.toLowerCase();
  const start = lower.indexOf("<svg");
  if (start < 0) return "";
  const end = lower.lastIndexOf("</svg>");
  svg = end > start ? svg.slice(start, end + "</svg>".length) : svg.slice(start);

  for (const tag of DROP_WITH_CONTENT) {
    svg = svg.replace(new RegExp(`<\\s*${tag}\\b[\\s\\S]*?(?:<\\/\\s*${tag}\\s*>|$)`, "gi"), "");
  }
  svg = svg.replace(DROP_TAG, "");
  // Animations d'abord : une animation douteuse disparaît EN ENTIER (liste
  // fermée d'attributs, <set> interdit), avant le filtre d'attributs.
  svg = svg.replace(ANIMATION_RE, (whole, tag: string, attrs: string) =>
    keepAnimation(tag, attrs) ? whole : "",
  );
  svg = stripDangerousAttributes(svg);
  svg = neutralizeCss(svg);

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
