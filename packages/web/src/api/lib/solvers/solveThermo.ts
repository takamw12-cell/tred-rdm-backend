/**
 * solveThermo — Technische Thermodynamik, ideale Gase.
 *
 * Vier Aufgabentypen, die zusammen den Großteil von Thermodynamik I abdecken:
 *
 *   • zustandsaenderung  — geschlossenes System, ein oder mehrere Schritte
 *                          (isochor, isobar, isotherm, isentrop, polytrop)
 *   • kreisprozess       — dieselben Schritte, die zum Anfang zurückführen
 *                          (Otto, Diesel, Joule/Brayton, Carnot mit Gas …):
 *                          η_th bzw. Leistungszahl, Vergleich mit Carnot
 *   • carnot             — Wirkungsgrad/Leistungszahlen zwischen zwei
 *                          Reservoiren, mit Prüfung einer realen Maschine
 *                          gegen den 2. Hauptsatz (Entropieerzeugung)
 *   • stroemungsmaschine — Verdichter/Turbine, stationär, isentroper
 *                          Wirkungsgrad
 *
 * ── Vorzeichen (wie in Baehr/Kabelac und den meisten FH-Skripten) ─────────
 * Zugeführte Energie ist POSITIV.  1. HS geschlossen: Q₁₂ + W₁₂ = U₂ − U₁,
 * mit der Volumenänderungsarbeit W₁₂ = −∫p dV.  Offen, stationär:
 * q₁₂ + w_t,12 = h₂ − h₁ (kinetische/potentielle Energie vernachlässigt).
 *
 * ── Probe ──────────────────────────────────────────────────────────────────
 * Q wird je Prozess AUS SEINER EIGENEN Formel berechnet (z. B. m·c_p·ΔT bei
 * isobar) und unabhängig gegen ΔU − W geprüft; ebenso ΔH gegen Q + W_t.
 * Besteht ein Schritt die Probe nicht, gibt der Löser KEIN Ergebnis aus.
 *
 * ── Grenzen (werden ehrlich gemeldet) ─────────────────────────────────────
 * Nur ideale Gase mit konstanten Wärmekapazitäten. NICHT abgedeckt: Wasser-
 * dampf / Nassdampf (Dampftafel), Kältemittel, reale Gase, Gemische und
 * feuchte Luft, Verbrennung, instationäre offene Systeme.
 */
import { z } from "zod";

export class ThermoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThermoError";
  }
}

/* -------------------------------------------------------------------------- */
/* Stoffwerte                                                                 */
/* -------------------------------------------------------------------------- */

/** R in J/(kg·K), κ = c_p/c_v. Lehrbuchwerte, konstant angenommen. */
export const GASES = {
  luft: { R: 287, kappa: 1.4 },
  stickstoff: { R: 296.8, kappa: 1.4 },
  sauerstoff: { R: 259.8, kappa: 1.4 },
  wasserstoff: { R: 4124, kappa: 1.41 },
  helium: { R: 2077, kappa: 5 / 3 },
  argon: { R: 208.1, kappa: 5 / 3 },
  kohlendioxid: { R: 188.9, kappa: 1.3 },
  methan: { R: 518.3, kappa: 1.31 },
} as const;
export type GasName = keyof typeof GASES;

interface Gas {
  R: number;
  kappa: number;
  cv: number;
  cp: number;
  name: string;
}

function resolveGas(g: ThermoInput["gas"]): Gas {
  const preset = typeof g === "string" ? g : g?.name;
  const base = preset ? GASES[preset as GasName] : undefined;
  if (preset && !base) throw new ThermoError(`Unbekanntes Gas "${preset}".`);
  const custom = typeof g === "object" ? g : undefined;
  const R = custom?.R ?? base?.R ?? GASES.luft.R;
  let kappa = custom?.kappa ?? base?.kappa;
  if (kappa === undefined && custom?.cp) kappa = custom.cp / (custom.cp - R);
  kappa ??= GASES.luft.kappa;
  if (!(R > 0) || !(kappa > 1)) throw new ThermoError("Stoffwerte ungültig: R > 0 und κ > 1 nötig.");
  const cv = R / (kappa - 1);
  return { R, kappa, cv, cp: cv + R, name: preset ?? (custom ? "eigene Stoffwerte" : "luft") };
}

/* -------------------------------------------------------------------------- */
/* Einheiten                                                                  */
/* -------------------------------------------------------------------------- */

