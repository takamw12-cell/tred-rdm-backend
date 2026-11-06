/**
 * Maquettes 3D du tuteur — bloc ```3d-json.
 *
 * Le modèle n'écrit JAMAIS de code (ni JSX, ni JavaScript) : il décrit la
 * pièce dans ce JSON strict, et ce module le valide puis le traduit en un
 * PLAN géométrique. Le plan est rendu par components/Model3DViewer.tsx
 * (Three.js). Module pur, sans Three.js : testé dans tests/model3d.test.ts.
 *
 * ── Format (unités : mm ; `position` = CENTRE de la forme) ─────────────────
 *
 *   [
 *     { "type": "cylinder", "radius": 30, "height": 120, "position": [0, 60, 0] },
 *     { "type": "box", "size": [80, 40, 20], "position": [0, 120, 0] },
 *     { "type": "hole", "radius": 10, "position": [0, 120, 0] }
 *   ]
 *
 *   ou { "title": "…", "parts": [ … ] }.
 *
 *   Formes : box (size [x,y,z]) · cylinder (radius, height) · hex (prisme
 *   hexagonal, `across` = Schlüsselweite, height) · cone (radiusBottom,
 *   radiusTop, height) · sphere (radius) · torus (radius, tube).
 *   `axis` "x" | "y" | "z" (défaut "y") oriente cylinder/hex/cone/torus.
 *   `material` steel | aluminium | brass | plastic | accent ; `label` court.
 *
 *   hole : radius, position, axis, depth facultative. Sans `axis`, le
 *   premier axe (y, puis z, puis x) où le trou tient dans une pièce.
 *   Sans depth : perçage débouchant de la ou des pièces dont l'étendue
 *   contient STRICTEMENT le centre du trou. Avec depth : trou borgne sur
 *   [centre − depth/2, centre + depth/2]. Un trou se perce dans un box
 *   (dans n'importe quel axe) ou dans un cylinder/hex de même axe, s'il tient
 *   entièrement dans la section. Sinon il est affiché comme repère.
 *
 * ── Perçages sans CSG ─────────────────────────────────────────────────────
 *
 * Chaque pièce perçable devient une ou plusieurs EXTRUSIONS : la section
 * (rectangle, cercle, hexagone) avec des cercles évidés, extrudée le long de
 * l'axe. Un trou borgne découpe la pièce en tronçons. Pas de dépendance de
 * géométrie booléenne, et un résultat exact pour ce qui compte en cours :
 * perçages, alésages, brides, entretoises.
 */

export const MODEL3D_LANG = "3d-json";

export type Vec3 = [number, number, number];
export type Axis = "x" | "y" | "z";
export const MATERIALS = ["steel", "aluminium", "brass", "plastic", "accent"] as const;
export type MaterialName = (typeof MATERIALS)[number];

interface Common {
  position: Vec3;
  material: MaterialName;
  label?: string;
}
export type Solid =
  | (Common & { type: "box"; size: Vec3 })
  | (Common & { type: "cylinder"; radius: number; height: number; axis: Axis })
  | (Common & { type: "hex"; across: number; height: number; axis: Axis })
  | (Common & { type: "cone"; radiusBottom: number; radiusTop: number; height: number; axis: Axis })
  | (Common & { type: "sphere"; radius: number })
  | (Common & { type: "torus"; radius: number; tube: number; axis: Axis });

export interface Hole {
  type: "hole";
  radius: number;
  position: Vec3;
  axis: Axis;
  /** `axis` absent du JSON : le plan choisit l'axe où le trou tient (y, z, x). */
  axisAuto?: boolean;
  depth?: number;
}

export interface Model3D {
  title?: string;
  parts: Solid[];
  holes: Hole[];
}

export const LIMITS = { items: 60, size: 10_000, label: 40, title: 80 } as const;

export type ParseResult = { ok: true; model: Model3D } | { ok: false; error: string };

/* ── Validation ──────────────────────────────────────────────────────────── */

class Invalid extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function num(o: Record<string, unknown>, key: string, where: string, { min = 0, positive = true } = {}): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Invalid(`${where}: „${key}“ fehlt oder ist keine Zahl`);
  if (positive && v <= min) throw new Invalid(`${where}: „${key}“ muss größer als ${min} sein`);
  if (Math.abs(v) > LIMITS.size) throw new Invalid(`${where}: „${key}“ ist zu groß (max. ${LIMITS.size} mm)`);
  return v;
}

