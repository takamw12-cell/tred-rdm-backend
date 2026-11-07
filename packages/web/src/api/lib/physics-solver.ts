/**
 * Physik — Kinematik, Wurf, 2. Newtonsches Gesetz.
 *
 * Für alle Ingenieurstudiengänge (Physik 1, Technische Mechanik 3): das
 * Modell stellt den Ansatz auf, dieser Code rechnet — wie bei den anderen
 * Fachlösern (lib/solvers). Jede Aufgabe trägt eine unabhängige Probe:
 *
 *   kinematik  v² = v0² + 2·a·s         (Zeitfreie Gleichung)
 *   wurf       ½v² = ½v0² + g·h0        (Energieerhaltung beim Aufprall)
 *   newton     ΣF − m·a = 0
 *
 * Besteht die Probe nicht, gibt der Löser KEIN Ergebnis aus.
 *
 * Grenzen (werden ehrlich gemeldet): kein Luftwiderstand, konstante
 * Beschleunigung, Massenpunkt (keine Rotation), g konstant.
 */
import { z } from "zod";
import type { ChartSpec } from "./thermo-solver";

export class PhysicsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhysicsError";
  }
}

export const G_STANDARD = 9.81;

/* -------------------------------------------------------------------------- */
/* Einheiten                                                                  */
/* -------------------------------------------------------------------------- */

type Kind = "s" | "t" | "v" | "a" | "m" | "F" | "angle";

const UNITS: Record<Kind, Record<string, number>> = {
  s: { m: 1, km: 1e3, cm: 1e-2, mm: 1e-3 },
  t: { s: 1, ms: 1e-3, min: 60, h: 3600 },
  v: { "m/s": 1, "km/h": 1 / 3.6, "kmh": 1 / 3.6, "cm/s": 1e-2 },
  a: { "m/s²": 1, "m/s^2": 1, "m/s2": 1, g: G_STANDARD },
  m: { kg: 1, g: 1e-3, t: 1e3 },
  F: { n: 1, kn: 1e3, mn: 1e-3 },
  angle: { "°": 1, grad: 1, deg: 1, rad: 180 / Math.PI },
};

/** 72 | "72 km/h" | "2,5 s" → SI (Winkel in Grad). */
export function parsePhys(value: number | string, kind: Kind): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new PhysicsError(`Ungültiger Zahlenwert: ${value}`);
    return value;
  }
  const m = /^\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(.*?)\s*$/i.exec(String(value));
  if (!m) throw new PhysicsError(`Wert nicht lesbar: "${value}"`);
  const num = Number(m[1].replace(",", "."));
  const unit = m[2].toLowerCase().replace(/\s+/g, "");
  if (!unit) return num;
  const f = UNITS[kind][unit];
  if (f === undefined) throw new PhysicsError(`Einheit "${m[2]}" passt nicht zu dieser Größe.`);
  return num * f;
}

const sig = (v: number, s = 8) => {
  if (!Number.isFinite(v) || v === 0) return v;
  const r = Number(v.toPrecision(s));
  return Object.is(r, -0) ? 0 : r;
};
const round4 = (v: number) => (v === 0 ? 0 : Number(v.toPrecision(4)));

