/**
 * Finanzmathematik / Investitionsrechnung — exakt und mit Probe.
 *
 *   zinseszins   K_n = K₀·(1 + i/m)^(m·n) bzw. stetig K₀·e^(i·n) ; eine der
 *                vier Größen K₀, K_n, i, n wird gesucht ; Wachstumskurve
 *   kapitalwert  C₀ = Σ CF_t / (1 + i)^t mit Abzinsungstabelle und
 *                Kapitalwertkurve C₀(i)
 *   irr          interner Zinsfuß: alle Vorzeichenwechsel von C₀(i) auf
 *                −99 % … 1000 % gesucht und per Bisektion verfeinert —
 *                mehrere IRR (nicht-konventionelle Zahlungsreihe) werden
 *                gemeldet, nicht verschwiegen. Probe: C₀(IRR) = 0
 *   annuitaet    A = K₀·q^n·(q − 1)/(q^n − 1) mit Tilgungsplan ;
 *                Probe: Restschuld nach n Jahren = 0
 *
 * Lernhilfe, keine Anlageberatung: das Ergebnis sagt es.
 */
import { z } from "zod";
import type { ChartSpec } from "../thermo-solver";
import { isNum, parseQuantity, sig, type UnitTable } from "./quantity";

export class FinanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinanceError";
  }
}
const fail = (m: string) => new FinanceError(m);

export const NO_ADVICE = "Lernhilfe zur Investitionsrechnung — keine Anlage- oder Finanzberatung.";

/* -------------------------------------------------------------------------- */
/* Zinseszins                                                                 */
/* -------------------------------------------------------------------------- */

export interface CompoundResult {
  K0: number;
  Kn: number;
  /** Nominalzins p. a. als Dezimalzahl (0,05 = 5 %). */
  i: number;
  n: number;
  /** Zinsperioden pro Jahr (1 jährlich, 12 monatlich) ; null = stetig. */
  m: number | null;
  effektivzins: number;
  gesucht: "K0" | "Kn" | "i" | "n";
  formel: string;
}

/** Genau eine von K0, Kn, i, n fehlt. m = 1 (jährlich) wenn nicht angegeben ; stetig: m = null. */
export function solveCompoundInterest(a: { K0?: number; Kn?: number; i?: number; n?: number; m?: number | null }): CompoundResult {
  const m = a.m === null ? null : (a.m ?? 1);
  if (m !== null && !(Number.isInteger(m) && m >= 1 && m <= 366)) throw fail("Zinsperioden pro Jahr m: ganze Zahl 1 … 366 (oder stetig).");
  const missing = (["K0", "Kn", "i", "n"] as const).filter((k) => !isNum(a[k]));
  if (missing.length !== 1) throw fail(`Genau DREI von K0, Kn, Zins, Laufzeit angeben (fehlend: ${missing.join(", ") || "keine"}).`);
  for (const k of ["K0", "Kn"] as const) if (isNum(a[k]) && !(a[k]! > 0)) throw fail(`${k} muss positiv sein.`);
  if (isNum(a.n) && !(a.n! >= 0)) throw fail("Die Laufzeit muss ≥ 0 sein.");
  if (isNum(a.i) && !(a.i! > -1)) throw fail("Der Zinssatz muss über −100 % liegen.");
  // Wachstumsfaktor pro Jahr und seine Umkehrung
  const g = (i: number) => (m === null ? Math.exp(i) : (1 + i / m) ** m);
  const gesucht = missing[0];
  let { K0, Kn, i, n } = a as Required<typeof a> & { K0: number; Kn: number; i: number; n: number };
  switch (gesucht) {
    case "Kn":
      Kn = K0 * g(i) ** n;
      break;
    case "K0":
      K0 = Kn / g(i) ** n;
      break;
    case "n":
      if (Kn === K0) n = 0;
      else {
        if (Math.log(g(i)) === 0) throw fail("Bei 0 % Zins wächst das Kapital nicht — die Laufzeit ist nicht bestimmt.");
        n = Math.log(Kn / K0) / Math.log(g(i));
        if (!(n >= 0)) throw fail("Mit diesem Zins wird K_n nie erreicht (negative Laufzeit).");
      }
      break;
    default: {
      if (!(n > 0)) throw fail("Für den Zinssatz braucht es eine Laufzeit n > 0.");
      const growth = (Kn / K0) ** (1 / n); // = g(i)
      i = m === null ? Math.log(growth) : m * (growth ** (1 / m) - 1);
    }
  }
  if (Math.abs(K0 * g(i) ** n - Kn) > 1e-9 * Kn) throw fail("Interne Probe K₀·q^n = K_n nicht erfüllt.");
  return {
    K0,
    Kn,
    i,
    n,
    m,
    effektivzins: g(i) - 1,
    gesucht,
    formel: m === null ? "K_n = K₀ · e^(i·n)" : m === 1 ? "K_n = K₀ · (1 + i)^n" : `K_n = K₀ · (1 + i/${m})^(${m}·n)`,
  };
}

