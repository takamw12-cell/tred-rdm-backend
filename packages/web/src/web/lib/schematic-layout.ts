import type { NetlistView } from "../../api/lib/circuit/netlist";
import type { CircuitElement } from "../../api/lib/solvers/solveCircuit";

/**
 * Le schéma redessiné comme sur la photo (partie PURE, aucun React).
 *
 * Demande du fondateur, 24 nov. 2026 : la carte montrait un graphe de nœuds
 * où l'on ne reconnaissait pas son schéma. La lecture (lib/circuit/
 * vision-read.ts) donne maintenant, pour chaque composant, la place de ses
 * deux bornes sur une grille — « plan ». Ici, cette grille devient un dessin :
 *
 *   - chaque composant à sa place, horizontal ou vertical, avec son symbole ;
 *   - chaque nœud de la netlist : ses bornes reliées par des fils à angle
 *     droit (arbre le plus court), un point là où trois fils se rencontrent.
 *
 * Les fils viennent de la NETLIST, pas de la photo : le dessin montre donc
 * exactement ce qui sera calculé. Un plan incomplet ou incohérent rend
 * `null`, et la carte garde le graphe de nœuds.
 */

export type Pt = { x: number; y: number };
type TwoPole = Extract<CircuitElement, { a: string }>;

export interface SchematicSymbol {
  name: string;
  typ: TwoPole["typ"];
  /** Borne a et borne b, en pixels. */
  a: Pt;
  b: Pt;
  /** Les deux extrémités du corps du symbole (les fils d'amenée vont de la borne au corps). */
  bodyA: Pt;
  bodyB: Pt;
  horizontal: boolean;
  /** Ancrage du texte (nom, puis valeur dessous). */
  label: { x: number; y: number; anchor: "start" | "middle" | "end" };
  /** Flèche de tension (source V) : du plus vers le moins, du côté opposé au texte. */
  arrow: { from: Pt; to: Pt } | null;
}

export interface SchematicDrawing {
  width: number;
  height: number;
  symbols: SchematicSymbol[];
  /** Fils, un tracé SVG par nœud. */
  wires: { node: string; path: string }[];
  /** Points de jonction (trois fils ou plus). */
  dots: Pt[];
  /** Le symbole de masse, sous un point du nœud de référence. */
  ground: Pt | null;
}

export const GRID = 52;
const MARGIN = 58;
const BODY = 40;

const key = (p: Pt) => `${p.x},${p.y}`;
const manhattan = (p: Pt, q: Pt) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y);

type Seg = [Pt, Pt];