type Kind = "p" | "V" | "T" | "m" | "E" | "v";

const UNITS: Record<Kind, Record<string, number>> = {
  p: { pa: 1, hpa: 100, kpa: 1e3, mpa: 1e6, bar: 1e5, mbar: 100, atm: 101325 },
  V: { "m3": 1, "m^3": 1, "m³": 1, l: 1e-3, dm3: 1e-3, "dm^3": 1e-3, "dm³": 1e-3, cm3: 1e-6, "cm^3": 1e-6, "cm³": 1e-6, ml: 1e-6 },
  v: { "m3/kg": 1, "m^3/kg": 1, "m³/kg": 1, "l/kg": 1e-3, "dm3/kg": 1e-3 },
  T: { k: 1 },
  m: { kg: 1, g: 1e-3 },
  E: { j: 1, kj: 1e3, mj: 1e6, "j/kg": 1, "kj/kg": 1e3 },
};

/** "1 bar", "20 °C", "2 L", "500 kJ", 300 → SI (Pa, m³, K, kg, J). */
export function parseQty(value: number | string, kind: Kind): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ThermoError(`Ungültiger Zahlenwert: ${value}`);
    return value;
  }
  const m = /^\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(.*?)\s*$/i.exec(String(value));
  if (!m) throw new ThermoError(`Wert nicht lesbar: "${value}"`);
  const num = Number(m[1].replace(",", "."));
  const unit = m[2].toLowerCase();
  if (!unit) return num;
  if (kind === "T" && /^(°c|°|c|grad c|celsius)$/.test(unit)) return num + 273.15;
  const f = UNITS[kind][unit];
  if (f === undefined) throw new ThermoError(`Einheit "${m[2]}" passt nicht zu dieser Größe.`);
  return num * f;
}

/* -------------------------------------------------------------------------- */
/* Eingabe                                                                    */
/* -------------------------------------------------------------------------- */

const qty = z.union([z.number(), z.string().max(30)]);

const gasSchema = z
  .union([
    z.enum(Object.keys(GASES) as [GasName, ...GasName[]]),
    z.object({
      name: z.enum(Object.keys(GASES) as [GasName, ...GasName[]]).optional(),
      R: z.number().positive().optional().describe("J/(kg·K)"),
      kappa: z.number().optional(),
      cp: z.number().positive().optional().describe("J/(kg·K)"),
    }),
  ])
  .optional()
  .describe('Standard "luft" (R = 287, κ = 1,4). Eigene Werte aus dem Skript haben Vorrang.');

const stateSchema = z
  .object({
    p: qty.optional().describe('Druck, z. B. "1 bar" (Zahl = Pa)'),
    V: qty.optional().describe('Volumen, z. B. "2 L" (Zahl = m³)'),
    T: qty.optional().describe('Temperatur, z. B. "20 °C" (Zahl = K)'),
    v: qty.optional().describe("spezifisches Volumen m³/kg"),
  })
  .describe("Zwei Größen genügen; die dritte folgt aus p·V = m·R·T");

export const processSchema = z.enum(["isochor", "isobar", "isotherm", "isentrop", "polytrop"]);

const stepSchema = z.object({
  prozess: processSchema,
  n: z.number().optional().describe("Polytropenexponent (nur bei polytrop)"),
  ziel: z
    .object({
      p: qty.optional(),
      V: qty.optional(),
      T: qty.optional(),
      V_verhaeltnis: z.number().positive().optional().describe("V_nach / V_vor (Verdichtung ε=10 → 0.1)"),
      p_verhaeltnis: z.number().positive().optional().describe("p_nach / p_vor"),
      Q: qty.optional().describe('zugeführte Wärme, z. B. "500 kJ" (nur isochor/isobar/isotherm)'),
      zurueck_zum_start: z.boolean().optional().describe("Schließt den Kreisprozess"),
    })
    .describe("GENAU EINE Zielangabe"),
});

