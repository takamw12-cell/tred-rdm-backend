/**
 * Balkenstatik — deterministisch gerechnet, nicht vom Sprachmodell formuliert.
 *
 * Ein Sprachmodell schreibt Zahlen, es rechnet sie nicht. Bei Auflagerkräften
 * und Momentenverläufen fällt das sofort auf: die Formel stimmt, das Ergebnis
 * nicht. Dieses Modul rechnet die Verläufe geschlossen aus, damit der Tutor
 * belastbare Werte nennt und der Studierende sie gegen seine eigene Rechnung
 * halten kann.
 *
 * Vorzeichen (deutsche Lehrbuchkonvention):
 *   • Lasten nach UNTEN sind positiv (F > 0, q > 0) — so stehen sie in Aufgaben.
 *   • Auflagerkräfte nach OBEN sind positiv.
 *   • Q(x) ist die Summe der nach oben gerichteten Kräfte LINKS vom Schnitt.
 *   • M(x) ist positiv bei Zug an der Unterseite ("Sagging").
 *   • Ein eingeprägtes Moment M0 ist positiv im mathematischen Sinn
 *     (gegen den Uhrzeigersinn).
 *
 * Damit ergibt sich für den Standardfall Einfeldträger mit Einzellast F in
 * Feldmitte: A = B = F/2 und M_max = F·L/4 — genau der Wert, der in jeder
 * Formelsammlung steht.
 */

export interface PointLoad {
  /** Abstand vom linken Balkenende in m. */
  x: number;
  /** Kraft in N, positiv nach unten. */
  F: number;
}

export interface DistributedLoad {
  /** Beginn in m. */
  from: number;
  /** Ende in m. */
  to: number;
  /** Streckenlast in N/m, positiv nach unten (konstant). */
  q: number;
}

export interface PointMoment {
  x: number;
  /** Eingeprägtes Moment in N·m, positiv gegen den Uhrzeigersinn. */
  M: number;
}

export type BeamKind = "einfeldtraeger" | "kragarm";

export interface BeamInput {
  kind: BeamKind;
  /** Balkenlänge in m. */
  length: number;
  /** Einfeldträger: Lager links/rechts. Standard 0 und L. */
  supportA?: number;
  supportB?: number;
  /** Kragarm: Einspannung. Standard 0 (links eingespannt). */
  fixedAt?: number;
  pointLoads?: PointLoad[];
  distributedLoads?: DistributedLoad[];
  pointMoments?: PointMoment[];
}

export interface Point {
  x: number;
  y: number;
}

export interface BeamResult {
  ok: true;
  kind: BeamKind;
  length: number;
  /** Auflagerkräfte in N, positiv nach oben. */
  supportReactions: { name: string; x: number; y: number }[];
  /** Einspannmoment in N·m (nur Kragarm). */
  fixedEndMoment?: { x: number; M: number };
  shearForceDiagram: Point[];
  bendingMomentDiagram: Point[];
  extremes: {
    shearMax: Point;
    shearMin: Point;
    momentMax: Point;
    momentMin: Point;
    /** Betragsgrößtes Moment — die Zahl für die Bemessung. */
    momentAbsMax: Point;
  };
  /** Stellen mit Q = 0: dort liegt das Momentenextremum. */
  zeroShearAt: number[];
  units: { force: "N"; length: "m"; moment: "N*m" };
}

export interface BeamError {
  ok: false;
  error: string;
}

// Abstand, mit dem links und rechts einer Sprungstelle abgetastet wird.
// Klein genug, um den Sprung sauber zu zeigen, groß genug für die Darstellung.
const EPS = 1e-6;
// Grundauflösung des Verlaufs. 200 Stützstellen reichen für eine glatte Kurve
// und halten die Antwort klein — sie geht als JSON durch das Sprachmodell.
const SAMPLES = 200;

function round(v: number, digits = 6): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}

/** Anteil einer Streckenlast links von x: [Resultierende, Schwerpunkt]. */
function udlLeftOf(load: DistributedLoad, x: number): [number, number] {
  const a = Math.max(load.from, 0);
  const b = Math.min(load.to, x);
  if (b <= a) return [0, 0];
  const R = load.q * (b - a);
  return [R, (a + b) / 2];
}

