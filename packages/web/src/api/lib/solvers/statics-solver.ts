import { z } from "zod";

/**
 * Technische Mechanik 1 (Statik) — Fachlöser, jedes Ergebnis mit Probe.
 *
 *   fachwerk          Stabkräfte nach dem Knotenpunktverfahren (alle
 *                     Knotengleichgewichte als ein lineares System), Lager-
 *                     reaktionen, Nullstäbe, eine Reihenfolge der Knoten für
 *                     die Handrechnung — optional ein Ritterschnitt mit
 *                     Ritterpunkten und Momentengleichungen.
 *   reibung           Körper auf der schiefen Ebene (Haften / Gleiten nach
 *                     Coulomb): Normalkraft, nötige Haftkraft, Haftgrenze,
 *                     Bereich der haltenden Kraft, Beschleunigung beim Gleiten.
 *   kraeftesystem     Ebenes Kraftsystem: Resultierende, Moment, Wirkungslinie;
 *                     mit bis zu drei Unbekannten (bekannte Wirkungslinie)
 *                     das Gleichgewicht eines starren Körpers.
 *
 * Balken (Q- und M-Verlauf) rechnet weiterhin `balkenstatik` (lib/beam*.ts).
 *
 * Vorzeichen: x nach rechts, y nach oben, Winkel in Grad gegen den
 * Uhrzeigersinn ab der x-Achse, Momente gegen den Uhrzeigersinn positiv,
 * Stabkräfte als Zug positiv. Einheiten werden NICHT umgerechnet: Kräfte und
 * Längen kommen in der Einheit der Aufgabe zurück.
 */

export class StaticsError extends Error {}

const LIMITS =
  "Abgedeckt: ebene, statisch bestimmte Fachwerke (Knotenpunktverfahren, Ritterschnitt), " +
  "Haften und Gleiten auf der schiefen Ebene (Coulomb), ebene Kraftsysteme und " +
  "Gleichgewicht eines starren Körpers mit bis zu 3 unbekannten Kräften. Balken: Werkzeug " +
  '"balkenstatik". NICHT abgedeckt: räumliche Fachwerke, statisch unbestimmte Fachwerke, ' +
  "Seilreibung (Euler-Eytelwein), Schwerpunkt, Mehrkörpersysteme mit Gelenken.";

const EPS = 1e-9;
const MAX_NODES = 40;

const num = z.number().finite();
const name = z.string().min(1).max(12);

const fachwerkSchema = z.object({
  knoten: z
    .array(z.object({ name, x: num, y: num }))
    .min(2)
    .max(MAX_NODES)
    .describe("Knoten mit Koordinaten (y nach oben)"),
  staebe: z
    .array(z.object({ name, von: name, nach: name }))
    .min(1)
    .max(80)
    .describe("Stäbe zwischen zwei Knoten"),
  lager: z
    .array(
      z.object({
        knoten: name,
        art: z.enum(["fest", "los"]).describe("fest = Festlager (Ax, Ay); los = Loslager (eine Kraft)"),
        richtung_grad: num
          .optional()
          .describe("Nur Loslager: Wirkungslinie der Lagerkraft, Standard 90 (senkrecht)"),
      }),
    )
    .min(1)
    .max(6),
  lasten: z
    .array(
      z.object({
        knoten: name,
        fx: num.optional(),
        fy: num.optional().describe("nach oben positiv: eine Gewichtslast ist negativ"),
        betrag: num.optional(),
        winkel_grad: num.optional().describe("mit betrag: Richtung, 270 = senkrecht nach unten"),
      }),
    )
    .max(40)
    .default([]),
  ritterschnitt: z
    .object({
      staebe: z.array(name).length(3).describe("die drei geschnittenen Stäbe"),
      seite: z.array(name).min(1).describe("Knoten des Teils, der freigeschnitten betrachtet wird"),
    })
    .optional(),
});