export const thermoInputSchema = z.object({
  modus: z.enum(["zustandsaenderung", "kreisprozess", "carnot", "stroemungsmaschine"]),
  gas: gasSchema,
  masse: qty.optional().describe('kg; fehlt sie und ist V unbekannt, wird spezifisch (pro kg) gerechnet'),
  start: stateSchema.optional(),
  schritte: z.array(stepSchema).max(12).optional(),
  // carnot
  T_warm: qty.optional(),
  T_kalt: qty.optional(),
  maschine: z
    .object({
      art: z.enum(["kraft", "kaelte", "waermepumpe"]),
      Q_warm: qty.optional().describe("Betrag der Wärme mit dem warmen Reservoir"),
      Q_kalt: qty.optional().describe("Betrag der Wärme mit dem kalten Reservoir"),
      W: qty.optional().describe("Betrag der Arbeit"),
    })
    .optional(),
  // stroemungsmaschine
  typ: z.enum(["verdichter", "turbine"]).optional(),
  p1: qty.optional(),
  T1: qty.optional(),
  p2: qty.optional(),
  eta_s: z.number().gt(0).max(1).optional().describe("isentroper Wirkungsgrad, Standard 1"),
  massenstrom: z.number().positive().optional().describe("kg/s"),
});

export type ThermoInput = z.infer<typeof thermoInputSchema>;

/* -------------------------------------------------------------------------- */
/* Ausgabe                                                                    */
/* -------------------------------------------------------------------------- */

const sig = (v: number, s = 8) => {
  if (!Number.isFinite(v) || v === 0) return v;
  const r = Number(v.toPrecision(s));
  return Object.is(r, -0) ? 0 : r;
};

export interface StateOut {
  nr: number;
  p: number;
  p_bar: number;
  V: number;
  T: number;
  T_celsius: number;
}

export interface StepOut {
  von: number;
  nach: number;
  prozess: string;
  n?: number;
  /** Alle Energien in J (bzw. J/kg, wenn spezifisch), zugeführt positiv. */
  Q: number;
  W_V: number;
  W_t: number;
  dU: number;
  dH: number;
  dS: number;
}

const LIMITS =
  "Abgedeckt: ideale Gase mit konstanten Wärmekapazitäten (Zustandsänderungen, " +
  "Kreisprozesse, Carnot/2. Hauptsatz, Verdichter/Turbine). NICHT abgedeckt: " +
  "Wasserdampf/Nassdampf (Dampftafel), Kältemittel, reale Gase, Gemische, feuchte Luft, Verbrennung.";

const CONVENTION =
  "Zugeführt positiv. Geschlossen: Q + W_V = ΔU mit W_V = −∫p dV. Offen: Q + W_t = ΔH mit W_t = ∫V dp.";

export type ThermoResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

/* -------------------------------------------------------------------------- */
/* Zustände und Schritte                                                      */
/* -------------------------------------------------------------------------- */

interface State {
  p: number;
  V: number;
  T: number;
}

function initialState(input: ThermoInput, gas: Gas): { s: State; m: number; spezifisch: boolean } {
  const st = input.start;
  if (!st) throw new ThermoError("Anfangszustand (start) fehlt.");
  const p = st.p !== undefined ? parseQty(st.p, "p") : undefined;
  const T = st.T !== undefined ? parseQty(st.T, "T") : undefined;
  let V = st.V !== undefined ? parseQty(st.V, "V") : undefined;
  let m = input.masse !== undefined ? parseQty(input.masse, "m") : undefined;
  let spezifisch = false;

  if (st.v !== undefined) {
    if (m !== undefined) V = parseQty(st.v, "v") * m;
    else {
      V = parseQty(st.v, "v");
      m = 1;
      spezifisch = true;
    }
  }
  for (const [k, x] of [["p", p], ["V", V], ["T", T], ["Masse", m]] as const) {
    if (x !== undefined && !(x > 0)) throw new ThermoError(`${k} muss positiv sein.`);
  }
  if (T !== undefined && T < 1) throw new ThermoError("Temperatur unter 1 K — Kelvin/°C verwechselt?");

  if (m === undefined) {
    if (p !== undefined && V !== undefined && T !== undefined) m = (p * V) / (gas.R * T);
    else if (V === undefined) {
      m = 1;
      spezifisch = true;
    } else {
      throw new ThermoError("Masse fehlt: gib masse an oder alle drei Größen p, V, T.");
    }
  }
  const known = [p, V, T].filter((x) => x !== undefined).length;
  if (spezifisch && V === undefined) {
    if (p === undefined || T === undefined) throw new ThermoError("Für spezifische Rechnung p und T angeben.");
    return { s: { p, T, V: (m * gas.R * T) / p }, m, spezifisch };
  }
  if (known < 2) throw new ThermoError("Anfangszustand braucht zwei der Größen p, V, T.");
  if (known === 3) {
    const pv = p! * V!;
    const mrt = m * gas.R * T!;
    if (Math.abs(pv - mrt) > 1e-3 * mrt) {
      throw new ThermoError(
        `p·V = ${sig(pv, 5)} J ≠ m·R·T = ${sig(mrt, 5)} J: Anfangszustand überbestimmt und widersprüchlich.`,
      );
    }
  }
  return {
    s: {
      p: p ?? (m * gas.R * T!) / V!,
      V: V ?? (m * gas.R * T!) / p!,
      T: T ?? (p! * V!) / (m * gas.R),
    },
    m,
    spezifisch,
  };
}