/** Le segment (axial) touche-t-il l'INTÉRIEUR du segment `body` ? */
function overlaps(seg: Seg, body: Seg): boolean {
  const [p, q] = seg;
  const [u, v] = body;
  const segH = p.y === q.y;
  const bodyH = u.y === v.y;
  const [s1, s2] = segH ? [Math.min(p.x, q.x), Math.max(p.x, q.x)] : [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  const [b1, b2] = bodyH ? [Math.min(u.x, v.x), Math.max(u.x, v.x)] : [Math.min(u.y, v.y), Math.max(u.y, v.y)];
  if (segH === bodyH) {
    // Colinéaires : même ligne et recouvrement d'une longueur non nulle.
    const same = segH ? p.y === u.y : p.x === u.x;
    return same && Math.min(s2, b2) - Math.max(s1, b1) > 0;
  }
  // Perpendiculaires : croisement strictement à l'intérieur du corps.
  const cross = segH ? { x: u.x, y: p.y } : { x: p.x, y: u.y };
  const onSeg = segH ? cross.x >= s1 && cross.x <= s2 : cross.y >= s1 && cross.y <= s2;
  const insideBody = bodyH ? cross.x > b1 && cross.x < b2 : cross.y > b1 && cross.y < b2;
  return onSeg && insideBody;
}

export function layoutSchematic(view: Pick<NetlistView, "elemente" | "masse" | "plan">): SchematicDrawing | null {
  const plan = view.plan;
  if (!plan || view.elemente.length === 0) return null;

  const raw: { el: TwoPole; a: Pt; b: Pt }[] = [];
  for (const el of view.elemente) {
    if (el.typ === "OPV") return null;
    const p = plan[el.name];
    if (!Array.isArray(p) || p.length !== 4 || !p.every((n) => Number.isInteger(n))) return null;
    const a = { x: p[0], y: p[1] };
    const b = { x: p[2], y: p[3] };
    // Horizontal ou vertical, jamais un point, jamais en biais.
    if ((a.x === b.x) === (a.y === b.y)) return null;
    raw.push({ el, a, b });
  }
  // Deux composants ne se recouvrent pas.
  for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) if (overlaps([raw[i].a, raw[i].b], [raw[j].a, raw[j].b]) && overlaps([raw[j].a, raw[j].b], [raw[i].a, raw[i].b])) return null;

  const minX = Math.min(...raw.flatMap((r) => [r.a.x, r.b.x]));
  const minY = Math.min(...raw.flatMap((r) => [r.a.y, r.b.y]));
  const maxX = Math.max(...raw.flatMap((r) => [r.a.x, r.b.x]));
  const maxY = Math.max(...raw.flatMap((r) => [r.a.y, r.b.y]));
  if (maxX - minX > 24 || maxY - minY > 24) return null;
  const px = (p: Pt): Pt => ({ x: MARGIN + (p.x - minX) * GRID, y: MARGIN + (p.y - minY) * GRID });

  const placed = raw.map((r) => ({ el: r.el, a: px(r.a), b: px(r.b) }));
  const verticalColumns = new Set(placed.filter((p) => p.a.x === p.b.x).map((p) => p.a.x));

  const symbols: SchematicSymbol[] = placed.map(({ el, a, b }) => {
    const horizontal = a.y === b.y;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const half = Math.min(BODY, manhattan(a, b)) / 2;
    const dir = horizontal ? { x: Math.sign(b.x - a.x), y: 0 } : { x: 0, y: Math.sign(b.y - a.y) };
    const bodyA = { x: mid.x - dir.x * half, y: mid.y - dir.y * half };
    const bodyB = { x: mid.x + dir.x * half, y: mid.y + dir.y * half };
    // Le texte du côté libre : à gauche si un autre composant vertical occupe la colonne de droite.
    const crowdedRight = !horizontal && verticalColumns.has(a.x + GRID);
    const label = horizontal
      ? { x: mid.x, y: mid.y - 24, anchor: "middle" as const }
      : crowdedRight
        ? { x: mid.x - 20, y: mid.y - 3, anchor: "end" as const }
        : { x: mid.x + 20, y: mid.y - 3, anchor: "start" as const };
    // Flèche de tension à l'opposé du texte : à gauche d'une source verticale
    // dont le texte est à droite, sous une source horizontale.
    const off = horizontal ? { x: 0, y: 30 } : { x: crowdedRight ? 28 : -28, y: 0 };
    const arrow =
      el.typ === "V"
        ? { from: { x: mid.x - dir.x * 15 + off.x, y: mid.y - dir.y * 15 + off.y }, to: { x: mid.x + dir.x * 15 + off.x, y: mid.y + dir.y * 15 + off.y } }
        : null;
    return { name: el.name, typ: el.typ, a, b, bodyA, bodyB, horizontal, label, arrow };
  });

  // ── Fils : par nœud, arbre le plus court entre ses bornes, en angles droits.
  const terminals = new Map<string, Pt[]>();
  for (const { el, a, b } of placed) {
    for (const [node, pt] of [[el.a, a], [el.b, b]] as const) {
      const list = terminals.get(node) ?? [];
      if (!list.some((q) => key(q) === key(pt))) list.push(pt);
      terminals.set(node, list);
    }
  }
  const bodies: Seg[] = placed.map((p) => [p.a, p.b]);
  // Un fil quitte une borne dans l'axe de son composant, comme sur le papier.
  const axisAt = new Map<string, Set<"h" | "v">>();
  for (const p of placed) {
    const axis = p.a.y === p.b.y ? "h" : "v";
    for (const pt of [p.a, p.b]) axisAt.set(key(pt), (axisAt.get(key(pt)) ?? new Set()).add(axis));
  }
  const along = (pt: Pt, other: Pt) => {
    const axes = axisAt.get(key(pt));
    if (!axes) return 0;
    return axes.has(pt.y === other.y ? "h" : "v") ? 1 : 0;
  };

  const wires: SchematicDrawing["wires"] = [];
  const dots: Pt[] = [];
  for (const [node, pts] of terminals) {
    if (pts.length < 2) continue;
    const inTree = [pts[0]];
    const rest = pts.slice(1);
    const segs: Seg[] = [];
    while (rest.length) {
      let best = { from: inTree[0], i: 0, d: Infinity };
      for (const from of inTree) rest.forEach((to, i) => (manhattan(from, to) < best.d ? (best = { from, i, d: manhattan(from, to) }) : null));
      const to = rest.splice(best.i, 1)[0];
      const from = best.from;
      inTree.push(to);
      if (from.x === to.x || from.y === to.y) {
        segs.push([from, to]);
        continue;
      }
      // Un coude : jamais sur un composant, et de préférence dans l'axe des deux bornes.
      const corners: Pt[] = [{ x: from.x, y: to.y }, { x: to.x, y: from.y }];
      const clear = corners.filter((c) => !bodies.some((b) => overlaps([from, c], b) || overlaps([c, to], b)));
      const pool = clear.length ? clear : corners;
      const corner = pool.reduce((a, b) => (along(from, b) + along(to, b) > along(from, a) + along(to, a) ? b : a));
      segs.push([from, corner], [corner, to]);
      // Le coude devient un point du nœud : les bornes suivantes peuvent s'y brancher.
      inTree.push(corner);
    }
    wires.push({ node, path: segs.map(([p, q]) => `M${p.x},${p.y} L${q.x},${q.y}`).join(" ") });

    // Jonction : trois DIRECTIONS ou plus partent du point (un fil qui passe
    // tout droit devant une borne n'en est pas une).
    const inside = (pt: Pt, [p, q]: Seg) => (p.y === q.y ? pt.y === p.y && pt.x > Math.min(p.x, q.x) && pt.x < Math.max(p.x, q.x) : pt.x === p.x && pt.y > Math.min(p.y, q.y) && pt.y < Math.max(p.y, q.y));
    const toward = (pt: Pt, other: Pt) => `${Math.sign(other.x - pt.x)},${Math.sign(other.y - pt.y)}`;
    const candidates = new Map<string, Pt>();
    for (const [p, q] of segs) for (const pt of [p, q]) candidates.set(key(pt), pt);
    for (const pt of candidates.values()) {
      const dirs = new Set<string>();
      for (const sg of segs) {
        const [p, q] = sg;
        if (key(p) === key(pt)) dirs.add(toward(pt, q));
        else if (key(q) === key(pt)) dirs.add(toward(pt, p));
        else if (inside(pt, sg)) {
          dirs.add(toward(pt, p));
          dirs.add(toward(pt, q));
        }
      }
      for (const pl of placed) {
        if (key(pl.a) === key(pt)) dirs.add(toward(pt, pl.b));
        if (key(pl.b) === key(pt)) dirs.add(toward(pt, pl.a));
      }
      if (dirs.size >= 3) dots.push(pt);
    }
  }

  // La masse : sous le point le plus bas du nœud de référence.
  const groundPts = terminals.get(view.masse ?? "0") ?? [];
  const ground = groundPts.length ? groundPts.reduce((lo, p) => (p.y > lo.y ? p : lo)) : null;

  return {
    width: MARGIN * 2 + (maxX - minX) * GRID,
    height: MARGIN * 2 + (maxY - minY) * GRID + (ground ? 14 : 0),
    symbols,
    wires,
    dots,
    ground,
  };
}