const reibungSchema = z.object({
  masse_kg: num.positive().optional(),
  gewicht: num.positive().optional().describe("Gewichtskraft G in der Krafteinheit (statt masse_kg)"),
  winkel_grad: num.min(0).max(89.9).describe("Neigung der Ebene α"),
  mu_haft: num.min(0).describe("Haftreibungszahl μ0"),
  mu_gleit: num.min(0).optional().describe("Gleitreibungszahl μ (für Beschleunigung beim Gleiten)"),
  kraft: z
    .object({
      betrag: num.min(0),
      richtung: z
        .enum(["parallel_hoch", "parallel_runter", "horizontal", "winkel"])
        .describe("horizontal = waagerecht in Richtung Hang gedrückt"),
      winkel_zur_ebene_grad: num
        .optional()
        .describe("nur bei richtung winkel: gegen die Ebene hangaufwärts gemessen, positiv von der Ebene weg"),
    })
    .optional()
    .describe("äußere Kraft auf den Körper (ohne: nur Eigengewicht)"),
  g: num.positive().optional().describe("Standard 9.81 m/s²"),
});

const kraftSchema = z.object({
  name,
  fx: num.optional(),
  fy: num.optional(),
  betrag: num.optional(),
  winkel_grad: num.optional(),
  x: num.optional().describe("Angriffspunkt (für Momente)"),
  y: num.optional(),
});

const kraeftesystemSchema = z.object({
  kraefte: z.array(kraftSchema).max(30).default([]),
  momente: z
    .array(z.object({ name, wert: num.describe("gegen den Uhrzeigersinn positiv") }))
    .max(10)
    .default([]),
  bezugspunkt: z.object({ x: num, y: num }).optional().describe("für das resultierende Moment, Standard (0,0)"),
  unbekannte: z
    .array(
      z.object({
        name,
        x: num,
        y: num,
        winkel_grad: num.describe("Wirkungslinie, z. B. 0 für Ax, 90 für Ay"),
      }),
    )
    .max(3)
    .optional()
    .describe("Lagerkräfte mit bekannter Wirkungslinie, Betrag gesucht (Gleichgewicht)"),
});

export const staticsInputSchema = z.object({
  aufgabe: z.enum(["fachwerk", "reibung", "kraeftesystem"]),
  einheiten: z
    .object({ kraft: z.string().max(6).optional(), laenge: z.string().max(4).optional() })
    .optional()
    .describe('nur Beschriftung, z. B. {"kraft": "kN", "laenge": "m"}'),
  fachwerk: fachwerkSchema.optional(),
  reibung: reibungSchema.optional(),
  kraeftesystem: kraeftesystemSchema.optional(),
});

export type StaticsInput = z.input<typeof staticsInputSchema>;
export type StaticsResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

/* ── Hilfen ────────────────────────────────────────────────────────────── */

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
/** 6 signifikante Stellen, −0 → 0. */
export function round(v: number): number {
  if (!Number.isFinite(v)) return v;
  const r = Number(v.toPrecision(6));
  return Object.is(r, -0) || Math.abs(r) < 1e-12 ? 0 : r;
}

function forceOf(f: { fx?: number; fy?: number; betrag?: number; winkel_grad?: number }, what: string): [number, number] {
  if (f.betrag !== undefined) {
    if (f.winkel_grad === undefined) throw new StaticsError(`${what}: betrag ohne winkel_grad.`);
    return [f.betrag * Math.cos(rad(f.winkel_grad)), f.betrag * Math.sin(rad(f.winkel_grad))];
  }
  if (f.fx === undefined && f.fy === undefined) throw new StaticsError(`${what}: weder fx/fy noch betrag angegeben.`);
  return [f.fx ?? 0, f.fy ?? 0];
}

/**
 * Löst A·x = b (Gauß mit Spaltenpivotsuche). Gibt null zurück, wenn die
 * Matrix singulär ist — beim Fachwerk heißt das: verschieblich.
 */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  const scale = Math.max(1, ...A.flat().map(Math.abs));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < EPS * scale) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/* ── Fachwerk ──────────────────────────────────────────────────────────── */

type Fachwerk = z.infer<typeof fachwerkSchema>;

interface Unknown {
  name: string;
  kind: "stab" | "lager";
}