type Step = NonNullable<ThermoInput["schritte"]>[number];

/** Effektiver Prozess: polytrop mit n = 0/1/κ/∞ wird zum Sonderfall. */
function effective(step: Step, gas: Gas): { kind: z.infer<typeof processSchema>; n: number } {
  if (step.prozess !== "polytrop") {
    const n = { isochor: Infinity, isobar: 0, isotherm: 1, isentrop: gas.kappa }[step.prozess];
    return { kind: step.prozess, n };
  }
  const n = step.n;
  if (n === undefined || !Number.isFinite(n)) throw new ThermoError("polytrop braucht den Exponenten n.");
  if (Math.abs(n) < 1e-12) return { kind: "isobar", n: 0 };
  if (Math.abs(n - 1) < 1e-12) return { kind: "isotherm", n: 1 };
  if (Math.abs(n - gas.kappa) < 1e-12) return { kind: "isentrop", n: gas.kappa };
  return { kind: "polytrop", n };
}

function nextState(prev: State, start: State, step: Step, gas: Gas, m: number): State {
  const { kind, n } = effective(step, gas);
  const z0 = step.ziel;
  const R = gas.R;
  let target = { ...z0 };

  if (z0.zurueck_zum_start) {
    // Die Größe, die sich in diesem Prozess ändert, auf den Startwert setzen;
    // die übrigen werden danach GEPRÜFT, nicht angenommen.
    target = kind === "isotherm" ? { p: start.p } : kind === "isochor" || kind === "isobar" ? { T: start.T } : { V: start.V };
  }
  const given = Object.entries(target).filter(([k, v]) => v !== undefined && k !== "zurueck_zum_start");
  if (given.length !== 1) {
    throw new ThermoError(`Schritt ${step.prozess}: genau EINE Zielangabe nötig (hat ${given.length}).`);
  }
  const [key, raw] = given[0];
  const val =
    key === "p" ? parseQty(raw as number | string, "p")
    : key === "V" ? parseQty(raw as number | string, "V")
    : key === "T" ? parseQty(raw as number | string, "T")
    : key === "Q" ? parseQty(raw as number | string, "E")
    : (raw as number);

  const fromT = (T2: number): State => {
    if (kind === "isochor") return { V: prev.V, T: T2, p: (m * R * T2) / prev.V };
    if (kind === "isobar") return { p: prev.p, T: T2, V: (m * R * T2) / prev.p };
    if (kind === "isotherm") throw new ThermoError("isotherm: Temperatur bleibt gleich — gib p oder V als Ziel an.");
    const V2 = prev.V * (prev.T / T2) ** (1 / (n - 1));
    return { T: T2, V: V2, p: (m * R * T2) / V2 };
  };
  const fromV = (V2: number): State => {
    if (kind === "isochor") throw new ThermoError("isochor: Volumen bleibt gleich — gib p oder T als Ziel an.");
    if (kind === "isobar") return fromT((prev.p * V2) / (m * R));
    if (kind === "isotherm") return { T: prev.T, V: V2, p: (m * R * prev.T) / V2 };
    return fromT(prev.T * (prev.V / V2) ** (n - 1));
  };
  const fromP = (p2: number): State => {
    if (kind === "isobar") throw new ThermoError("isobar: Druck bleibt gleich — gib V oder T als Ziel an.");
    if (kind === "isochor") return fromT((p2 * prev.V) / (m * R));
    if (kind === "isotherm") return { T: prev.T, p: p2, V: (m * R * prev.T) / p2 };
    return fromT(prev.T * (p2 / prev.p) ** ((n - 1) / n));
  };

  let next: State;
  switch (key) {
    case "T":
      next = fromT(val);
      break;
    case "V":
      next = fromV(val);
      break;
    case "p":
      next = fromP(val);
      break;
    case "V_verhaeltnis":
      next = fromV(prev.V * val);
      break;
    case "p_verhaeltnis":
      next = fromP(prev.p * val);
      break;
    case "Q":
      if (kind === "isochor") next = fromT(prev.T + val / (m * gas.cv));
      else if (kind === "isobar") next = fromT(prev.T + val / (m * gas.cp));
      else if (kind === "isotherm") next = fromV(prev.V * Math.exp(val / (m * R * prev.T)));
      else throw new ThermoError(`${kind}: Wärme als Ziel nur bei isochor, isobar oder isotherm.`);
      break;
    default:
      throw new ThermoError(`Unbekannte Zielangabe "${key}".`);
  }
  for (const k of ["p", "V", "T"] as const) {
    if (!(next[k] > 0) || !Number.isFinite(next[k])) throw new ThermoError(`Schritt ${step.prozess}: ${k} ≤ 0 — Ziel unmöglich.`);
  }
  if (z0.zurueck_zum_start) {
    const off = (["p", "V", "T"] as const).filter((k) => Math.abs(next[k] - start[k]) > 1e-6 * start[k]);
    if (off.length) {
      throw new ThermoError(
        `Der letzte Schritt (${step.prozess}) führt nicht zum Anfangszustand zurück: ` +
          `${off.join(", ")} weicht ab. Der Kreisprozess schließt so nicht.`,
      );
    }
  }
  return next;
}