function vec(o: Record<string, unknown>, key: string, where: string, positive: boolean, fallback?: Vec3): Vec3 {
  const v = o[key];
  if (v === undefined && fallback) return fallback;
  if (!Array.isArray(v) || v.length !== 3) throw new Invalid(`${where}: „${key}“ muss [x, y, z] sein`);
  return v.map((n, i) => num({ n }, "n", `${where} ${key}[${i}]`, { positive })) as Vec3;
}

function axisOf(o: Record<string, unknown>, where: string): Axis {
  const a = o.axis ?? "y";
  if (a !== "x" && a !== "y" && a !== "z") throw new Invalid(`${where}: „axis“ muss "x", "y" oder "z" sein`);
  return a;
}

/** Texte court, une ligne, sans caractères de contrôle. */
function text(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);
  return s || undefined;
}

function parseItem(raw: unknown, i: number): Solid | Hole {
  const where = `Element ${i + 1}`;
  if (!isObj(raw)) throw new Invalid(`${where}: kein Objekt`);
  const position = vec(raw, "position", where, false, [0, 0, 0]);
  const mat = raw.material ?? "steel";
  if (!MATERIALS.includes(mat as MaterialName)) throw new Invalid(`${where}: unbekanntes Material „${String(mat)}“`);
  const common: Common = { position, material: mat as MaterialName, label: text(raw.label, LIMITS.label) };

  switch (raw.type) {
    case "box":
      return { ...common, type: "box", size: vec(raw, "size", where, true) };
    case "cylinder":
      return { ...common, type: "cylinder", radius: num(raw, "radius", where), height: num(raw, "height", where), axis: axisOf(raw, where) };
    case "hex":
      return { ...common, type: "hex", across: num(raw, "across", where), height: num(raw, "height", where), axis: axisOf(raw, where) };
    case "cone":
      return {
        ...common,
        type: "cone",
        radiusBottom: num(raw, "radiusBottom", where, { min: -1e-9 }),
        radiusTop: num(raw, "radiusTop", where, { min: -1e-9 }),
        height: num(raw, "height", where),
        axis: axisOf(raw, where),
      };
    case "sphere":
      return { ...common, type: "sphere", radius: num(raw, "radius", where) };
    case "torus":
      return { ...common, type: "torus", radius: num(raw, "radius", where), tube: num(raw, "tube", where), axis: axisOf(raw, where) };
    case "hole":
      return {
        type: "hole",
        radius: num(raw, "radius", where),
        position,
        axis: axisOf(raw, where),
        ...(raw.axis === undefined ? { axisAuto: true } : {}),
        ...(raw.depth === undefined ? {} : { depth: num(raw, "depth", where) }),
      };
    default:
      throw new Invalid(`${where}: unbekannter Typ „${String(raw.type)}“`);
  }
}