export function compoundChart(r: CompoundResult): ChartSpec {
  const years = Math.max(1, Math.min(60, Math.ceil(r.n)));
  const g = r.m === null ? Math.exp(r.i) : (1 + r.i / r.m) ** r.m;
  const data = Array.from({ length: years + 1 }, (_, t) => ({ x: t, y: sig(r.K0 * g ** t, 6) }));
  return {
    type: "line",
    title: `Kapitalentwicklung: K₀ = ${sig(r.K0, 6)}, ${sig(r.i * 100, 4)} % p. a.`,
    xLabel: "Jahr",
    yLabel: "Kapital",
    series: [{ label: "K_t", data }],
  };
}

/* -------------------------------------------------------------------------- */
/* Kapitalwert und interner Zinsfuß                                           */
/* -------------------------------------------------------------------------- */

export const npvAt = (cf: number[], i: number) => cf.reduce((s, c, t) => s + c / (1 + i) ** t, 0);

function checkCashflows(cf: number[]) {
  if (!Array.isArray(cf) || cf.length < 2 || !cf.every(isNum)) throw fail("Zahlungsreihe: mindestens zwei Zahlen (t = 0, 1, …), Auszahlungen negativ.");
  if (cf.length > 101) throw fail("Höchstens 100 Perioden.");
}

export interface NpvResult {
  kapitalwert: number;
  i: number;
  tabelle: { t: number; zahlung: number; abzinsungsfaktor: number; barwert: number }[];
  entscheidung: string;
}

export function solveNPV(cashflows: number[], rate: number): NpvResult {
  checkCashflows(cashflows);
  if (!isNum(rate) || !(rate > -1)) throw fail("Kalkulationszins über −100 % angeben.");
  const tabelle = cashflows.map((c, t) => {
    const f = 1 / (1 + rate) ** t;
    return { t, zahlung: c, abzinsungsfaktor: f, barwert: c * f };
  });
  const kapitalwert = tabelle.reduce((s, r) => s + r.barwert, 0);
  const scale = Math.max(...cashflows.map(Math.abs));
  if (Math.abs(kapitalwert - npvAt(cashflows, rate)) > 1e-9 * scale) throw fail("Interne Probe nicht erfüllt.");
  const eps = 1e-9 * scale;
  return {
    kapitalwert,
    i: rate,
    tabelle,
    entscheidung:
      kapitalwert > eps
        ? "C₀ > 0: die Investition verzinst sich zu mehr als dem Kalkulationszins (lohnend im Sinne der Kapitalwertmethode)."
        : kapitalwert < -eps
          ? "C₀ < 0: die Verzinsung liegt unter dem Kalkulationszins (nicht lohnend im Sinne der Methode)."
          : "C₀ = 0: die Investition verzinst sich genau zum Kalkulationszins.",
  };
}

export interface IrrResult {
  irr: number[];
  /** Kapitalwert am jeweiligen IRR (Probe, ≈ 0). */
  probe: number[];
  hinweis: string;
}