function energies(a: State, b: State, step: Step, gas: Gas, m: number): Omit<StepOut, "von" | "nach"> {
  const { kind, n } = effective(step, gas);
  const R = gas.R;
  const dT = b.T - a.T;
  const dU = m * gas.cv * dT;
  const dH = m * gas.cp * dT;
  let W_V: number;
  let W_t: number;
  let Q: number;
  switch (kind) {
    case "isochor":
      W_V = 0;
      W_t = a.V * (b.p - a.p);
      Q = m * gas.cv * dT;
      break;
    case "isobar":
      W_V = -a.p * (b.V - a.V);
      W_t = 0;
      Q = m * gas.cp * dT;
      break;
    case "isotherm":
      W_V = -m * R * a.T * Math.log(b.V / a.V);
      W_t = m * R * a.T * Math.log(b.p / a.p);
      Q = m * R * a.T * Math.log(b.V / a.V);
      break;
    default:
      // isentrop (n = κ) und polytrop
      W_V = (m * R * dT) / (n - 1);
      W_t = n * W_V;
      Q = ((m * gas.cv * (n - gas.kappa)) / (n - 1)) * dT;
  }
  const dS = m * (gas.cv * Math.log(b.T / a.T) + R * Math.log(b.V / a.V));

  // Unabhängige Probe beider Hauptsatzformen.
  const scaleE = Math.max(1, Math.abs(Q), Math.abs(W_V), Math.abs(dU), Math.abs(dH));
  if (Math.abs(Q + W_V - dU) > 1e-9 * scaleE || Math.abs(Q + W_t - dH) > 1e-9 * scaleE) {
    throw new ThermoError(`Interne Probe (1. Hauptsatz) im Schritt ${step.prozess} nicht bestanden.`);
  }
  if (kind === "isentrop" && Math.abs(dS) > 1e-9 * Math.max(1, m * gas.cp)) {
    throw new ThermoError("Interne Probe: isentroper Schritt mit ΔS ≠ 0.");
  }
  return {
    prozess: kind,
    ...(kind === "polytrop" ? { n } : {}),
    Q: sig(Q),
    W_V: sig(W_V),
    W_t: sig(W_t),
    dU: sig(dU),
    dH: sig(dH),
    dS: sig(dS),
  };
}

const stateOut = (s: State, nr: number): StateOut => ({
  nr,
  p: sig(s.p),
  p_bar: sig(s.p / 1e5),
  V: sig(s.V),
  T: sig(s.T),
  T_celsius: sig(s.T - 273.15),
});

/* -------------------------------------------------------------------------- */
/* Modi                                                                       */
/* -------------------------------------------------------------------------- */