function fachwerk(fw: Fachwerk, kraftE: string, laengeE: string) {
  const idx = new Map<string, number>();
  fw.knoten.forEach((k, i) => {
    if (idx.has(k.name)) throw new StaticsError(`Knoten "${k.name}" doppelt.`);
    idx.set(k.name, i);
  });
  const node = (n: string, what: string) => {
    const i = idx.get(n);
    if (i === undefined) throw new StaticsError(`${what}: Knoten "${n}" gibt es nicht.`);
    return i;
  };
  const P = fw.knoten.map((k) => [k.x, k.y] as const);
  const k = fw.knoten.length;

  // Stäbe : Einheitsvektor von "von" nach "nach".
  const bars = fw.staebe.map((s) => {
    const a = node(s.von, `Stab ${s.name}`);
    const b = node(s.nach, `Stab ${s.name}`);
    if (a === b) throw new StaticsError(`Stab ${s.name} verbindet einen Knoten mit sich selbst.`);
    const dx = P[b][0] - P[a][0];
    const dy = P[b][1] - P[a][1];
    const L = Math.hypot(dx, dy);
    if (L < EPS) throw new StaticsError(`Stab ${s.name} hat die Länge 0.`);
    return { name: s.name, a, b, ex: dx / L, ey: dy / L, L };
  });
  const barNames = new Set<string>();
  for (const s of bars) {
    if (barNames.has(s.name)) throw new StaticsError(`Stab "${s.name}" doppelt.`);
    barNames.add(s.name);
  }

  // Lagerreaktionen : Festlager → 2 Unbekannte, Loslager → 1.
  const reactions: { name: string; node: number; ex: number; ey: number }[] = [];
  for (const l of fw.lager) {
    const i = node(l.knoten, "Lager");
    if (l.art === "fest") {
      reactions.push({ name: `${l.knoten}x`, node: i, ex: 1, ey: 0 });
      reactions.push({ name: `${l.knoten}y`, node: i, ex: 0, ey: 1 });
    } else {
      const t = rad(l.richtung_grad ?? 90);
      reactions.push({ name: `${l.knoten}${l.richtung_grad === undefined ? "y" : ""}`, node: i, ex: Math.cos(t), ey: Math.sin(t) });
    }
  }

  // Äußere Lasten je Knoten.
  const load = Array.from({ length: k }, () => [0, 0]);
  for (const f of fw.lasten) {
    const i = node(f.knoten, "Last");
    const [fx, fy] = forceOf(f, `Last an ${f.knoten}`);
    load[i][0] += fx;
    load[i][1] += fy;
  }

  const m = bars.length;
  const r = reactions.length;
  const abzaehl = `s + r = ${m} + ${r} = ${m + r}, 2·k = 2·${k} = ${2 * k}`;
  if (m + r < 2 * k) {
    throw new StaticsError(`Das Fachwerk ist beweglich (kinematisch unbestimmt): ${abzaehl}. Es fehlen ${2 * k - m - r} Stäbe oder Lagerwertigkeiten.`);
  }
  if (m + r > 2 * k) {
    throw new StaticsError(`Das Fachwerk ist ${m + r - 2 * k}-fach statisch unbestimmt (${abzaehl}). Mit Gleichgewicht allein nicht lösbar.`);
  }

  // Knotengleichgewicht : Σ (Stabkräfte auf den Knoten) + Reaktionen + Lasten = 0.
  // Zugkraft S zieht den Knoten zum Stab hin : an "a" wirkt +S·e, an "b" −S·e.
  const n = 2 * k;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  const unknowns: Unknown[] = [];
  bars.forEach((s, j) => {
    A[2 * s.a][j] += s.ex;
    A[2 * s.a + 1][j] += s.ey;
    A[2 * s.b][j] -= s.ex;
    A[2 * s.b + 1][j] -= s.ey;
    unknowns.push({ name: s.name, kind: "stab" });
  });
  reactions.forEach((re, j) => {
    A[2 * re.node][m + j] += re.ex;
    A[2 * re.node + 1][m + j] += re.ey;
    unknowns.push({ name: re.name, kind: "lager" });
  });
  for (let i = 0; i < k; i++) {
    rhs[2 * i] = -load[i][0];
    rhs[2 * i + 1] = -load[i][1];
  }
  const x = solveLinear(A, rhs);
  if (!x) {
    throw new StaticsError(
      `Abzählkriterium erfüllt (${abzaehl}), aber das Gleichungssystem ist singulär: ` +
        "das Fachwerk ist verschieblich (Ausnahmefachwerk) oder falsch gelagert.",
    );
  }

  const maxS = Math.max(1, ...x.slice(0, m).map(Math.abs), ...load.flat().map(Math.abs));
  const tol = 1e-7 * maxS;
  const staebe = bars.map((s, j) => {
    const v = Math.abs(x[j]) < tol ? 0 : x[j];
    return {
      stab: s.name,
      zwischen: `${fw.knoten[s.a].name}–${fw.knoten[s.b].name}`,
      laenge: round(s.L),
      kraft: round(v),
      art: v === 0 ? "Nullstab" : v > 0 ? "Zug" : "Druck",
    };
  });
  const lagerkraefte = reactions.map((re, j) => {
    const v = Math.abs(x[m + j]) < tol ? 0 : x[m + j];
    return { name: re.name, wert: round(v), richtung_grad: round(deg(Math.atan2(re.ey, re.ex))) };
  });

  // Probe : globales Gleichgewicht aus Lasten und Reaktionen (unabhängig vom
  // Knotensystem gerechnet).
  let sx = 0;
  let sy = 0;
  let sm = 0;
  for (let i = 0; i < k; i++) {
    sx += load[i][0];
    sy += load[i][1];
    sm += P[i][0] * load[i][1] - P[i][1] * load[i][0];
  }
  reactions.forEach((re, j) => {
    const fx = x[m + j] * re.ex;
    const fy = x[m + j] * re.ey;
    sx += fx;
    sy += fy;
    sm += P[re.node][0] * fy - P[re.node][1] * fx;
  });
  const probe = {
    "ΣFx": round(sx),
    "ΣFy": round(sy),
    "ΣM_(0,0)": round(sm),
    erfuellt: Math.abs(sx) < tol * 10 && Math.abs(sy) < tol * 10 && Math.abs(sm) < tol * 10 * Math.max(1, ...P.flat().map(Math.abs)),
  };

  // Reihenfolge für die Handrechnung : immer ein Knoten mit höchstens zwei
  // unbekannten Stabkräften (Lagerkräfte vorher aus dem Gesamtsystem).
  const known = new Set<number>();
  const done = new Set<number>();
  const reihenfolge: { knoten: string; unbekannte_staebe: string[] }[] = [];
  for (let guard = 0; guard < k; guard++) {
    let pick = -1;
    let pickUnknown: number[] = [];
    for (let i = 0; i < k; i++) {
      if (done.has(i)) continue;
      const u = bars.map((s, j) => ((s.a === i || s.b === i) && !known.has(j) ? j : -1)).filter((j) => j >= 0);
      if (u.length <= 2 && (pick < 0 || u.length > pickUnknown.length)) {
        pick = i;
        pickUnknown = u;
      }
    }
    if (pick < 0) break;
    done.add(pick);
    if (pickUnknown.length) {
      reihenfolge.push({ knoten: fw.knoten[pick].name, unbekannte_staebe: pickUnknown.map((j) => bars[j].name) });
    }
    pickUnknown.forEach((j) => known.add(j));
  }

  const out: Record<string, unknown> = {
    verfahren: "Knotenpunktverfahren: an jedem Knoten ΣFx = 0 und ΣFy = 0, alle Gleichungen gemeinsam gelöst.",
    abzaehlkriterium: `${abzaehl} → statisch bestimmt`,
    vorzeichen: "Stabkräfte: Zug positiv, Druck negativ. Lagerkräfte positiv in der angegebenen Richtung.",
    einheiten: { kraft: kraftE, laenge: laengeE },
    staebe,
    nullstaebe: staebe.filter((s) => s.art === "Nullstab").map((s) => s.stab),
    lagerkraefte,
    knoten_reihenfolge: reihenfolge,
    probe,
  };

  if (fw.ritterschnitt) out.ritterschnitt = ritter(fw, bars, reactions, x, load, P, idx, tol);
  return out;
}