export function solveBeam(input: BeamInput): BeamResult | BeamError {
  const L = input.length;
  if (!Number.isFinite(L) || L <= 0) {
    return { ok: false, error: "Balkenlänge muss größer als 0 sein." };
  }

  const points = input.pointLoads ?? [];
  const udls = (input.distributedLoads ?? []).filter((d) => d.to > d.from);
  const moments = input.pointMoments ?? [];

  for (const p of points) {
    if (p.x < 0 || p.x > L) {
      return { ok: false, error: `Einzellast bei x = ${p.x} m liegt außerhalb des Balkens.` };
    }
  }
  for (const d of udls) {
    if (d.from < 0 || d.to > L) {
      return { ok: false, error: `Streckenlast ${d.from}–${d.to} m liegt außerhalb des Balkens.` };
    }
  }

  // ── Gleichgewicht: Auflagerreaktionen ───────────────────────────────────
  const totalLoad =
    points.reduce((s, p) => s + p.F, 0) + udls.reduce((s, d) => s + d.q * (d.to - d.from), 0);

  // Moment aller Lasten um x = 0 (nach unten gerichtete Last erzeugt hier ein
  // Moment im Uhrzeigersinn; wir zählen es positiv und ziehen es unten ab).
  const loadMomentAboutOrigin =
    points.reduce((s, p) => s + p.F * p.x, 0) +
    udls.reduce((s, d) => s + d.q * (d.to - d.from) * ((d.from + d.to) / 2), 0);
  const appliedMoment = moments.reduce((s, m) => s + m.M, 0);

  const reactions: { name: string; x: number; y: number }[] = [];
  let fixedEnd: { x: number; M: number } | undefined;

  if (input.kind === "einfeldtraeger") {
    const a = input.supportA ?? 0;
    const b = input.supportB ?? L;
    if (Math.abs(b - a) < 1e-9) {
      return { ok: false, error: "Die beiden Lager dürfen nicht an derselben Stelle liegen." };
    }
    // ΣM um A = 0  →  B·(b−a) = Σ F_i·(x_i−a) − ΣM_j
    const B = (loadMomentAboutOrigin - totalLoad * a - appliedMoment) / (b - a);
    const A = totalLoad - B;
    reactions.push({ name: "A", x: a, y: round(A, 4) });
    reactions.push({ name: "B", x: b, y: round(B, 4) });
  } else {
    const xf = input.fixedAt ?? 0;
    // Einspannung nimmt die gesamte Last und das gesamte Moment auf.
    const V = totalLoad;
    // M(x_f) muss dem Einspannmoment entsprechen — Vorzeichen wie unten in M(x).
    const M = -(loadMomentAboutOrigin - totalLoad * xf) - appliedMoment;
    reactions.push({ name: "Einspannung", x: xf, y: round(V, 4) });
    fixedEnd = { x: xf, M: round(M, 4) };
  }

  // ── Schnittgrößen an einer Stelle ───────────────────────────────────────
  function shearAt(x: number): number {
    let Q = 0;
    for (const r of reactions) if (r.x <= x) Q += r.y;
    for (const p of points) if (p.x <= x) Q -= p.F;
    for (const d of udls) Q -= udlLeftOf(d, x)[0];
    return Q;
  }

  function momentAt(x: number): number {
    let M = 0;
    for (const r of reactions) if (r.x <= x) M += r.y * (x - r.x);
    for (const p of points) if (p.x <= x) M -= p.F * (x - p.x);
    for (const d of udls) {
      const [R, c] = udlLeftOf(d, x);
      M -= R * (x - c);
    }
    for (const m of moments) if (m.x <= x) M -= m.M;
    // Beim Kragarm sitzt das Einspannmoment an der Einspannstelle.
    if (fixedEnd && fixedEnd.x <= x) M += fixedEnd.M;
    return M;
  }

  // ── Abtastung: Raster plus exakte Sprungstellen ─────────────────────────
  const xs = new Set<number>([0, L]);
  for (let i = 0; i <= SAMPLES; i++) xs.add((L * i) / SAMPLES);
  // An Sprungstellen links und rechts abtasten, sonst verschluckt die Kurve
  // den Sprung und der Verlauf sieht stetig aus, wo er es nicht ist.
  for (const p of points) {
    xs.add(Math.max(0, p.x - EPS));
    xs.add(Math.min(L, p.x + EPS));
  }
  for (const m of moments) {
    xs.add(Math.max(0, m.x - EPS));
    xs.add(Math.min(L, m.x + EPS));
  }
  for (const r of reactions) {
    xs.add(Math.max(0, r.x - EPS));
    xs.add(Math.min(L, r.x + EPS));
  }
  for (const d of udls) {
    xs.add(d.from);
    xs.add(d.to);
  }

  const sorted = [...xs].filter((x) => x >= 0 && x <= L).sort((a, b) => a - b);

  const shear: Point[] = sorted.map((x) => ({ x: round(x), y: round(shearAt(x), 4) }));
  const moment: Point[] = sorted.map((x) => ({ x: round(x), y: round(momentAt(x), 4) }));

  // ── Nulldurchgänge der Querkraft: dort liegt M_extrem ───────────────────
  const zeroShear: number[] = [];
  for (let i = 1; i < shear.length; i++) {
    const p0 = shear[i - 1]!;
    const p1 = shear[i]!;
    if (p0.y === 0) {
      zeroShear.push(p0.x);
      continue;
    }
    if (p0.y * p1.y < 0) {
      // Lineare Interpolation reicht: zwischen zwei Stützstellen ist Q linear
      // (konstante Streckenlast) oder springt (Einzellast).
      const t = p0.y / (p0.y - p1.y);
      const x = p0.x + t * (p1.x - p0.x);
      if (Math.abs(p1.x - p0.x) > 1e-4) zeroShear.push(round(x, 4));
    }
  }
  // Das Extremum liegt oft exakt am Nulldurchgang — dort zusätzlich auswerten.
  for (const x of zeroShear) moment.push({ x: round(x), y: round(momentAt(x), 4) });
  moment.sort((a, b) => a.x - b.x);

  const pick = (arr: Point[], cmp: (a: Point, b: Point) => boolean) =>
    arr.reduce((best, p) => (cmp(p, best) ? p : best), arr[0]!);

  const momentMax = pick(moment, (a, b) => a.y > b.y);
  const momentMin = pick(moment, (a, b) => a.y < b.y);

  return {
    ok: true,
    kind: input.kind,
    length: L,
    supportReactions: reactions,
    ...(fixedEnd ? { fixedEndMoment: fixedEnd } : {}),
    shearForceDiagram: shear,
    bendingMomentDiagram: moment,
    extremes: {
      shearMax: pick(shear, (a, b) => a.y > b.y),
      shearMin: pick(shear, (a, b) => a.y < b.y),
      momentMax,
      momentMin,
      momentAbsMax: Math.abs(momentMax.y) >= Math.abs(momentMin.y) ? momentMax : momentMin,
    },
    zeroShearAt: zeroShear,
    units: { force: "N", length: "m", moment: "N*m" },
  };
}

/**
 * Kurzfassung für das Sprachmodell. Die vollen Verläufe haben hunderte Punkte;
 * im Gespräch zählen die Eckwerte. Die Punktlisten gehen separat ans Frontend.
 */
export function summarize(r: BeamResult): string {
  const lines: string[] = [];
  for (const s of r.supportReactions) {
    lines.push(`${s.name} bei x = ${s.x} m: ${s.y} N`);
  }
  if (r.fixedEndMoment) {
    lines.push(`Einspannmoment bei x = ${r.fixedEndMoment.x} m: ${r.fixedEndMoment.M} N*m`);
  }
  lines.push(
    `Q_max = ${r.extremes.shearMax.y} N bei x = ${r.extremes.shearMax.x} m`,
    `Q_min = ${r.extremes.shearMin.y} N bei x = ${r.extremes.shearMin.x} m`,
    `|M|_max = ${r.extremes.momentAbsMax.y} N*m bei x = ${r.extremes.momentAbsMax.x} m`,
  );
  if (r.zeroShearAt.length > 0) {
    lines.push(`Q = 0 bei x = ${r.zeroShearAt.join(", ")} m (Momentenextremum)`);
  }
  return lines.join("\n");
}