function runSteps(input: ThermoInput, closed: boolean) {
  const gas = resolveGas(input.gas);
  const { s: s1, m, spezifisch } = initialState(input, gas);
  const steps = input.schritte ?? [];
  if (steps.length === 0) throw new ThermoError("Mindestens ein Schritt nötig.");
  if (closed && steps.length < 2) throw new ThermoError("Ein Kreisprozess braucht mindestens zwei Schritte.");
  if (closed && !steps[steps.length - 1].ziel.zurueck_zum_start) {
    throw new ThermoError("Letzter Schritt eines Kreisprozesses braucht ziel.zurueck_zum_start = true.");
  }
  const states: State[] = [s1];
  const out: StepOut[] = [];
  steps.forEach((step, i) => {
    const a = states[i];
    const b = nextState(a, s1, step, gas, m);
    states.push(b);
    out.push({ von: i + 1, nach: closed && i === steps.length - 1 ? 1 : i + 2, ...energies(a, b, step, gas, m) });
  });
  const zustaende = (closed ? states.slice(0, -1) : states).map((s, i) => stateOut(s, i + 1));
  const base = {
    ok: true as const,
    stoffwerte: { gas: gas.name, R: gas.R, kappa: sig(gas.kappa), cv: sig(gas.cv), cp: sig(gas.cp) },
    masse: sig(m),
    spezifisch,
    einheiten: spezifisch
      ? "p in Pa, V in m³/kg, T in K, Energien in J/kg, ΔS in J/(kg·K)"
      : "p in Pa, V in m³, T in K, Energien in J, ΔS in J/K",
    vorzeichen: CONVENTION,
    zustaende,
    schritte: out,
  };
  if (!closed) return base;

  const Qzu = out.filter((s) => s.Q > 0).reduce((a, s) => a + s.Q, 0);
  const Qab = -out.filter((s) => s.Q < 0).reduce((a, s) => a + s.Q, 0);
  const Wnetto = -out.reduce((a, s) => a + s.W_V, 0); // abgegeben positiv
  const Tmax = Math.max(...states.map((s) => s.T));
  const Tmin = Math.min(...states.map((s) => s.T));
  const etaC = 1 - Tmin / Tmax;
  if (Math.abs(Qzu - Qab - Wnetto) > 1e-9 * Math.max(1, Qzu)) {
    throw new ThermoError("Interne Probe: Energiebilanz des Kreisprozesses (Q_zu − |Q_ab| = W) nicht erfüllt.");
  }
  const rechts = Wnetto > 0;
  const eta = rechts ? Wnetto / Qzu : undefined;
  return {
    ...base,
    kreisprozess: {
      richtung: rechts ? "rechtslaeufig (Kraftmaschine)" : "linkslaeufig (Kältemaschine/Wärmepumpe)",
      Q_zu: sig(Qzu),
      Q_ab_betrag: sig(Qab),
      W_netto_abgegeben: sig(Wnetto),
      ...(rechts
        ? { eta_th: sig(eta!) }
        : { epsilon_kaelte: sig(Qzu / -Wnetto), epsilon_waermepumpe: sig(Qab / -Wnetto) }),
      carnot_vergleich: {
        T_max: sig(Tmax),
        T_min: sig(Tmin),
        eta_carnot: sig(etaC),
        hinweis: "Carnot zwischen T_max und T_min des Prozesses — obere Schranke.",
      },
    },
  };
}