function ritter(
  fw: Fachwerk,
  bars: { name: string; a: number; b: number; ex: number; ey: number }[],
  reactions: { name: string; node: number; ex: number; ey: number }[],
  x: number[],
  load: number[][],
  P: (readonly [number, number])[],
  idx: Map<string, number>,
  tol: number,
) {
  const rs = fw.ritterschnitt!;
  const side = new Set(
    rs.seite.map((n) => {
      const i = idx.get(n);
      if (i === undefined) throw new StaticsError(`Ritterschnitt: Knoten "${n}" gibt es nicht.`);
      return i;
    }),
  );
  // Jeder geschnittene Stab hat genau einen Knoten auf der betrachteten Seite —
  // und kein anderer Stab darf den Schnitt kreuzen.
  const crossing = bars.filter((s) => side.has(s.a) !== side.has(s.b)).map((s) => s.name);
  const cut = rs.staebe.map((nm) => {
    const s = bars.find((b) => b.name === nm);
    if (!s) throw new StaticsError(`Ritterschnitt: Stab "${nm}" gibt es nicht.`);
    if (side.has(s.a) === side.has(s.b)) {
      throw new StaticsError(`Ritterschnitt: Stab ${nm} liegt nicht im Schnitt (beide Enden auf derselben Seite).`);
    }
    return s;
  });
  const extra = crossing.filter((c) => !rs.staebe.includes(c));
  if (extra.length) {
    throw new StaticsError(`Ritterschnitt: der Schnitt trennt auch ${extra.join(", ")} — ein Ritterschnitt darf genau 3 Stäbe schneiden.`);
  }

  // Äußere Kräfte auf das Teilsystem : Lasten + (bereits bekannte) Lagerkräfte.
  const m = bars.length;
  const ext: { px: number; py: number; fx: number; fy: number }[] = [];
  side.forEach((i) => ext.push({ px: P[i][0], py: P[i][1], fx: load[i][0], fy: load[i][1] }));
  reactions.forEach((re, j) => {
    if (side.has(re.node)) ext.push({ px: P[re.node][0], py: P[re.node][1], fx: x[m + j] * re.ex, fy: x[m + j] * re.ey });
  });

  // Wirkung des Stabes auf das Teilsystem (Zug positiv) : vom Seitenknoten weg.
  const pull = cut.map((s) => {
    const inner = side.has(s.a) ? s.a : s.b;
    const sign = inner === s.a ? 1 : -1;
    return { s, px: P[inner][0], py: P[inner][1], ux: sign * s.ex, uy: sign * s.ey };
  });

  const lineIntersect = (p: (typeof pull)[number], q: (typeof pull)[number]): [number, number] | null => {
    const det = p.ux * -q.uy - p.uy * -q.ux;
    if (Math.abs(det) < 1e-9) return null;
    const t = ((q.px - p.px) * -q.uy - (q.py - p.py) * -q.ux) / det;
    return [p.px + t * p.ux, p.py + t * p.uy];
  };

  return pull.map((own, i) => {
    const others = pull.filter((_, j) => j !== i);
    const point = lineIntersect(others[0], others[1]);
    let value: number;
    let gleichung: string;
    let ritterpunkt: { x: number; y: number } | "parallel";
    if (point) {
      const [rx, ry] = point;
      const mExt = ext.reduce((acc, f) => acc + (f.px - rx) * f.fy - (f.py - ry) * f.fx, 0);
      const arm = (own.px - rx) * own.uy - (own.py - ry) * own.ux;
      if (Math.abs(arm) < 1e-12) throw new StaticsError(`Ritterschnitt: Stab ${own.s.name} geht durch seinen eigenen Ritterpunkt.`);
      value = -mExt / arm;
      ritterpunkt = { x: round(rx), y: round(ry) };
      gleichung = `ΣM um (${round(rx)}, ${round(ry)}) = 0: ${round(arm)}·S_${own.s.name} + ${round(mExt)} = 0`;
    } else {
      // Die beiden anderen Stäbe sind parallel : Kräftegleichgewicht senkrecht zu ihnen.
      const nx = -others[0].uy;
      const ny = others[0].ux;
      const fExt = ext.reduce((acc, f) => acc + f.fx * nx + f.fy * ny, 0);
      const proj = own.ux * nx + own.uy * ny;
      value = -fExt / proj;
      ritterpunkt = "parallel";
      gleichung = `ΣF senkrecht zu ${others[0].s.name} ∥ ${others[1].s.name} = 0: ${round(proj)}·S_${own.s.name} + ${round(fExt)} = 0`;
    }
    const v = Math.abs(value) < tol ? 0 : value;
    const fromNodes = x[bars.indexOf(own.s)];
    return {
      stab: own.s.name,
      ritterpunkt,
      gleichung,
      kraft: round(v),
      art: v === 0 ? "Nullstab" : v > 0 ? "Zug" : "Druck",
      stimmt_mit_knotenverfahren: Math.abs(v - fromNodes) < tol * 10,
    };
  });
}

