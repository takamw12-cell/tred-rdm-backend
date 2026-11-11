/**
 * Technische Mechanik / Balkenstatik — der Schiedsrichter über alle Zahlen.
 *
 * Ein Sprachmodell schreibt Zahlen, es rechnet sie nicht. Deshalb rechnet
 * dieses Modul, und das Modell darf das Ergebnis ausschließlich ERKLÄREN und
 * ZEICHNEN LASSEN. Keine Zahl in einer Antwort von TRED darf aus dem Modell
 * stammen.
 *
 * Gegenüber `lib/beam.ts` (geschlossene Formeln, nur statisch bestimmt) kann
 * dieses Modul zusätzlich:
 *   • beliebig viele Lager (Durchlaufträger, eingespannter Träger mit Stütze …)
 *     — also STATISCH UNBESTIMMTE Systeme,
 *   • Einheiten selbst normalisieren (mm, kN, kN/m … → SI),
 *   • sich nach der Rechnung selbst überprüfen (Gleichgewichtsresiduum).
 *
 * Verfahren
 * ---------
 * Zwei Schritte, jeder mit dem Werkzeug, das er verdient:
 *
 * 1. AUFLAGERKRÄFTE per Finite-Elemente (Euler-Bernoulli-Balken, 2 Knoten,
 *    je 2 Freiheitsgrade: Durchsenkung w und Neigung φ). Nur so lassen sich
 *    unbestimmte Systeme lösen — dort reichen die Gleichgewichtsbedingungen
 *    allein nicht aus, man braucht die Verformung.
 *
 * 2. SCHNITTGRÖSSEN Q(x) und M(x) anschließend in GESCHLOSSENER FORM aus den
 *    nun bekannten Auflagerkräften. Das ist exakt (kein Diskretisierungs-
 *    fehler), erzeugt saubere Sprünge an Lasteinleitungen und benutzt exakt
 *    dieselbe Vorzeichenkonvention wie `beam.ts`.
 *
 * Vorzeichen (deutsche Lehrbuchkonvention, identisch zu beam.ts)
 * -------------------------------------------------------------
 *   • Lasten nach UNTEN sind positiv (F > 0, q > 0).
 *   • Auflagerkräfte nach OBEN sind positiv.
 *   • Q(x) = Summe der nach oben gerichteten Kräfte LINKS vom Schnitt.
 *   • M(x) positiv bei Zug an der Unterseite ("Sagging").
 *   • Eingeprägtes Moment M₀ positiv gegen den Uhrzeigersinn.
 *
 * Prüffälle: Einfeldträger mit F in Feldmitte → A = B = F/2, M_max = F·L/4.
 * Beidseitig eingespannt mit F in Feldmitte → M_Rand = −F·L/8, M_Feld = F·L/8.
 */

import { toSI, UnitError, type Quantity } from "./units";

/* -------------------------------------------------------------------------- */
/* Eingabe                                                                    */
/* -------------------------------------------------------------------------- */

/** Zahl mit optionaler Einheit: 1.5 | "1,5 m" | { value: 1500, unit: "mm" } */
export type Measure = number | string | { value: number; unit?: string };

export type SupportKind =
  /** Loslager: nur vertikal gehalten (Rollenlager). */
  | "loslager"
  /** Festlager: vertikal gehalten (horizontal ist bei reiner Biegung ohne Belang). */
  | "festlager"
  /** Einspannung: Durchsenkung UND Neigung gehalten. */
  | "einspannung";

export interface SupportInput {
  /** Lage vom linken Balkenende. */
  x: Measure;
  kind: SupportKind;
  /** Beschriftung im Diagramm, z. B. "A". */
  name?: string;
}

export interface PointLoadInput {
  x: Measure;
  /** Kraft, positiv nach unten. */
  F: Measure;
  name?: string;
}