/** Alle internen Zinsfüße in (−99 %, 1000 %]. */
export function solveIRR(cashflows: number[]): IrrResult {
  checkCashflows(cashflows);
  const f = (i: number) => npvAt(cashflows, i);
  const scale = cashflows.reduce((s, c) => s + Math.abs(c), 0);
  // Gitter: fein um übliche Zinsen, gröber darüber.
  const grid: number[] = [];
  for (let i = -0.99; i < 1; i += 0.0025) grid.push(Number(i.toFixed(4)));
  for (let i = 1; i <= 10; i += 0.05) grid.push(Number(i.toFixed(4)));
  const roots: number[] = [];
  for (let k = 0; k < grid.length - 1; k++) {
    let lo = grid[k];
    let hi = grid[k + 1];
    let flo = f(lo);
    const fhi = f(hi);
    if (flo === 0) {
      if (!roots.some((r) => Math.abs(r - lo) < 1e-9)) roots.push(lo);
      continue;
    }
    if (flo * fhi > 0) continue;
    for (let it = 0; it < 200 && hi - lo > 1e-15; it++) {
      const mid = (lo + hi) / 2;
      const fm = f(mid);
      if (flo * fm <= 0) hi = mid;
      else {
        lo = mid;
        flo = fm;
      }
    }
    const r = (lo + hi) / 2;
    if (!roots.some((x) => Math.abs(x - r) < 1e-9)) roots.push(r);
  }
  if (roots.length === 0) {
    const signs = new Set(cashflows.filter((c) => c !== 0).map(Math.sign));
    throw fail(
      signs.size < 2
        ? "Kein interner Zinsfuß: die Zahlungsreihe hat keinen Vorzeichenwechsel (nur Ein- oder nur Auszahlungen)."
        : "Kein interner Zinsfuß zwischen −99 % und 1000 % gefunden.",
    );
  }
  const probe = roots.map((r) => f(r));
  if (probe.some((p) => Math.abs(p) > 1e-7 * scale)) throw fail("Interne Probe C₀(IRR) = 0 nicht erfüllt.");
  const changes = cashflows.filter((c) => c !== 0).reduce((n, c, k, arr) => (k > 0 && Math.sign(c) !== Math.sign(arr[k - 1]) ? n + 1 : n), 0);
  return {
    irr: roots,
    probe,
    hinweis:
      roots.length > 1
        ? `Mehrere interne Zinsfüße (${changes} Vorzeichenwechsel, nicht-konventionelle Zahlungsreihe): der IRR ist hier NICHT eindeutig — entscheide mit dem Kapitalwert.`
        : "Eindeutiger interner Zinsfuß: C₀(IRR) = 0. Lohnend, wenn IRR > Kalkulationszins.",
  };
}

export function npvChart(cashflows: number[], marks: number[]): ChartSpec {
  const top = Math.min(10, Math.max(0.3, ...marks.map((m) => m * 2)));
  const points = 31;
  const data = Array.from({ length: points }, (_, k) => {
    const i = (top * k) / (points - 1);
    return { x: sig(i * 100, 4), y: sig(npvAt(cashflows, i), 6) };
  });
  return {
    type: "line",
    title: "Kapitalwertkurve C₀(i) — Nullstelle = interner Zinsfuß",
    xLabel: "Kalkulationszins i in %",
    yLabel: "Kapitalwert C₀",
    series: [{ label: "C₀(i)", data }],
  };
}

/* -------------------------------------------------------------------------- */
/* Annuität                                                                   */
/* -------------------------------------------------------------------------- */

export interface AnnuityResult {
  annuitaet: number;
  annuitaetenfaktor: number;
  zinsen_gesamt: number;
  tilgungsplan: { jahr: number; restschuld_anfang: number; zinsen: number; tilgung: number; annuitaet: number; restschuld_ende: number }[];
}