function probe(name: string, lhs: number, rhs: number) {
  if (Math.abs(lhs - rhs) > 1e-9 * Math.max(1, Math.abs(lhs), Math.abs(rhs))) {
    throw new PhysicsError(`Interne Probe (${name}) nicht erfüllt.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Kinematik : gleichmäßig beschleunigte geradlinige Bewegung                 */
/* -------------------------------------------------------------------------- */

export interface KinematicsResult {
  t: number;
  v: number;
  s: number;
  v0: number;
  a: number;
  s0: number;
  formeln: string[];
}

/**
 * v(t) = v0 + a·t, s(t) = s0 + v0·t + ½·a·t². Gegeben sind v0 und a, dazu
 * EINE von t, v (Endgeschwindigkeit) oder s (zurückgelegter Weg ab s0).
 */
export function solveKinematics(
  v0: number,
  a: number,
  t?: number | null,
  opts: { v?: number | null; s?: number | null; s0?: number } = {},
): KinematicsResult {
  const s0 = opts.s0 ?? 0;
  const given = [t, opts.v, opts.s].filter((x) => typeof x === "number").length;
  if (given !== 1) throw new PhysicsError("Gib genau EINE von t, v (Endgeschwindigkeit) oder s (Weg) an.");
  let time: number;
  if (typeof t === "number") {
    time = t;
  } else if (typeof opts.v === "number") {
    if (a === 0) throw new PhysicsError("Mit a = 0 ändert sich v nicht — t ist aus v nicht bestimmbar.");
    time = (opts.v - v0) / a;
  } else {
    const s = opts.s as number;
    // ½a·t² + v0·t − s = 0 → kleinste nichtnegative Lösung
    if (a === 0) {
      if (v0 === 0) throw new PhysicsError("v0 = 0 und a = 0: der Körper bewegt sich nicht.");
      time = s / v0;
    } else {
      const disc = v0 * v0 + 2 * a * s;
      if (disc < 0) throw new PhysicsError("Der Weg s wird nie erreicht (der Körper kehrt vorher um).");
      const r1 = (-v0 + Math.sqrt(disc)) / a;
      const r2 = (-v0 - Math.sqrt(disc)) / a;
      const roots = [r1, r2].filter((x) => x >= -1e-12).sort((x, y) => x - y);
      if (roots.length === 0) throw new PhysicsError("Kein Zeitpunkt t ≥ 0 erreicht diesen Weg.");
      time = Math.max(0, roots[0]);
    }
  }
  if (!(time >= 0)) throw new PhysicsError(`Die Zeit wäre negativ (t = ${sig(time, 4)} s) — Angaben prüfen.`);
  const v = v0 + a * time;
  const ds = v0 * time + 0.5 * a * time * time;
  probe("v² = v0² + 2·a·s", v * v, v0 * v0 + 2 * a * ds);
  return {
    t: time,
    v,
    s: s0 + ds,
    v0,
    a,
    s0,
    formeln: ["v(t) = v0 + a·t", "s(t) = s0 + v0·t + ½·a·t²", "v² = v0² + 2·a·(s − s0)"],
  };
}

export function kinematicsCharts(r: KinematicsResult, points = 20): ChartSpec[] {
  const ts = Array.from({ length: points + 1 }, (_, i) => (r.t * i) / points);
  return [
    {
      type: "line",
      title: "Weg-Zeit-Diagramm s(t)",
      xLabel: "t [s]",
      yLabel: "s [m]",
      series: [{ label: "s(t)", data: ts.map((t) => ({ x: round4(t), y: round4(r.s0 + r.v0 * t + 0.5 * r.a * t * t) })) }],
    },
    {
      type: "line",
      title: "Geschwindigkeit-Zeit-Diagramm v(t)",
      xLabel: "t [s]",
      yLabel: "v [m/s]",
      series: [{ label: "v(t)", data: [0, r.t].map((t) => ({ x: round4(t), y: round4(r.v0 + r.a * t) })) }],
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Wurf (ohne Luftwiderstand)                                                 */
/* -------------------------------------------------------------------------- */

export interface ProjectileResult {
  v0: number;
  winkel_grad: number;
  h0: number;
  g: number;
  vx: number;
  vy0: number;
  t_steig: number;
  h_max: number;
  t_flug: number;
  wurfweite: number;
  v_aufprall: number;
  aufprallwinkel_grad: number;
}

/**
 * Schiefer Wurf ab Höhe h0 über dem Boden, Winkel gegen die Waagerechte
 * (−90° … 90°; 0° = waagerechter Wurf, 90° = senkrecht nach oben).
 */
export function solveProjectile(v0: number, angleDeg: number, h0 = 0, g = G_STANDARD): ProjectileResult {
  if (!(v0 >= 0)) throw new PhysicsError("v0 muss ≥ 0 sein.");
  if (!(angleDeg >= -90 && angleDeg <= 90)) throw new PhysicsError("Abwurfwinkel zwischen −90° und 90° angeben.");
  if (!(h0 >= 0)) throw new PhysicsError("Abwurfhöhe h0 muss ≥ 0 sein (Boden = 0).");
  if (!(g > 0)) throw new PhysicsError("g muss positiv sein.");
  if (v0 === 0 && h0 === 0) throw new PhysicsError("v0 = 0 und h0 = 0: es gibt keinen Wurf.");
  const rad = (angleDeg * Math.PI) / 180;
  const vx = Math.abs(angleDeg) === 90 ? 0 : v0 * Math.cos(rad);
  const vy0 = v0 * Math.sin(rad);
  const tUp = Math.max(0, vy0 / g);
  const hMax = h0 + (vy0 > 0 ? (vy0 * vy0) / (2 * g) : 0);
  const tFlight = (vy0 + Math.sqrt(vy0 * vy0 + 2 * g * h0)) / g;
  const vyEnd = vy0 - g * tFlight;
  const vImpact = Math.hypot(vx, vyEnd);
  probe("Energieerhaltung ½v² = ½v0² + g·h0", 0.5 * vImpact * vImpact, 0.5 * v0 * v0 + g * h0);
  return {
    v0,
    winkel_grad: angleDeg,
    h0,
    g,
    vx,
    vy0,
    t_steig: tUp,
    h_max: hMax,
    t_flug: tFlight,
    wurfweite: vx * tFlight,
    v_aufprall: vImpact,
    aufprallwinkel_grad: (Math.atan2(-vyEnd, vx) * 180) / Math.PI,
  };
}

export function projectileChart(r: ProjectileResult, points = 30): ChartSpec {
  const data = Array.from({ length: points + 1 }, (_, i) => {
    const t = (r.t_flug * i) / points;
    return { x: round4(r.vx * t), y: round4(Math.max(0, r.h0 + r.vy0 * t - 0.5 * r.g * t * t)) };
  });
  return {
    type: "line",
    title: `Wurfbahn (v0 = ${sig(r.v0, 4)} m/s, α = ${sig(r.winkel_grad, 4)}°)`,
    xLabel: "x [m]",
    yLabel: "y [m]",
    series: [{ label: "Bahn y(x)", data }],
  };
}

/* -------------------------------------------------------------------------- */
/* 2. Newtonsches Gesetz                                                      */
/* -------------------------------------------------------------------------- */

export interface NewtonResult {
  F: number;
  m: number;
  a: number;
  gesucht: "F" | "m" | "a";
}

/** F = m·a, genau eine Größe fehlt. */
export function solveNewton(F?: number | null, m?: number | null, a?: number | null): NewtonResult {
  const vals = { F, m, a };
  const missing = (Object.keys(vals) as (keyof typeof vals)[]).filter((k) => typeof vals[k] !== "number");
  if (missing.length !== 1) throw new PhysicsError("Genau EINE von F, m, a darf fehlen.");
  if (typeof m === "number" && !(m > 0)) throw new PhysicsError("Die Masse muss positiv sein.");
  let r: NewtonResult;
  switch (missing[0]) {
    case "F":
      r = { F: m! * a!, m: m!, a: a!, gesucht: "F" };
      break;
    case "a":
      r = { F: F!, m: m!, a: F! / m!, gesucht: "a" };
      break;
    default:
      if (a === 0) throw new PhysicsError("Mit a = 0 ist die Masse aus F = m·a nicht bestimmbar.");
      r = { F: F!, m: F! / a!, a: a!, gesucht: "m" };
      if (!(r.m > 0)) throw new PhysicsError("F und a haben entgegengesetzte Vorzeichen — die Masse wäre negativ.");
  }
  probe("ΣF − m·a = 0", r.F, r.m * r.a);
  return r;
}

/** Resultierende mehrerer Kräfte (Betrag, Winkel in Grad gegen die x-Achse). */
export function resultant(forces: { F: number; winkel: number }[]): { Fx: number; Fy: number; F: number; winkel: number } {
  const Fx = forces.reduce((s, f) => s + f.F * Math.cos((f.winkel * Math.PI) / 180), 0);
  const Fy = forces.reduce((s, f) => s + f.F * Math.sin((f.winkel * Math.PI) / 180), 0);
  return { Fx, Fy, F: Math.hypot(Fx, Fy), winkel: (Math.atan2(Fy, Fx) * 180) / Math.PI };
}

/* -------------------------------------------------------------------------- */
/* Werkzeug                                                                   */
/* -------------------------------------------------------------------------- */

const qty = z.union([z.number(), z.string().max(30)]);

export const physicsInputSchema = z.object({
  aufgabe: z.enum(["kinematik", "wurf", "newton"]),
  // kinematik
  v0: qty.optional().describe('Anfangsgeschwindigkeit, z. B. "72 km/h" (Zahl = m/s)'),
  a: qty.optional().describe('Beschleunigung, z. B. "-2 m/s²" (Zahl = m/s²); Bremsen negativ'),
  t: qty.optional().describe('Zeit, z. B. "4 s"'),
  v: qty.optional().describe("kinematik: Endgeschwindigkeit (statt t)"),
  s: qty.optional().describe("kinematik: zurückgelegter Weg (statt t)"),
  s0: qty.optional().describe("kinematik: Anfangsort, Standard 0"),
  // wurf
  winkel: qty.optional().describe("wurf: Abwurfwinkel gegen die Waagerechte in Grad (0 = waagerecht)"),
  h0: qty.optional().describe("wurf: Abwurfhöhe über dem Boden, Standard 0"),
  g: z.number().positive().optional().describe("Standard 9,81 m/s² (Skriptwert hat Vorrang)"),
  // newton
  F: qty.optional().describe('newton: resultierende Kraft, z. B. "1,2 kN"'),
  m: qty.optional().describe('newton: Masse, z. B. "1200 kg"'),
  kraefte: z
    .array(z.object({ F: qty, winkel: z.number().describe("Grad gegen die x-Achse") }))
    .max(12)
    .optional()
    .describe("newton: Einzelkräfte statt F — der Löser bildet die Resultierende"),
});
export type PhysicsInput = z.infer<typeof physicsInputSchema>;

const LIMITS =
  "Abgedeckt: geradlinige Bewegung mit konstanter Beschleunigung, Wurf ohne Luftwiderstand, " +
  "F = m·a für einen Massenpunkt (auch mit mehreren Einzelkräften). NICHT abgedeckt: " +
  "Luftwiderstand, veränderliche Beschleunigung, Rotation/Trägheitsmoment, Stoß, Schwingungen.";

export type PhysicsResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

const need = (v: number | string | undefined, name: string, kind: Kind) => {
  if (v === undefined) throw new PhysicsError(`${name} fehlt.`);
  return parsePhys(v, kind);
};
const opt = (v: number | string | undefined, kind: Kind) => (v === undefined ? undefined : parsePhys(v, kind));

export function solvePhysics(raw: PhysicsInput): PhysicsResult {
  try {
    const input = physicsInputSchema.parse(raw);
    if (input.aufgabe === "kinematik") {
      const r = solveKinematics(need(input.v0, "v0", "v"), need(input.a, "a", "a"), opt(input.t, "t"), {
        v: opt(input.v, "v"),
        s: opt(input.s, "s"),
        s0: opt(input.s0, "s"),
      });
      return {
        ok: true,
        t: sig(r.t),
        v: sig(r.v),
        v_kmh: sig(r.v * 3.6),
        s: sig(r.s),
        weg: sig(r.s - r.s0),
        formeln: r.formeln,
        einheiten: "t in s, v in m/s, s in m",
        diagramme: kinematicsCharts(r),
      };
    }
    if (input.aufgabe === "wurf") {
      const r = solveProjectile(need(input.v0, "v0", "v"), need(input.winkel, "winkel", "angle"), opt(input.h0, "s") ?? 0, input.g);
      return {
        ok: true,
        vx: sig(r.vx),
        vy0: sig(r.vy0),
        t_steig: sig(r.t_steig),
        h_max: sig(r.h_max),
        t_flug: sig(r.t_flug),
        wurfweite: sig(r.wurfweite),
        v_aufprall: sig(r.v_aufprall),
        aufprallwinkel_grad: sig(r.aufprallwinkel_grad),
        formeln: ["x(t) = v0·cos α·t", "y(t) = h0 + v0·sin α·t − ½·g·t²", "t_F = (v0·sin α + √((v0·sin α)² + 2·g·h0)) / g"],
        einheiten: "m, s, m/s, Grad",
        annahmen: "ohne Luftwiderstand, g = " + r.g + " m/s²",
        diagramme: [projectileChart(r)],
      };
    }
    let F = opt(input.F, "F");
    let res: ReturnType<typeof resultant> | undefined;
    if (input.kraefte?.length) {
      if (F !== undefined) throw new PhysicsError("Entweder F oder kraefte angeben, nicht beides.");
      res = resultant(input.kraefte.map((k) => ({ F: parsePhys(k.F, "F"), winkel: k.winkel })));
      F = res.F;
    }
    const r = solveNewton(F, opt(input.m, "m"), opt(input.a, "a"));
    return {
      ok: true,
      gesucht: r.gesucht,
      formel: "F = m·a",
      F: sig(r.F),
      m: sig(r.m),
      a: sig(r.a),
      ...(res ? { resultierende: { Fx: sig(res.Fx), Fy: sig(res.Fy), F: sig(res.F), winkel_grad: sig(res.winkel) } } : {}),
      einheiten: "N, kg, m/s²",
    };
  } catch (err) {
    if (err instanceof PhysicsError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) {
      return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    }
    throw err;
  }
}