export interface DistributedLoadInput {
  from: Measure;
  to: Measure;
  /**
   * Streckenlast am Beginn (`from`), positiv nach unten. Ohne `qEnd`
   * konstant über die ganze Länge.
   */
  q: Measure;
  /**
   * Streckenlast am Ende (`to`). Dazwischen LINEAR: Dreieckslast
   * (q = 0, qEnd = q₀) oder Trapezlast (q ≠ qEnd).
   */
  qEnd?: Measure;
}

export interface PointMomentInput {
  x: Measure;
  /** Eingeprägtes Moment, positiv gegen den Uhrzeigersinn. */
  M: Measure;
}

export interface BeamProblem {
  /** Balkenlänge. */
  length: Measure;
  supports: SupportInput[];
  pointLoads?: PointLoadInput[];
  distributedLoads?: DistributedLoadInput[];
  pointMoments?: PointMomentInput[];
  /**
   * Biegesteifigkeit E·I. Bei statisch BESTIMMTEN Systemen ohne Einfluss auf
   * die Auflagerkräfte — deshalb optional. Bei unbestimmten Systemen mit
   * konstantem Querschnitt kürzt sie sich ebenfalls heraus; sie zählt erst,
   * wenn sich der Querschnitt über die Länge ändert (hier nicht abgebildet).
   */
  EI?: Measure;
  /** Anzahl Stützstellen der Verläufe. */
  samples?: number;
}

/* -------------------------------------------------------------------------- */
/* Ausgabe                                                                    */
/* -------------------------------------------------------------------------- */

export interface Point {
  x: number;
  y: number;
}

export interface Reaction {
  name: string;
  x: number;
  /** Vertikale Auflagerkraft in N, positiv nach oben. */
  force: number;
  /**
   * Einspannmoment in N·m (nur bei Einspannungen), sonst 0 — in der
   * Konvention von M(x): gleich M(0⁺) links, M(L⁻) rechts. Ein Kragarm oder
   * ein beidseitig eingespannter Träger mit Last nach unten ist an beiden
   * Rändern NEGATIV.
   */
  moment: number;
}

export interface SolveOk {
  ok: true;
  /** Alle Werte in SI: m, N, N·m. */
  length: number;
  /** Grad der statischen Unbestimmtheit: 0 = bestimmt, >0 = unbestimmt. */
  degreeOfIndeterminacy: number;
  reactions: Reaction[];
  shear: Point[];
  moment: Point[];
  extremes: {
    shearMax: Point;
    shearMin: Point;
    momentMax: Point;
    momentMin: Point;
  };
  /** Nachrechnung: ΣV und ΣM über das Gesamtsystem. Muss ≈ 0 sein. */
  equilibrium: { sumForces: number; sumMoments: number; tolerance: number };
  /** Hinweise, die den Studierenden betreffen, aber die Rechnung nicht verhindern. */
  warnings: string[];
}

export interface SolveError {
  ok: false;
  error: string;
  /** Maschinenlesbarer Grund — das Frontend kann darauf reagieren. */
  code:
    | "INVALID_GEOMETRY"
    | "INVALID_UNIT"
    | "UNSTABLE"
    | "NOT_IN_EQUILIBRIUM"
    | "NUMERICAL";
  /** Bei UNSTABLE: wo eine Lagerung fehlt. */
  hint?: string;
}

export type SolveResult = SolveOk | SolveError;

/* -------------------------------------------------------------------------- */
/* Hilfen                                                                     */
/* -------------------------------------------------------------------------- */

function measure(m: Measure, quantity: Quantity, label: string): number {
  try {
    if (typeof m === "object" && m !== null) return toSI(m.value, quantity, m.unit);
    return toSI(m, quantity);
  } catch (error) {
    if (error instanceof UnitError) throw new UnitError(`${label}: ${error.message}`);
    throw error;
  }
}

function round(v: number, digits = 6): number {
  const f = 10 ** digits;
  const r = Math.round(v * f) / f;
  // Vermeidet "-0" in der Ausgabe, das Studierende irritiert.
  return Object.is(r, -0) ? 0 : r;
}