/** A = K₀ · q^n·(q − 1) / (q^n − 1), q = 1 + i ; bei i = 0: A = K₀/n. */
export function solveAnnuity(K0: number, i: number, n: number): AnnuityResult {
  if (!(K0 > 0)) throw fail("Darlehensbetrag K₀ > 0 angeben.");
  if (!(Number.isInteger(n) && n >= 1 && n <= 100)) throw fail("Laufzeit n: ganze Jahre 1 … 100.");
  if (!(i > -1)) throw fail("Zinssatz über −100 % angeben.");
  const q = 1 + i;
  const faktor = i === 0 ? 1 / n : (q ** n * (q - 1)) / (q ** n - 1);
  const A = K0 * faktor;
  const plan: AnnuityResult["tilgungsplan"] = [];
  let rest = K0;
  for (let t = 1; t <= n; t++) {
    const zinsen = rest * i;
    const tilgung = A - zinsen;
    const ende = rest - tilgung;
    plan.push({ jahr: t, restschuld_anfang: rest, zinsen, tilgung, annuitaet: A, restschuld_ende: ende });
    rest = ende;
  }
  if (Math.abs(rest) > 1e-8 * K0) throw fail("Interne Probe Restschuld nach n Jahren = 0 nicht erfüllt.");
  plan[plan.length - 1].restschuld_ende = 0;
  return { annuitaet: A, annuitaetenfaktor: faktor, zinsen_gesamt: A * n - K0, tilgungsplan: plan };
}

/* -------------------------------------------------------------------------- */
/* Werkzeug                                                                   */
/* -------------------------------------------------------------------------- */

const RATE: UnitTable = { "%": 0.01, "": 1, "% p.a.": 0.01, "%p.a.": 0.01 };
const YEARS: UnitTable = { a: 1, J: 1, Jahre: 1, Jahr: 1, years: 1, ans: 1, Monate: 1 / 12, months: 1 / 12, mois: 1 / 12 };
const qty = z.union([z.number(), z.string().max(40)]);
/** "5 %" → 0,05 ; ohne %-Zeichen: Zahl > 1 als Prozent (5 → 5 %), sonst Dezimalzahl (0,05 → 5 %). */
const rate = (v: number | string | undefined, what: string): number | undefined => {
  if (v === undefined || v === "") return undefined;
  const x = typeof v === "number" ? v : parseQuantity(v, RATE, what, fail);
  if (typeof v === "string" && v.includes("%")) return x;
  return x > 1 ? x / 100 : x;
};

export const financeInputSchema = z.object({
  aufgabe: z.enum(["zinseszins", "kapitalwert", "irr", "annuitaet"]),
  K0: z.number().optional().describe("zinseszins: Anfangskapital ; annuitaet: Darlehensbetrag"),
  Kn: z.number().optional().describe("zinseszins: Endkapital"),
  zins: qty.optional().describe('Zinssatz p. a., z. B. "5 %" oder 0.05'),
  laufzeit: qty.optional().describe('Jahre, z. B. 10 oder "18 Monate"'),
  perioden_pro_jahr: z.number().int().optional().describe("zinseszins: 1 jährlich (Standard), 4 quartalsweise, 12 monatlich"),
  stetig: z.boolean().optional().describe("zinseszins: stetige Verzinsung"),
  zahlungen: z.array(z.number()).max(101).optional().describe("kapitalwert, irr: Zahlungsreihe ab t = 0, Auszahlungen negativ, z. B. [-1000, 500, 400, 300]"),
});
export type FinanceInput = z.infer<typeof financeInputSchema>;

const LIMITS =
  "Abgedeckt: Zinseszins (jährlich, unterjährig, stetig ; jede der vier Größen gesucht), Kapitalwert mit " +
  "Abzinsungstabelle, interner Zinsfuß (auch mehrere), Annuität mit Tilgungsplan. NICHT abgedeckt: Steuern, " +
  "Inflation, Renten mit wechselnden Raten, Anleihen/Duration.";

export type FinanceResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

