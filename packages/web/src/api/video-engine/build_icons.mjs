// Fabrique icons.json : la bibliothèque d'icônes animées du moteur de dessin.
//
//   node packages/web/src/api/video-engine/build_icons.mjs
//
// Source : Lucide (paquet `lucide-react` déjà dans le projet, licence ISC). Chaque
// forme SVG (cercle, rectangle, ligne…) est convertie en tracé `d`, pour que le
// moteur Python n'ait qu'un seul cas à dessiner. Le mouvement est choisi ICI,
// icône par icône : le modèle choisit une icône par son nom, jamais un mouvement.
//
//   spin  tourne (engrenage)        pulse  bat (cerveau, cœur)
//   sway  se balance (balance)      bounce rebondit (marteau)
//   float flotte doucement          blink  clignote (éclair)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const lucide = join(here, "../../../../../node_modules/lucide-react/dist/esm/icons");

const ICONS = {
  spin: ["cog", "settings", "atom", "sun", "globe", "refresh-cw", "fan", "loader", "orbit"],
  pulse: ["brain", "heart", "lightbulb", "thermometer", "flame", "magnet", "cpu", "target", "activity", "eye", "circle-check", "triangle-alert", "battery-charging", "wifi", "network", "heart-pulse"],
  sway: ["scale", "flask-conical", "dna", "wrench", "leaf", "waves", "anchor", "key", "pencil", "stethoscope", "wind", "tree-pine"],
  bounce: ["gavel", "hammer", "graduation-cap", "trending-up", "coins", "droplet", "rocket", "pill", "lock", "arrow-right", "arrow-down", "weight"],
  float: ["book-open", "calculator", "landmark", "banknote", "building-2", "factory", "ruler", "microscope", "code", "database", "plane", "car", "clock", "user", "users", "mountain", "search", "moon", "cloud", "file-text", "chart-line", "chart-bar", "syringe", "bone", "ear", "hand", "handshake", "briefcase", "shield", "triangle"],
  blink: ["zap", "sparkles", "bell", "circle-x", "star"],
};

const n = (v) => Number(v);
const f = (v) => +n(v).toFixed(3);

/** Une forme SVG de Lucide → un tracé `d`. */
function toPath(tag, a) {
  if (tag === "path") return a.d;
  if (tag === "line") return `M${f(a.x1)} ${f(a.y1)}L${f(a.x2)} ${f(a.y2)}`;
  if (tag === "polyline" || tag === "polygon") {
    const p = a.points.trim().split(/[\s,]+/).map(Number);
    let d = `M${p[0]} ${p[1]}`;
    for (let i = 2; i < p.length; i += 2) d += `L${p[i]} ${p[i + 1]}`;
    return tag === "polygon" ? `${d}Z` : d;
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = n(a.cx), cy = n(a.cy), rx = n(a.r ?? a.rx), ry = n(a.r ?? a.ry);
    return `M${f(cx - rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx + rx)} ${f(cy)}A${rx} ${ry} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
  }
  if (tag === "rect") {
    const x = n(a.x ?? 0), y = n(a.y ?? 0), w = n(a.width), h = n(a.height);
    const rx = Math.min(n(a.rx ?? a.ry ?? 0), w / 2), ry = Math.min(n(a.ry ?? a.rx ?? 0), h / 2);
    if (!rx || !ry) return `M${x} ${y}h${w}v${h}h${-w}Z`;
    return `M${f(x + rx)} ${y}h${f(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${f(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${f(-(w - 2 * rx))}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${f(-(h - 2 * ry))}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
  }
  throw new Error(`forme SVG inconnue : ${tag}`);
}

const out = {};
const missing = [];
for (const [anim, names] of Object.entries(ICONS)) {
  for (const name of names) {
    const file = join(lucide, `${name}.js`);
    if (!existsSync(file)) {
      missing.push(name);
      continue;
    }
    // Le tableau `__iconNode` du fichier : du JSON à des clés non citées près.
    const src = readFileSync(file, "utf8");
    if (!src.includes("const __iconNode = ")) {
      // Un alias vers une icône renommée : on ne suit pas, on le signale.
      missing.push(name);
      continue;
    }
    const literal = src.slice(src.indexOf("const __iconNode = ") + 19, src.indexOf("];", src.indexOf("const __iconNode = ")) + 1);
    const nodes = JSON.parse(literal.replace(/([{,]\s*)([A-Za-z][A-Za-z0-9]*):/g, '$1"$2":'));
    out[name] = { anim, paths: nodes.map(([tag, attrs]) => toPath(tag, attrs)) };
  }
}
const version = JSON.parse(readFileSync(join(lucide, "../../../package.json"), "utf8")).version;
writeFileSync(join(here, "icons.json"), `${JSON.stringify({ source: `lucide ${version} (ISC)`, viewBox: 24, icons: Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b))) }, null, 1)}\n`);
console.log(`${Object.keys(out).length} icônes écrites${missing.length ? ` · absentes de Lucide : ${missing.join(", ")}` : ""}`);