/** Gauß-Elimination mit Spaltenpivotisierung. Gibt null bei Singularität. */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    // Skalierungsunabhängige Singularitätsschwelle: die Steifigkeitsmatrix
    // enthält je nach EI sehr große Zahlen, ein fester Grenzwert wäre falsch.
    const scale = Math.max(...M.map((row) => Math.abs(row[col])), 1);
    if (Math.abs(M[pivot][col]) < 1e-12 * scale) return null;

    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];

    for (let r = col + 1; r < n; r++) {
      const factor = M[r][col] / M[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = M[r][n];
    for (let c = r + 1; c < n; c++) sum -= M[r][c] * x[c];
    x[r] = sum / M[r][r];
  }
  return x.every((v) => Number.isFinite(v)) ? x : null;
}

/* -------------------------------------------------------------------------- */
/* Lösung                                                                     */
/* -------------------------------------------------------------------------- */

const DEFAULT_SAMPLES = 200;
/** Abstand zum beidseitigen Abtasten an Sprungstellen. */
const EPS = 1e-6;

/** Streckenlast, linear von `q` (bei `from`) nach `qEnd` (bei `to`). SI. */
interface LinearLoad {
  from: number;
  to: number;
  q: number;
  qEnd: number;
}

/** Intensität einer linearen Streckenlast an der Stelle s (innerhalb). */
function intensityAt(d: LinearLoad, s: number): number {
  return d.q + ((d.qEnd - d.q) * (s - d.from)) / (d.to - d.from);
}

/**
 * Anteil einer linearen Streckenlast LINKS vom Schnitt x:
 * Resultierende R = ∫ q ds und Moment um den Schnitt ∫ q(s)·(x − s) ds,
 * beide in geschlossener Form. Kein Schwerpunkt mit Division: bleibt auch
 * bei einer Last mit Vorzeichenwechsel (R = 0) exakt.
 */
function linearLoadLeftOf(d: LinearLoad, x: number): { R: number; Mx: number } {
  const a = d.from;
  const b = Math.min(d.to, x);
  if (b <= a) return { R: 0, Mx: 0 };
  const h = b - a;
  const qa = d.q;
  const k = (d.qEnd - d.q) / (d.to - d.from);
  const R = qa * h + (k * h * h) / 2;
  const Mx = qa * ((x - a) * h - (h * h) / 2) + k * (((x - a) * h * h) / 2 - (h * h * h) / 3);
  return { R, Mx };
}

/**
 * Reelle Nullstellen eines Polynoms höchstens 2. Grades auf [lo, hi], aus
 * drei Funktionswerten exakt rekonstruiert (Lagrange). Q(x) ist zwischen zwei
 * Ereignisstellen genau so ein Polynom: Konstante, lineare oder Dreieckslast.
 */
function rootsOnInterval(fn: (x: number) => number, lo: number, hi: number): number[] {
  const span = hi - lo;
  if (span <= 0) return [];
  // Innen auswerten: an den Rändern sitzen Sprünge, die nicht zum Polynom gehören.
  const e = Math.min(EPS, span / 4);
  const x0 = lo + e;
  const x2 = hi - e;
  const x1 = (x0 + x2) / 2;
  const [y0, y1, y2] = [fn(x0), fn(x1), fn(x2)];
  const scale = Math.max(Math.abs(y0), Math.abs(y1), Math.abs(y2), 1e-12);

  // y = A·t² + B·t + C mit t = x − x1, Stützstellen bei t = −h, 0, +h.
  const h = x1 - x0;
  const A = (y0 - 2 * y1 + y2) / (2 * h * h);
  const B = (y2 - y0) / (2 * h);
  const C = y1;

  const ts: number[] = [];
  if (Math.abs(A) * h * h < 1e-12 * scale) {
    if (Math.abs(B) * h > 1e-12 * scale) ts.push(-C / B);
  } else {
    const disc = B * B - 4 * A * C;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      // Numerisch stabile Form, ohne Auslöschung.
      const qv = -0.5 * (B + Math.sign(B || 1) * s);
      ts.push(qv / A);
      if (qv !== 0) ts.push(C / qv);
    }
  }
  return ts.map((t) => t + x1).filter((x) => x > lo + e / 2 && x < hi - e / 2);
}