const money = (v: number) => sig(Math.round(v * 100) / 100, 12);
const pct = (v: number) => sig(v * 100, 6);

export function solveFinance(raw: FinanceInput): FinanceResult {
  try {
    const input = financeInputSchema.parse(raw);
    const n = input.laufzeit === undefined ? undefined : parseQuantity(input.laufzeit, YEARS, "Laufzeit", fail);
    const i = rate(input.zins, "Zins");
    switch (input.aufgabe) {
      case "zinseszins": {
        const r = solveCompoundInterest({ K0: input.K0, Kn: input.Kn, i, n, m: input.stetig ? null : input.perioden_pro_jahr });
        return {
          ok: true,
          gesucht: r.gesucht,
          K0: money(r.K0),
          Kn: money(r.Kn),
          zins_prozent: pct(r.i),
          effektivzins_prozent: pct(r.effektivzins),
          laufzeit_jahre: sig(r.n, 6),
          verzinsung: r.m === null ? "stetig" : r.m === 1 ? "jährlich" : `${r.m}× pro Jahr`,
          formel: r.formel,
          diagramme: [compoundChart(r)],
          hinweis: NO_ADVICE,
        };
      }
      case "kapitalwert": {
        if (!input.zahlungen) throw fail("zahlungen fehlt (ab t = 0).");
        if (i === undefined) throw fail("zins (Kalkulationszins) fehlt.");
        const r = solveNPV(input.zahlungen, i);
        let irr: number[] = [];
        try {
          irr = solveIRR(input.zahlungen).irr;
        } catch {
          /* kein IRR : die Kurve bleibt trotzdem aussagekräftig */
        }
        return {
          ok: true,
          kapitalwert: money(r.kapitalwert),
          zins_prozent: pct(r.i),
          tabelle: r.tabelle.map((t) => ({ t: t.t, zahlung: t.zahlung, abzinsungsfaktor: sig(t.abzinsungsfaktor, 6), barwert: money(t.barwert) })),
          entscheidung: r.entscheidung,
          ...(irr.length ? { interner_zinsfuss_prozent: irr.map(pct) } : {}),
          formel: "C₀ = Σ CF_t · (1 + i)^(−t)",
          diagramme: [npvChart(input.zahlungen, [i, ...irr])],
          hinweis: NO_ADVICE,
        };
      }
      case "irr": {
        if (!input.zahlungen) throw fail("zahlungen fehlt (ab t = 0).");
        const r = solveIRR(input.zahlungen);
        return {
          ok: true,
          interner_zinsfuss_prozent: r.irr.map(pct),
          probe: r.probe.map((p) => `C₀(IRR) = ${p.toExponential(2)}`),
          bewertung: r.hinweis,
          formel: "0 = Σ CF_t · (1 + IRR)^(−t)",
          diagramme: [npvChart(input.zahlungen, r.irr)],
          hinweis: NO_ADVICE,
        };
      }
      case "annuitaet": {
        if (!isNum(input.K0)) throw fail("K0 (Darlehensbetrag) fehlt.");
        if (i === undefined || n === undefined) throw fail("zins und laufzeit angeben.");
        const r = solveAnnuity(input.K0, i, n);
        return {
          ok: true,
          annuitaet: money(r.annuitaet),
          annuitaetenfaktor: sig(r.annuitaetenfaktor, 8),
          zinsen_gesamt: money(r.zinsen_gesamt),
          tilgungsplan: r.tilgungsplan.map((t) => ({
            jahr: t.jahr,
            restschuld_anfang: money(t.restschuld_anfang),
            zinsen: money(t.zinsen),
            tilgung: money(t.tilgung),
            annuitaet: money(t.annuitaet),
            restschuld_ende: money(t.restschuld_ende),
          })),
          formel: "A = K₀ · q^n·(q − 1) / (q^n − 1), q = 1 + i",
          hinweis: NO_ADVICE,
        };
      }
    }
  } catch (err) {
    if (err instanceof FinanceError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    throw err;
  }
}