/* ── Reibung auf der schiefen Ebene ────────────────────────────────────── */

function reibung(rb: z.infer<typeof reibungSchema>, kraftE: string) {
  const g = rb.g ?? 9.81;
  if (rb.gewicht === undefined && rb.masse_kg === undefined) throw new StaticsError("Reibung: masse_kg oder gewicht angeben.");
  const G = rb.gewicht ?? rb.masse_kg! * g;
  const unit = rb.gewicht !== undefined ? kraftE : "N";
  const mass = rb.masse_kg ?? G / g;
  const a = rad(rb.winkel_grad);
  const mu0 = rb.mu_haft;

  // x hangaufwärts, y senkrecht von der Ebene weg. β = Winkel der Kraft gegen x.
  let F = 0;
  let beta = 0;
  if (rb.kraft) {
    F = rb.kraft.betrag;
    const r = rb.kraft.richtung;
    beta =
      r === "parallel_hoch" ? 0 : r === "parallel_runter" ? Math.PI : r === "horizontal" ? -a : rad(rb.kraft.winkel_zur_ebene_grad ?? NaN);
    if (!Number.isFinite(beta)) throw new StaticsError("Reibung: bei richtung winkel fehlt winkel_zur_ebene_grad.");
  }
  const N = G * Math.cos(a) - F * Math.sin(beta);
  if (N < 0) {
    throw new StaticsError(`Die Kraft hebt den Körper von der Ebene ab (N = ${round(N)} ${unit} < 0) — kein Reibkontakt mehr.`);
  }
  // Nötige Haftkraft, positiv hangaufwärts.
  const H = G * Math.sin(a) - F * Math.cos(beta);
  const Hmax = mu0 * N;
  const haftet = Math.abs(H) <= Hmax * (1 + 1e-12);
  const rho0 = deg(Math.atan(mu0));

  const out: Record<string, unknown> = {
    verfahren: "Freikörperbild, Koordinaten x hangaufwärts / y senkrecht zur Ebene; ΣFx = 0, ΣFy = 0; Haftbedingung |H| ≤ μ0·N (Coulomb).",
    einheit_kraft: unit,
    gewicht_G: round(G),
    hangabtrieb_G_sin_alpha: round(G * Math.sin(a)),
    normalanteil_G_cos_alpha: round(G * Math.cos(a)),
    normalkraft_N: round(N),
    noetige_haftkraft_H: round(H),
    richtung_H: Math.abs(H) < 1e-12 ? "keine" : H > 0 ? "hangaufwärts" : "hangabwärts",
    haftgrenze_mu0_N: round(Hmax),
    ausnutzung: Hmax > 0 ? round(Math.abs(H) / Hmax) : null,
    haftet,
    haftgrenzwinkel_rho0_grad: round(rho0),
    selbsthemmung_ohne_kraft: rb.winkel_grad <= rho0,
  };

  // Bereich der haltenden Kraft (in der angegebenen Richtung, sonst parallel).
  const bInt = rb.kraft ? beta : 0;
  const dMin = Math.cos(bInt) - mu0 * Math.sin(bInt);
  const dMax = Math.cos(bInt) + mu0 * Math.sin(bInt);
  const fMin = dMin > 0 ? Math.max(0, (G * (Math.sin(a) - mu0 * Math.cos(a))) / dMin) : null;
  const fMax = dMax > 0 ? (G * (Math.sin(a) + mu0 * Math.cos(a))) / dMax : null;
  const fLift = Math.sin(bInt) > 1e-12 ? (G * Math.cos(a)) / Math.sin(bInt) : null;
  out.haltebereich_kraft = {
    richtung: rb.kraft ? rb.kraft.richtung : "parallel_hoch",
    F_min: fMin === null ? "keine untere Grenze" : round(fMin),
    // Obergrenze : Rutschen hangaufwärts ODER Abheben (N = 0), was zuerst kommt.
    F_max:
      fMax === null && fLift === null
        ? "keine obere Grenze (Selbsthemmung in Schubrichtung)"
        : round(Math.min(fMax ?? Infinity, fLift ?? Infinity)),
    bedeutung: "Für F_min ≤ F ≤ F_max bleibt der Körper in Ruhe; darunter rutscht er ab, darüber wird er hochgeschoben.",
  };

  if (!haftet) {
    const mu = rb.mu_gleit ?? mu0;
    const drive = -H; // resultierende Kraft ohne Reibung, positiv hangaufwärts
    const R = mu * N;
    const net = drive - Math.sign(drive) * R;
    out.gleiten = {
      bewegung: drive > 0 ? "hangaufwärts" : "hangabwärts",
      gleitreibung_R: round(R),
      mu_verwendet: mu,
      mu_hinweis: rb.mu_gleit === undefined ? "μ (Gleiten) nicht angegeben — μ0 verwendet." : undefined,
      beschleunigung_m_s2: round(net / mass),
      masse_kg: round(mass),
    };
  }
  return out;
}