export function solveMechanics(problem: BeamProblem): SolveResult {
  const warnings: string[] = [];

  /* ── 1. Einheiten normalisieren ─────────────────────────────────────── */
  let L: number;
  let supports: { x: number; kind: SupportKind; name: string }[];
  let pointLoads: { x: number; F: number; name?: string }[];
  let udls: LinearLoad[];
  let moments: { x: number; M: number }[];
  let EI: number;

  try {
    L = measure(problem.length, "length", "Balkenlänge");
    EI = problem.EI !== undefined ? measure(problem.EI, "moment", "Biegesteifigkeit") : 1;

    supports = (problem.supports ?? []).map((s, i) => ({
      x: measure(s.x, "length", `Lager ${s.name ?? i + 1}`),
      kind: s.kind,
      name: s.name ?? String.fromCharCode(65 + i),
    }));

    pointLoads = (problem.pointLoads ?? []).map((p, i) => ({
      x: measure(p.x, "length", `Einzellast ${p.name ?? i + 1} (Lage)`),
      F: measure(p.F, "force", `Einzellast ${p.name ?? i + 1}`),
      name: p.name,
    }));

    udls = (problem.distributedLoads ?? [])
      .map((d, i) => {
        const q = measure(d.q, "lineLoad", `Streckenlast ${i + 1}`);
        return {
          from: measure(d.from, "length", `Streckenlast ${i + 1} (Beginn)`),
          to: measure(d.to, "length", `Streckenlast ${i + 1} (Ende)`),
          q,
          qEnd:
            d.qEnd !== undefined
              ? measure(d.qEnd, "lineLoad", `Streckenlast ${i + 1} (Ende)`)
              : q,
        };
      })
      .filter((d) => d.to > d.from);

    moments = (problem.pointMoments ?? []).map((m, i) => ({
      x: measure(m.x, "length", `Moment ${i + 1} (Lage)`),
      M: measure(m.M, "moment", `Moment ${i + 1}`),
    }));
  } catch (error) {
    return {
      ok: false,
      code: "INVALID_UNIT",
      error: error instanceof Error ? error.message : "Unlesbare Einheit.",
    };
  }

  /* ── 2. Geometrie prüfen ────────────────────────────────────────────── */
  if (!Number.isFinite(L) || L <= 0) {
    return { ok: false, code: "INVALID_GEOMETRY", error: "Die Balkenlänge muss größer als 0 sein." };
  }
  if (supports.length === 0) {
    return {
      ok: false,
      code: "UNSTABLE",
      error: "Der Balken hat kein Lager. Ohne Lagerung gibt es keine Auflagerkräfte.",
      hint: "Ergänze mindestens ein Festlager und ein Loslager, oder eine Einspannung.",
    };
  }
  for (const s of supports) {
    if (s.x < -1e-9 || s.x > L + 1e-9) {
      return {
        ok: false,
        code: "INVALID_GEOMETRY",
        error: `Lager ${s.name} liegt bei x = ${s.x} m, außerhalb des Balkens (0 … ${L} m).`,
      };
    }
  }
  for (const p of pointLoads) {
    if (p.x < -1e-9 || p.x > L + 1e-9) {
      return {
        ok: false,
        code: "INVALID_GEOMETRY",
        error: `Die Einzellast bei x = ${p.x} m liegt außerhalb des Balkens (0 … ${L} m).`,
      };
    }
  }
  for (const d of udls) {
    if (d.from < -1e-9 || d.to > L + 1e-9) {
      return {
        ok: false,
        code: "INVALID_GEOMETRY",
        error: `Die Streckenlast von ${d.from} m bis ${d.to} m liegt außerhalb des Balkens.`,
      };
    }
  }

  // Doppelte Lager an derselben Stelle sind fast immer ein Tippfehler.
  const sorted = [...supports].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].x - sorted[i - 1].x) < 1e-9) {
      return {
        ok: false,
        code: "INVALID_GEOMETRY",
        error: `Die Lager ${sorted[i - 1].name} und ${sorted[i].name} liegen beide bei x = ${sorted[i].x} m.`,
      };
    }
  }

  /* ── 3. Knoten setzen ───────────────────────────────────────────────── */
  // Ein Knoten an jeder Stelle, an der sich etwas ändert — sonst sitzt eine
  // Einzellast zwischen zwei Knoten und wird verschmiert statt eingeleitet.
  const nodeSet = new Set<number>([0, L]);
  for (const s of supports) nodeSet.add(s.x);
  for (const p of pointLoads) nodeSet.add(p.x);
  for (const m of moments) nodeSet.add(m.x);
  for (const d of udls) {
    nodeSet.add(d.from);
    nodeSet.add(d.to);
  }
  // Zwischenteilung für ein gut konditioniertes System.
  const base = Math.max(8, Math.min(60, Math.ceil(L * 8)));
  for (let i = 0; i <= base; i++) nodeSet.add((L * i) / base);

  const nodes = [...nodeSet]
    .filter((x) => x >= -1e-9 && x <= L + 1e-9)
    .map((x) => round(Math.min(L, Math.max(0, x)), 9))
    .sort((a, b) => a - b)
    .filter((x, i, arr) => i === 0 || x - arr[i - 1] > 1e-9);

  const nNodes = nodes.length;
  const nDof = 2 * nNodes;
  const nodeIndexAt = (x: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < nNodes; i++) {
      const d = Math.abs(nodes[i] - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  /* ── 4. Steifigkeitsmatrix und Lastvektor ───────────────────────────── */
  // DOF-Ordnung je Knoten: [w (Durchsenkung, positiv nach OBEN), φ (Neigung)].
  const K: number[][] = Array.from({ length: nDof }, () => new Array<number>(nDof).fill(0));
  const f = new Array<number>(nDof).fill(0);

  for (let e = 0; e < nNodes - 1; e++) {
    const le = nodes[e + 1] - nodes[e];
    if (le <= 0) continue;
    const c = EI / le ** 3;
    const ke = [
      [12 * c, 6 * le * c, -12 * c, 6 * le * c],
      [6 * le * c, 4 * le * le * c, -6 * le * c, 2 * le * le * c],
      [-12 * c, -6 * le * c, 12 * c, -6 * le * c],
      [6 * le * c, 2 * le * le * c, -6 * le * c, 4 * le * le * c],
    ];
    const map = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) K[map[i]][map[j]] += ke[i][j];
    }

    // Streckenlast als konsistente Knotenlasten (Hermite-Ansatz), linear
    // veränderlich von q1 (linker Knoten) nach q2 (rechter Knoten). Für
    // q1 = q2 ergibt das die bekannten q·l/2 und q·l²/12. q zeigt nach unten,
    // der Lastvektor rechnet nach oben — daher die Minuszeichen.
    let q1 = 0;
    let q2 = 0;
    const mid = (nodes[e] + nodes[e + 1]) / 2;
    for (const d of udls) {
      if (mid > d.from - 1e-12 && mid < d.to + 1e-12) {
        q1 += intensityAt(d, nodes[e]);
        q2 += intensityAt(d, nodes[e + 1]);
      }
    }

    if (q1 !== 0 || q2 !== 0) {
      f[map[0]] -= (le * (7 * q1 + 3 * q2)) / 20;
      f[map[1]] -= (le * le * (3 * q1 + 2 * q2)) / 60;
      f[map[2]] -= (le * (3 * q1 + 7 * q2)) / 20;
      f[map[3]] += (le * le * (2 * q1 + 3 * q2)) / 60;
    }
  }

  for (const p of pointLoads) f[2 * nodeIndexAt(p.x)] += -p.F;
  for (const m of moments) f[2 * nodeIndexAt(m.x) + 1] += m.M;

  /* ── 5. Randbedingungen ─────────────────────────────────────────────── */
  const fixedDof = new Set<number>();
  for (const s of supports) {
    const n = nodeIndexAt(s.x);
    fixedDof.add(2 * n); // w = 0 bei jedem Lager
    if (s.kind === "einspannung") fixedDof.add(2 * n + 1); // zusätzlich φ = 0
  }

  const freeDof: number[] = [];
  for (let i = 0; i < nDof; i++) if (!fixedDof.has(i)) freeDof.push(i);

  const Kff = freeDof.map((i) => freeDof.map((j) => K[i][j]));
  const ff = freeDof.map((i) => f[i]);

  const uFree = solveLinearSystem(Kff, ff);
  if (!uFree) {
    return {
      ok: false,
      code: "UNSTABLE",
      error:
        "Der Balken ist nicht ausreichend gelagert — das System ist verschieblich (kinematisch).",
      hint:
        supports.length === 1 && supports[0].kind !== "einspannung"
          ? `Ein einzelnes ${supports[0].kind} hält den Balken nicht: er kann sich frei drehen. Ergänze ein zweites Lager oder ersetze es durch eine Einspannung.`
          : "Prüfe, ob mindestens ein Lager die Drehung verhindert (Einspannung) oder zwei Lager vorhanden sind.",
    };
  }

  const u = new Array<number>(nDof).fill(0);
  freeDof.forEach((dof, i) => (u[dof] = uFree[i]));

  /* ── 6. Auflagerkräfte ──────────────────────────────────────────────── */
  // R = K·u − f, ausgewertet an den gehaltenen Freiheitsgraden.
  // `moment` ist hier der SPRUNG von M(x) an der Einspannung (M(x⁺) − M(x⁻)).
  // So rechnen M(x) und die Gleichgewichtskontrolle unten. Was der/die
  // Studierende als Einspannmoment liest, steht erst in `published` (§ 6b).
  const reactions: Reaction[] = supports.map((s) => {
    const n = nodeIndexAt(s.x);

    let rw = -f[2 * n];
    for (let j = 0; j < nDof; j++) rw += K[2 * n][j] * u[j];

    let rphi = 0;
    if (s.kind === "einspannung") {
      rphi = -f[2 * n + 1];
      for (let j = 0; j < nDof; j++) rphi += K[2 * n + 1][j] * u[j];
    }

    return {
      name: s.name,
      x: round(s.x, 6),
      force: round(rw, 4),
      moment: round(-rphi, 4),
    };
  });

  /* ── 6b. Einspannmoment in der Konvention von M(x) ──────────────────── */
  // Der Sprung ist am LINKEN Rand gleich M(0⁺) — aber am RECHTEN Rand gleich
  // −M(L⁻), weil M dort von M(L⁻) auf 0 springt. Ohne diese Umrechnung meldet
  // ein rechts eingespannter Balken +21,6 N·m, während M(x) dort −21,6 N·m
  // zeigt. Veröffentlicht wird daher M an der Einspannung, von der
  // Balkenseite aus gelesen: links M(0⁺), rechts M(L⁻). Innenliegende
  // Einspannungen (selten) behalten den Sprung.
  const published: Reaction[] = reactions.map((r) =>
    r.moment !== 0 && Math.abs(r.x - L) < 1e-9 ? { ...r, moment: round(-r.moment, 4) } : r,
  );

  /* ── 7. Schnittgrößen in geschlossener Form ─────────────────────────── */
  const shearAt = (x: number): number => {
    let Q = 0;
    for (const r of reactions) if (r.x <= x + 1e-12) Q += r.force;
    for (const p of pointLoads) if (p.x <= x + 1e-12) Q -= p.F;
    for (const d of udls) Q -= linearLoadLeftOf(d, x).R;
    return Q;
  };

  const momentAt = (x: number): number => {
    let M = 0;
    for (const r of reactions) {
      if (r.x <= x + 1e-12) {
        M += r.force * (x - r.x);
        M += r.moment;
      }
    }
    for (const p of pointLoads) if (p.x <= x + 1e-12) M -= p.F * (x - p.x);
    for (const d of udls) M -= linearLoadLeftOf(d, x).Mx;
    for (const m of moments) if (m.x <= x + 1e-12) M -= m.M;
    return M;
  };

  /* ── 8. Abtastung ───────────────────────────────────────────────────── */
  const samples = Math.max(20, Math.min(800, problem.samples ?? DEFAULT_SAMPLES));
  const xs = new Set<number>([0, L]);
  for (let i = 0; i <= samples; i++) xs.add((L * i) / samples);
  // An Sprungstellen beidseitig abtasten, sonst verschluckt die Kurve den Sprung.
  for (const p of pointLoads) {
    xs.add(Math.max(0, p.x - EPS));
    xs.add(Math.min(L, p.x + EPS));
  }
  for (const r of reactions) {
    xs.add(Math.max(0, r.x - EPS));
    xs.add(Math.min(L, r.x + EPS));
  }
  for (const m of moments) {
    xs.add(Math.max(0, m.x - EPS));
    xs.add(Math.min(L, m.x + EPS));
  }
  for (const d of udls) {
    xs.add(d.from);
    xs.add(d.to);
  }

  // EXAKTE Extremstellen statt Abtastung. Zwischen zwei Ereignisstellen ist
  // Q(x) ein Polynom ≤ 2. Grades, also:
  //   • M extrem, wo dM/dx = Q(x) = 0  → Nullstelle von Q,
  //   • Q extrem, wo dQ/dx = −q(x) = 0 → Nullstelle der Streckenlast
  //     (nur bei Trapezlasten mit Vorzeichenwechsel).
  // Bei einer Dreieckslast liegt M_max bei L/√3 — ein Raster aus 200 Punkten
  // trifft das nie genau.
  const events = [
    ...new Set([
      0,
      L,
      ...reactions.map((r) => r.x),
      ...pointLoads.map((p) => p.x),
      ...moments.map((m) => m.x),
      ...udls.flatMap((d) => [d.from, d.to]),
    ]),
  ]
    .filter((x) => x >= 0 && x <= L)
    .sort((a, b) => a - b);
  const loadAt = (x: number) =>
    udls.reduce((s, d) => (x >= d.from && x <= d.to ? s + intensityAt(d, x) : s), 0);
  const exactExtrema: number[] = [];
  for (let i = 0; i < events.length - 1; i++) {
    const [lo, hi] = [events[i], events[i + 1]];
    for (const x of rootsOnInterval(shearAt, lo, hi)) exactExtrema.push(x);
    for (const x of rootsOnInterval(loadAt, lo, hi)) exactExtrema.push(x);
  }
  for (const x of exactExtrema) xs.add(x);

  const grid = [...xs].filter((x) => x >= 0 && x <= L).sort((a, b) => a - b);

  const shear: Point[] = grid.map((x) => ({ x: round(x, 6), y: round(shearAt(x), 4) }));
  const moment: Point[] = grid.map((x) => ({ x: round(x, 6), y: round(momentAt(x), 4) }));

  const pickExtreme = (pts: Point[], cmp: (a: number, b: number) => boolean): Point =>
    pts.reduce((best, p) => (cmp(p.y, best.y) ? p : best), pts[0]);

  /* ── 9. Selbstkontrolle ─────────────────────────────────────────────── */
  // Das ist der Punkt, an dem ein Rechenfehler auffällt, statt als plausible
  // Zahl in die Antwort zu wandern.
  const totalLoad =
    pointLoads.reduce((s, p) => s + p.F, 0) +
    udls.reduce((s, d) => s + ((d.q + d.qEnd) / 2) * (d.to - d.from), 0);
  const totalReaction = reactions.reduce((s, r) => s + r.force, 0);
  const sumForces = totalReaction - totalLoad;

  // Momente um x = 0, im Uhrzeigersinn positiv — dieselbe Konvention wie eine
  // nach unten gerichtete Last an positivem x.
  //   • eingeprägtes Moment M₀ ist gegen den Uhrzeigersinn positiv → mit −,
  //   • ein Einspannmoment ist in der M(x)-Konvention gespeichert (Zug unten
  //     positiv), als äußeres Kräftepaar wirkt es umgekehrt → ebenfalls mit −.
  // Ohne diese beiden Vorzeichen meldet die Kontrolle Ungleichgewicht bei
  // völlig korrekt gerechneten Kragarmen.
  const loadMomentAboutOrigin =
    pointLoads.reduce((s, p) => s + p.F * p.x, 0) +
    // ∫ q(s)·s ds über die lineare Last, geschlossen.
    udls.reduce((s, d) => {
      const h = d.to - d.from;
      const k = (d.qEnd - d.q) / h;
      return s + d.q * (d.from * h + (h * h) / 2) + k * ((d.from * h * h) / 2 + (h * h * h) / 3);
    }, 0) -
    moments.reduce((s, m) => s + m.M, 0);
  const reactionMomentAboutOrigin = reactions.reduce(
    (s, r) => s + r.force * r.x - r.moment,
    0,
  );
  const sumMoments = reactionMomentAboutOrigin - loadMomentAboutOrigin;

  const scaleF = Math.max(Math.abs(totalLoad), Math.abs(totalReaction), 1);
  const scaleM = Math.max(Math.abs(loadMomentAboutOrigin), Math.abs(reactionMomentAboutOrigin), 1);
  const tolerance = 1e-6;

  if (Math.abs(sumForces) > tolerance * scaleF || Math.abs(sumMoments) > tolerance * scaleM) {
    return {
      ok: false,
      code: "NOT_IN_EQUILIBRIUM",
      error:
        `Der Balken ist nicht im Gleichgewicht: ΣV = ${round(sumForces, 3)} N, ` +
        `ΣM = ${round(sumMoments, 3)} N·m. Es fehlt eine Kraft oder ein Lager in der Angabe.`,
      hint: "Prüfe, ob alle Lasten und alle Lager der Aufgabe erfasst sind.",
    };
  }

  /* ── 10. Hinweise ───────────────────────────────────────────────────── */
  const constraintCount = supports.reduce((s, x) => s + (x.kind === "einspannung" ? 2 : 1), 0);
  const degreeOfIndeterminacy = Math.max(0, constraintCount - 2);

  if (degreeOfIndeterminacy > 0) {
    warnings.push(
      `System ${degreeOfIndeterminacy}-fach statisch unbestimmt: die Auflagerkräfte folgen ` +
        `nicht allein aus den Gleichgewichtsbedingungen, sondern zusätzlich aus der Verformung.`,
    );
  }
  if (totalLoad === 0 && moments.length === 0) {
    warnings.push("Es ist keine Last angegeben — alle Schnittgrößen sind null.");
  }

  return {
    ok: true,
    length: round(L, 6),
    degreeOfIndeterminacy,
    reactions: published,
    shear,
    moment,
    extremes: {
      shearMax: pickExtreme(shear, (a, b) => a > b),
      shearMin: pickExtreme(shear, (a, b) => a < b),
      momentMax: pickExtreme(moment, (a, b) => a > b),
      momentMin: pickExtreme(moment, (a, b) => a < b),
    },
    equilibrium: { sumForces: round(sumForces, 6), sumMoments: round(sumMoments, 6), tolerance },
    warnings,
  };
}

/**
 * Umhüllung für den Aufruf durch das Sprachmodell: fängt ALLES ab.
 * Ein unerwarteter Fehler darf nie dazu führen, dass das Modell sich seine
 * eigenen Zahlen ausdenkt — es bekommt stattdessen eine klare Absage.
 */
export function solveMechanicsSafe(problem: BeamProblem): SolveResult {
  try {
    return solveMechanics(problem);
  } catch (error) {
    console.error("[mechanics-solver] unerwarteter Fehler", error);
    return {
      ok: false,
      code: "NUMERICAL",
      error:
        "Die Angaben reichen für eine Rechnung nicht aus oder widersprechen sich. " +
        "Nenne Länge, Lager und Lasten mit Einheiten.",
    };
  }
}