/** Valide un bloc ```3d-json. Ne lève jamais : renvoie une erreur lisible. */
export function parseModel3D(source: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(source);
  } catch {
    return { ok: false, error: "Kein gültiges JSON" };
  }
  const list = Array.isArray(data) ? data : isObj(data) && Array.isArray(data.parts) ? data.parts : null;
  if (!list) return { ok: false, error: "Erwartet: eine Liste von Formen oder {\"parts\": […]}" };
  if (list.length === 0) return { ok: false, error: "Das Modell ist leer" };
  if (list.length > LIMITS.items) return { ok: false, error: `Zu viele Elemente (max. ${LIMITS.items})` };
  try {
    const items = list.map(parseItem);
    const parts = items.filter((x): x is Solid => x.type !== "hole");
    const holes = items.filter((x): x is Hole => x.type === "hole");
    if (parts.length === 0) return { ok: false, error: "Kein Körper — nur Bohrungen" };
    const title = isObj(data) ? text(data.title, LIMITS.title) : undefined;
    return { ok: true, model: { ...(title ? { title } : {}), parts, holes } };
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Pendant le streaming, le bloc arrive incomplet : ce n'est pas une erreur.
 * Un bloc qui ne se termine pas encore par `]` ou `}` est « en cours ».
 */
export function looksIncomplete(source: string): boolean {
  const s = source.trim();
  return s.length === 0 || !(s.endsWith("]") || s.endsWith("}"));
}

/* ── Plan géométrique ────────────────────────────────────────────────────── */

/**
 * Coordonnées dans le plan de section (u, v) et le long de l'axe (w).
 * Le rendu extrude la section en +Z puis la tourne : ces correspondances
 * sont l'inverse exact de ces rotations (voir Model3DViewer.tsx).
 *   axe y : (u, v, w) = ( x, −z, y)   — rotateX(−90°)
 *   axe x : (u, v, w) = (−z,  y, x)   — rotateY(+90°)
 *   axe z : (u, v, w) = ( x,  y, z)
 */
export function toPlane(axis: Axis, p: Vec3): { u: number; v: number; w: number } {
  const [x, y, z] = p;
  if (axis === "y") return { u: x, v: -z, w: y };
  if (axis === "x") return { u: -z, v: y, w: x };
  return { u: x, v: y, w: z };
}

export type Outline =
  | { kind: "rect"; u: number; v: number; width: number; height: number }
  | { kind: "circle"; u: number; v: number; r: number }
  | { kind: "hex"; u: number; v: number; across: number };

/** Un tronçon extrudé : section évidée, de w = from à w = to le long de `axis`. */
export interface ExtrudePlan {
  kind: "extrude";
  axis: Axis;
  outline: Outline;
  holes: { u: number; v: number; r: number }[];
  from: number;
  to: number;
  material: MaterialName;
  partIndex: number;
}

/** Forme sans perçage possible, rendue par la primitive Three.js. */
export interface PrimitivePlan {
  kind: "primitive";
  solid: Extract<Solid, { type: "cone" | "sphere" | "torus" }>;
  partIndex: number;
}

/** Trou qui n'a trouvé aucune pièce : montré comme repère, jamais en silence. */
export interface HoleMarkerPlan {
  kind: "hole-marker";
  hole: Hole;
}

export type PlanItem = ExtrudePlan | PrimitivePlan | HoleMarkerPlan;

const EPS = 1e-6;

/** Section et étendue d'une pièce perçable dans l'axe donné, sinon null. */
function sectionOf(s: Solid, axis: Axis): { outline: Outline; from: number; to: number } | null {
  const c = toPlane(axis, s.position);
  if (s.type === "box") {
    const d = toPlane(axis, s.size);
    const [width, height, length] = [Math.abs(d.u), Math.abs(d.v), Math.abs(d.w)];
    return { outline: { kind: "rect", u: c.u, v: c.v, width, height }, from: c.w - length / 2, to: c.w + length / 2 };
  }
  if ((s.type === "cylinder" || s.type === "hex") && s.axis === axis) {
    const outline: Outline =
      s.type === "cylinder" ? { kind: "circle", u: c.u, v: c.v, r: s.radius } : { kind: "hex", u: c.u, v: c.v, across: s.across };
    return { outline, from: c.w - s.height / 2, to: c.w + s.height / 2 };
  }
  return null;
}

/** Le cercle (u, v, r) tient-il entièrement dans la section ? */
function fitsIn(o: Outline, u: number, v: number, r: number): boolean {
  const du = u - o.u;
  const dv = v - o.v;
  if (o.kind === "rect") return Math.abs(du) + r < o.width / 2 - EPS && Math.abs(dv) + r < o.height / 2 - EPS;
  if (o.kind === "circle") return Math.hypot(du, dv) + r < o.r - EPS;
  return Math.hypot(du, dv) + r < o.across / 2 - EPS; // cercle inscrit de l'hexagone
}

/** Le trou perce-t-il cette pièce dans cet axe ? Renvoie son étendue. */
function holeSpan(solid: Solid, hole: Hole, axis: Axis) {
  const sec = sectionOf(solid, axis);
  if (!sec) return null;
  const h = toPlane(axis, hole.position);
  if (!fitsIn(sec.outline, h.u, h.v, hole.radius)) return null;
  const span =
    hole.depth === undefined
      ? h.w > sec.from + EPS && h.w < sec.to - EPS
        ? { from: sec.from, to: sec.to }
        : null
      : { from: Math.max(sec.from, h.w - hole.depth / 2), to: Math.min(sec.to, h.w + hole.depth / 2) };
  if (!span || span.to - span.from <= EPS) return null;
  return { ...span, u: h.u, v: h.v };
}

/**
 * Axe d'un trou sans `axis` : un Ø20 au centre d'une plaque de 20 mm
 * d'épaisseur ne peut pas la traverser verticalement — il la traverse dans
 * l'épaisseur. On prend le premier axe (y, z, x) où il tient dans une pièce.
 */
function resolveHoles(model: Model3D): Hole[] {
  return model.holes.map((hole) => {
    if (!hole.axisAuto) return hole;
    for (const axis of ["y", "z", "x"] as const) {
      if (model.parts.some((p) => holeSpan(p, hole, axis))) return { ...hole, axis };
    }
    return hole;
  });
}

/** Traduit le modèle validé en éléments à dessiner. */
export function planModel(model: Model3D): PlanItem[] {
  const plan: PlanItem[] = [];
  const holes = resolveHoles(model);
  const used = new Set<Hole>();

  model.parts.forEach((solid, partIndex) => {
    if (solid.type === "cone" || solid.type === "sphere" || solid.type === "torus") {
      plan.push({ kind: "primitive", solid, partIndex });
      return;
    }
    // Axe d'extrusion : celui de la pièce ; pour un box, celui de ses trous
    // (le premier trou qui le perce), sinon y.
    const candidates: { hole: Hole; axis: Axis; from: number; to: number; u: number; v: number }[] = [];
    for (const hole of holes) {
      const span = holeSpan(solid, hole, hole.axis);
      if (span) candidates.push({ hole, axis: hole.axis, ...span });
    }
    const axis: Axis = solid.type === "box" ? (candidates[0]?.axis ?? "y") : solid.axis;
    const sec = sectionOf(solid, axis)!;
    const mine = candidates.filter((c) => c.axis === axis);
    mine.forEach((c) => used.add(c.hole));

    // Tronçons : chaque extrémité de trou borgne coupe la pièce.
    const cuts = [...new Set([sec.from, sec.to, ...mine.flatMap((c) => [c.from, c.to])])].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const [from, to] = [cuts[i], cuts[i + 1]];
      if (to - from <= EPS) continue;
      const mid = (from + to) / 2;
      plan.push({
        kind: "extrude",
        axis,
        outline: sec.outline,
        holes: mine.filter((c) => c.from <= mid && mid <= c.to).map((c) => ({ u: c.u, v: c.v, r: c.hole.radius })),
        from,
        to,
        material: solid.material,
        partIndex,
      });
    }
  });

  for (const hole of holes) if (!used.has(hole)) plan.push({ kind: "hole-marker", hole });
  return plan;
}