/* ── Ebenes Kraftsystem / starrer Körper ───────────────────────────────── */

function kraeftesystem(ks: z.infer<typeof kraeftesystemSchema>, kraftE: string, laengeE: string) {
  const ref = ks.bezugspunkt ?? { x: 0, y: 0 };
  const forces = ks.kraefte.map((f) => {
    const [fx, fy] = forceOf(f, `Kraft ${f.name}`);
    return { name: f.name, fx, fy, x: f.x, y: f.y };
  });
  const needPoint = (f: { name: string; x?: number; y?: number }) => {
    if (f.x === undefined || f.y === undefined) throw new StaticsError(`Kraft ${f.name}: Angriffspunkt (x, y) fehlt für die Momentenbilanz.`);
    return [f.x, f.y] as const;
  };
  const anyPoint = forces.some((f) => f.x !== undefined) || ks.momente.length > 0 || !!ks.unbekannte?.length;
  const momentOf = (fx: number, fy: number, px: number, py: number, rx: number, ry: number) => (px - rx) * fy - (py - ry) * fx;

  let Rx = 0;
  let Ry = 0;
  let M = 0;
  for (const f of forces) {
    Rx += f.fx;
    Ry += f.fy;
    if (anyPoint) {
      const [px, py] = needPoint(f);
      M += momentOf(f.fx, f.fy, px, py, ref.x, ref.y);
    }
  }
  for (const mo of ks.momente) M += mo.wert;

  const out: Record<string, unknown> = {
    einheiten: { kraft: kraftE, laenge: laengeE },
    vorzeichen: "Winkel gegen den Uhrzeigersinn ab +x, Momente gegen den Uhrzeigersinn positiv.",
  };

  if (!ks.unbekannte?.length) {
    const R = Math.hypot(Rx, Ry);
    out.resultierende = {
      Rx: round(Rx),
      Ry: round(Ry),
      betrag: round(R),
      winkel_grad: R > EPS ? round(deg(Math.atan2(Ry, Rx))) : null,
    };
    if (anyPoint) {
      out[`moment_um_(${ref.x}, ${ref.y})`] = round(M);
      if (R > EPS) {
        // Wirkungslinie : alle Punkte p mit (p − ref) × R = M.
        out.wirkungslinie = {
          abstand_vom_bezugspunkt: round(Math.abs(M) / R),
          // (x − xr)·Ry − (0 − yr)·Rx = M  →  x = xr + (M − yr·Rx) / Ry
          schnitt_x_achse: Math.abs(Ry) > EPS ? round(ref.x + (M - ref.y * Rx) / Ry) : null,
        };
      } else {
        out.reduktion = Math.abs(M) > EPS ? "Kräftepaar: resultierendes Moment ohne Resultierende" : "Gleichgewicht: R = 0 und M = 0";
      }
    }
    return out;
  }

  // Gleichgewicht : ΣFx = 0, ΣFy = 0, ΣM = 0 mit bis zu drei Unbekannten.
  const U = ks.unbekannte;
  const cols = U.map((u) => {
    const t = rad(u.winkel_grad);
    const ex = Math.cos(t);
    const ey = Math.sin(t);
    return [ex, ey, momentOf(ex, ey, u.x, u.y, ref.x, ref.y)];
  });
  const rows = [0, 1, 2].map((r) => cols.map((c) => c[r]));
  const rhs = [-Rx, -Ry, -M];
  let sol: number[] | null = null;
  if (U.length === 3) sol = solveLinear(rows, rhs);
  else {
    // Weniger als 3 Unbekannte : kleinste Quadrate, danach prüfen, ob es aufgeht.
    const AtA = U.map((_, i) => U.map((__, j) => rows.reduce((s, row) => s + row[i] * row[j], 0)));
    const Atb = U.map((_, i) => rows.reduce((s, row, r) => s + row[i] * rhs[r], 0));
    sol = solveLinear(AtA, Atb);
    if (sol) {
      const resid = rows.map((row, r) => row.reduce((s, a, i) => s + a * sol![i], 0) - rhs[r]);
      if (resid.some((v) => Math.abs(v) > 1e-7 * Math.max(1, ...rhs.map(Math.abs)))) {
        throw new StaticsError(`Mit ${U.length} Unbekannten ist kein Gleichgewicht möglich — der Körper ist beweglich.`);
      }
    }
  }
  if (!sol) {
    throw new StaticsError("Das Gleichungssystem ist singulär: die drei Wirkungslinien schneiden sich in einem Punkt oder sind parallel (Lagerung unbrauchbar).");
  }
  const tol = 1e-9 * Math.max(1, ...rhs.map(Math.abs));
  out.verfahren = "Gleichgewicht des starren Körpers: ΣFx = 0, ΣFy = 0, ΣM = 0, gemeinsam gelöst.";
  out.unbekannte = U.map((u, i) => ({
    name: u.name,
    wert: round(Math.abs(sol![i]) < tol ? 0 : sol![i]),
    hinweis: sol![i] < -tol ? "negativ: wirkt entgegen der angenommenen Richtung" : undefined,
  }));
  const chk = rows.map((row, r) => row.reduce((s, a, i) => s + a * sol![i], 0) - rhs[r]);
  out.probe = { "ΣFx": round(chk[0]), "ΣFy": round(chk[1]), "ΣM": round(chk[2]), erfuellt: chk.every((v) => Math.abs(v) < tol * 1e3) };
  return out;
}