function runCarnot(input: ThermoInput) {
  if (input.T_warm === undefined || input.T_kalt === undefined) {
    throw new ThermoError("carnot braucht T_warm und T_kalt.");
  }
  const Th = parseQty(input.T_warm, "T");
  const Tc = parseQty(input.T_kalt, "T");
  if (!(Th > Tc && Tc > 0)) throw new ThermoError("Es muss T_warm > T_kalt > 0 K gelten.");
  const result: Record<string, unknown> = {
    ok: true,
    T_warm: sig(Th),
    T_kalt: sig(Tc),
    eta_carnot: sig(1 - Tc / Th),
    epsilon_kaelte_carnot: sig(Tc / (Th - Tc)),
    epsilon_waermepumpe_carnot: sig(Th / (Th - Tc)),
  };
  const mach = input.maschine;
  if (!mach) return result;

  let Qh = mach.Q_warm !== undefined ? parseQty(mach.Q_warm, "E") : undefined;
  let Qc = mach.Q_kalt !== undefined ? parseQty(mach.Q_kalt, "E") : undefined;
  let W = mach.W !== undefined ? parseQty(mach.W, "E") : undefined;
  const known = [Qh, Qc, W].filter((x) => x !== undefined).length;
  if (known < 2) throw new ThermoError("maschine braucht zwei der drei Beträge Q_warm, Q_kalt, W.");
  for (const x of [Qh, Qc, W]) if (x !== undefined && x < 0) throw new ThermoError("Beträge sind ≥ 0 anzugeben.");
  // 1. HS für jede Maschine: |Q_warm| = |Q_kalt| + |W|.
  Qh ??= Qc! + W!;
  Qc ??= Qh - W!;
  W ??= Qh - Qc;
  if (Math.abs(Qh - Qc - W) > 1e-9 * Math.max(1, Qh)) {
    throw new ThermoError("Die drei Angaben verletzen den 1. Hauptsatz: |Q_warm| ≠ |Q_kalt| + |W|.");
  }
  if (Qc < 0) throw new ThermoError("|Q_kalt| wäre negativ — Angaben widersprüchlich.");

  const Sgen = mach.art === "kraft" ? Qc / Tc - Qh / Th : Qh / Th - Qc / Tc;
  const tol = 1e-9 * Math.max(Qh / Th, 1e-30);
  const urteil =
    Sgen < -tol ? "UNMÖGLICH: verletzt den 2. Hauptsatz (S_erz < 0)"
    : Sgen <= tol ? "reversibel (Grenzfall Carnot)"
    : "möglich, irreversibel (S_erz > 0)";
  result.maschine = {
    art: mach.art,
    Q_warm: sig(Qh),
    Q_kalt: sig(Qc),
    W: sig(W),
    ...(mach.art === "kraft"
      ? { eta: sig(W / Qh), eta_carnot: result.eta_carnot }
      : mach.art === "kaelte"
        ? { epsilon: sig(Qc / W), epsilon_carnot: result.epsilon_kaelte_carnot }
        : { epsilon: sig(Qh / W), epsilon_carnot: result.epsilon_waermepumpe_carnot }),
    entropieerzeugung: sig(Sgen),
    urteil,
  };
  return result;
}

function runMachine(input: ThermoInput) {
  const gas = resolveGas(input.gas);
  if (!input.typ || input.p1 === undefined || input.T1 === undefined || input.p2 === undefined) {
    throw new ThermoError("stroemungsmaschine braucht typ, p1, T1 und p2.");
  }
  const p1 = parseQty(input.p1, "p");
  const T1 = parseQty(input.T1, "T");
  const p2 = parseQty(input.p2, "p");
  const eta = input.eta_s ?? 1;
  if (input.typ === "verdichter" && !(p2 > p1)) throw new ThermoError("Verdichter: p2 muss größer als p1 sein.");
  if (input.typ === "turbine" && !(p2 < p1)) throw new ThermoError("Turbine: p2 muss kleiner als p1 sein.");
  const T2s = T1 * (p2 / p1) ** ((gas.kappa - 1) / gas.kappa);
  const T2 = input.typ === "verdichter" ? T1 + (T2s - T1) / eta : T1 - eta * (T1 - T2s);
  const wt = gas.cp * (T2 - T1); // zugeführt positiv (Turbine: < 0)
  const ds = gas.cp * Math.log(T2 / T1) - gas.R * Math.log(p2 / p1);
  return {
    ok: true as const,
    stoffwerte: { gas: gas.name, R: gas.R, kappa: sig(gas.kappa), cp: sig(gas.cp) },
    vorzeichen: "w_t zugeführt positiv (Verdichter > 0, Turbine < 0); adiabat, Δc und Δz vernachlässigt.",
    T2s: sig(T2s),
    T2: sig(T2),
    T2_celsius: sig(T2 - 273.15),
    w_t: sig(wt),
    w_t_isentrop: sig(gas.cp * (T2s - T1)),
    ...(input.massenstrom ? { leistung: sig(input.massenstrom * wt) } : {}),
    entropie: { delta_s: sig(ds), hinweis: ds < -1e-9 ? "Δs < 0 bei adiabater Maschine — unmöglich" : "Δs ≥ 0: zulässig (adiabat, irreversibel ⇒ Δs > 0)" },
  };
}

export function solveThermo(raw: ThermoInput): ThermoResult {
  try {
    const input = thermoInputSchema.parse(raw);
    switch (input.modus) {
      case "zustandsaenderung":
        return runSteps(input, false);
      case "kreisprozess":
        return runSteps(input, true);
      case "carnot":
        return runCarnot(input) as ThermoResult;
      case "stroemungsmaschine":
        return runMachine(input);
    }
  } catch (err) {
    if (err instanceof ThermoError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) {
      return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    }
    throw err;
  }
}