/** Boîte englobante (mm) — cadrage de la caméra et taille de la grille. */
export function boundsOf(model: Model3D): { min: Vec3; max: Vec3; size: number } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const grow = (p: Vec3, half: Vec3) => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i] - half[i]);
      max[i] = Math.max(max[i], p[i] + half[i]);
    }
  };
  const along = (axis: Axis, length: number, radius: number): Vec3 =>
    axis === "x" ? [length / 2, radius, radius] : axis === "y" ? [radius, length / 2, radius] : [radius, radius, length / 2];
  for (const s of model.parts) {
    if (s.type === "box") grow(s.position, [s.size[0] / 2, s.size[1] / 2, s.size[2] / 2]);
    else if (s.type === "cylinder") grow(s.position, along(s.axis, s.height, s.radius));
    else if (s.type === "hex") grow(s.position, along(s.axis, s.height, s.across / Math.sqrt(3)));
    else if (s.type === "cone") grow(s.position, along(s.axis, s.height, Math.max(s.radiusBottom, s.radiusTop)));
    else if (s.type === "sphere") grow(s.position, [s.radius, s.radius, s.radius]);
    else grow(s.position, along(s.axis, 2 * s.tube, s.radius + s.tube));
  }
  const size = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return { min, max, size };
}

/** Description texte (accessibilité, et liste sous la maquette). */
export function describePart(s: Solid): string {
  const n = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  const base =
    s.type === "box"
      ? `Quader ${n(s.size[0])}×${n(s.size[1])}×${n(s.size[2])}`
      : s.type === "cylinder"
        ? `Zylinder Ø${n(2 * s.radius)}×${n(s.height)}`
        : s.type === "hex"
          ? `Sechskant SW${n(s.across)}×${n(s.height)}`
          : s.type === "cone"
            ? `Kegel Ø${n(2 * s.radiusBottom)}→Ø${n(2 * s.radiusTop)}×${n(s.height)}`
            : s.type === "sphere"
              ? `Kugel Ø${n(2 * s.radius)}`
              : `Ring Ø${n(2 * s.radius)}×${n(2 * s.tube)}`;
  return s.label ? `${s.label} (${base})` : base;
}