/* ── Schnittstelle ─────────────────────────────────────────────────────── */

export function solveStatics(raw: StaticsInput): StaticsResult {
  try {
    const input = staticsInputSchema.parse(raw);
    const kraftE = input.einheiten?.kraft ?? "N";
    const laengeE = input.einheiten?.laenge ?? "m";
    let body: Record<string, unknown>;
    if (input.aufgabe === "fachwerk") {
      if (!input.fachwerk) throw new StaticsError("aufgabe fachwerk: Feld fachwerk fehlt.");
      body = fachwerk(input.fachwerk, kraftE, laengeE);
    } else if (input.aufgabe === "reibung") {
      if (!input.reibung) throw new StaticsError("aufgabe reibung: Feld reibung fehlt.");
      body = reibung(input.reibung, kraftE);
    } else {
      if (!input.kraeftesystem) throw new StaticsError("aufgabe kraeftesystem: Feld kraeftesystem fehlt.");
      body = kraeftesystem(input.kraeftesystem, kraftE, laengeE);
    }
    return { ok: true, aufgabe: input.aufgabe, ...body };
  } catch (err) {
    if (err instanceof StaticsError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      return { ok: false, fehler: `Eingabe ungültig: ${issue?.path.join(".")} ${issue?.message ?? "?"}`, hinweis: LIMITS };
    }
    throw err;
  }
}
