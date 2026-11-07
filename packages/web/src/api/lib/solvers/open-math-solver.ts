/**
 * Problèmes ouverts — calculer exactement ce qui est calculable.
 *
 *   collatzSequence(n)   suite de Syracuse / 3n+1 : étapes jusqu'à 1, pic,
 *                        valeurs pour le graphique
 *   checkGoldbach(limit) tout nombre pair 4 ≤ 2k ≤ limit est-il somme de deux
 *                        premiers ? (vérification, pas une preuve)
 *   findPrimeGaps(limit) écarts entre premiers consécutifs, écarts records,
 *                        nombres premiers jumeaux
 *
 * Le 7 nov. 2026, sans ce solveur, TRED a déroulé la suite de Collatz de 27 de
 * tête : 10 655 tokens de raisonnement, premier mot après 132 s. Une suite de
 * 111 termes recopiée à la main par un modèle de langage est exactement le
 * genre de calcul où une seule erreur de recopie fausse tout le reste.
 *
 * Toujours rappelé dans le résultat : vérifier jusqu'à une borne n'est PAS
 * démontrer. Collatz et Goldbach restent des conjectures.
 */
import { z } from "zod";
import type { ChartSpec } from "../thermo-solver";

export class OpenMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenMathError";
  }
}

/* -------------------------------------------------------------------------- */
/* Collatz                                                                    */
/* -------------------------------------------------------------------------- */

/** Au-delà, on calcule encore les étapes et le pic, mais on ne garde pas toute la suite. */
export const MAX_COLLATZ_N = 10n ** 15n;
const MAX_COLLATZ_STEPS = 100_000;

export interface CollatzResult {
  n: string;
  /** Nombre d'étapes pour atteindre 1 (« temps de vol total »). */
  steps: number;
  /** Valeur maximale atteinte (« pic », « altitude »). */
  max: string;
  /** Étape où le pic est atteint. */
  maxAt: number;
  /** Étapes avant de passer sous n (« temps d'arrêt ») ; 0 pour n = 1. */
  stoppingTime: number;
  oddSteps: number;
  evenSteps: number;
  /** La suite complète, n … 1 (nombres si sûrs, sinon chaînes). */
  values: (number | string)[];
}

export function collatzSequence(n: number | bigint | string): CollatzResult {
  let x: bigint;
  try {
    x = BigInt(typeof n === "number" && !Number.isInteger(n) ? NaN : n);
  } catch {
    throw new OpenMathError("n muss eine ganze Zahl sein.");
  }
  if (x < 1n) throw new OpenMathError("Die Collatz-Folge ist für n ≥ 1 definiert.");
  if (x > MAX_COLLATZ_N) throw new OpenMathError("n ist hier auf 10^15 begrenzt.");
  const start = x;
  const seq: bigint[] = [x];
  let max = x;
  let maxAt = 0;
  let stoppingTime = start === 1n ? 0 : -1;
  let odd = 0;
  while (x !== 1n) {
    if (x % 2n === 0n) {
      x /= 2n;
    } else {
      x = 3n * x + 1n;
      odd++;
    }
    seq.push(x);
    if (x > max) {
      max = x;
      maxAt = seq.length - 1;
    }
    if (stoppingTime < 0 && x < start) stoppingTime = seq.length - 1;
    if (seq.length > MAX_COLLATZ_STEPS) throw new OpenMathError("Mehr als 100 000 Schritte — Rechnung abgebrochen.");
  }
  const steps = seq.length - 1;
  const safe = max <= BigInt(Number.MAX_SAFE_INTEGER);
  return {
    n: String(start),
    steps,
    max: String(max),
    maxAt,
    stoppingTime: Math.max(0, stoppingTime),
    oddSteps: odd,
    evenSteps: steps - odd,
    values: seq.map((v) => (safe ? Number(v) : v.toString())),
  };
}

/** Graphique de la suite : valeur en fonction de l'étape (≤ 400 points ; le pic est toujours conservé). */
export function collatzChart(r: CollatzResult, maxPoints = 400): ChartSpec {
  const all = r.values.map((v, i) => ({ x: i, y: Number(v) }));
  let data = all;
  if (all.length > maxPoints) {
    const step = Math.ceil(all.length / maxPoints);
    data = all.filter((_, i) => i % step === 0 || i === r.maxAt || i === all.length - 1);
  }
  return {
    type: "line",
    title: `Collatz-Folge für n = ${r.n}: ${r.steps} Schritte, Maximum ${r.max} (Schritt ${r.maxAt})`,
    xLabel: "Schritt",
    yLabel: "Wert",
    series: [{ label: `n = ${r.n}`, data }],
  };
}

/** Le n ≤ limit qui demande le plus d'étapes (record classique : 871 sous 1 000). */
export function collatzRecord(limit: number): { n: number; steps: number } {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000) throw new OpenMathError("Die Schranke muss zwischen 1 und 1 000 000 liegen.");
  const cache = new Map<number, number>([[1, 0]]);
  const stepsOf = (start: number): number => {
    const path: number[] = [];
    let x = start;
    while (!cache.has(x)) {
      path.push(x);
      x = x % 2 === 0 ? x / 2 : 3 * x + 1;
    }
    let s = cache.get(x)!;
    for (let i = path.length - 1; i >= 0; i--) {
      s++;
      if (path[i] <= limit) cache.set(path[i], s);
    }
    return cache.get(start) ?? s;
  };
  let best = { n: 1, steps: 0 };
  for (let k = 1; k <= limit; k++) {
    const s = stepsOf(k);
    if (s > best.steps) best = { n: k, steps: s };
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Premiers                                                                   */
/* -------------------------------------------------------------------------- */

export const MAX_SIEVE = 10_000_000;

/** Crible d'Ératosthène : isPrime[k] pour 0 ≤ k ≤ limit. */
export function sieve(limit: number): Uint8Array {
  if (!Number.isInteger(limit) || limit < 2) throw new OpenMathError("Die Schranke muss eine ganze Zahl ≥ 2 sein.");
  if (limit > MAX_SIEVE) throw new OpenMathError(`Die Schranke ist hier auf ${MAX_SIEVE.toLocaleString("de-DE")} begrenzt.`);
  const is = new Uint8Array(limit + 1).fill(1);
  is[0] = 0;
  is[1] = 0;
  for (let p = 2; p * p <= limit; p++) {
    if (is[p]) for (let m = p * p; m <= limit; m += p) is[m] = 0;
  }
  return is;
}

/* -------------------------------------------------------------------------- */
/* Goldbach                                                                   */
/* -------------------------------------------------------------------------- */

export interface GoldbachResult {
  limit: number;
  /** Nombres pairs vérifiés (4, 6, …, ≤ limit). */
  checked: number;
  verified: boolean;
  /** Premier pair sans décomposition — null tant que la conjecture tient. */
  counterexample: number | null;
  /** Le pair dont le plus petit premier p (2k = p + q) est le plus grand : le « plus difficile ». */
  hardest: { even: number; p: number; q: number } | null;
  examples: { even: number; p: number; q: number }[];
}

export function checkGoldbach(limit: number): GoldbachResult {
  if (!Number.isInteger(limit) || limit < 4) throw new OpenMathError("Die Schranke muss eine ganze Zahl ≥ 4 sein.");
  const is = sieve(limit);
  const primes: number[] = [];
  for (let k = 2; k <= limit; k++) if (is[k]) primes.push(k);
  let checked = 0;
  let hardest: GoldbachResult["hardest"] = null;
  const examples: GoldbachResult["examples"] = [];
  for (let even = 4; even <= limit; even += 2) {
    checked++;
    let found: { p: number; q: number } | null = null;
    for (const p of primes) {
      if (p > even / 2) break;
      if (is[even - p]) {
        found = { p, q: even - p };
        break;
      }
    }
    if (!found) return { limit, checked, verified: false, counterexample: even, hardest, examples };
    if (!hardest || found.p > hardest.p) hardest = { even, ...found };
    if (even <= 20 || even === limit - (limit % 2)) examples.push({ even, ...found });
  }
  return { limit, checked, verified: true, counterexample: null, hardest, examples };
}

/** Toutes les décompositions 2k = p + q avec p ≤ q premiers. */
export function goldbachPartitions(even: number): { p: number; q: number }[] {
  if (!Number.isInteger(even) || even < 4 || even % 2 !== 0) throw new OpenMathError("Es braucht eine gerade Zahl ≥ 4.");
  const is = sieve(even);
  const out: { p: number; q: number }[] = [];
  for (let p = 2; p <= even / 2; p++) if (is[p] && is[even - p]) out.push({ p, q: even - p });
  return out;
}

/* -------------------------------------------------------------------------- */
/* Écarts entre premiers                                                      */
/* -------------------------------------------------------------------------- */

export interface PrimeGapsResult {
  limit: number;
  primeCount: number;
  /** Écarts records : chaque fois qu'un écart dépasse tous les précédents. */
  recordGaps: { gap: number; after: number; next: number }[];
  maxGap: { gap: number; after: number; next: number } | null;
  averageGap: number;
  twinPrimePairs: number;
  /** Fréquence de chaque écart (2 → nombre de jumeaux, 4 → cousins…). */
  gapCounts: Record<string, number>;
}

export function findPrimeGaps(limit: number): PrimeGapsResult {
  const is = sieve(limit);
  let prev = -1;
  let count = 0;
  let twins = 0;
  let best = 0;
  const records: PrimeGapsResult["recordGaps"] = [];
  const counts: Record<string, number> = {};
  for (let k = 2; k <= limit; k++) {
    if (!is[k]) continue;
    count++;
    if (prev > 0) {
      const gap = k - prev;
      counts[gap] = (counts[gap] ?? 0) + 1;
      if (gap === 2) twins++;
      if (gap > best) {
        best = gap;
        records.push({ gap, after: prev, next: k });
      }
    }
    prev = k;
  }
  return {
    limit,
    primeCount: count,
    recordGaps: records,
    maxGap: records.length ? records[records.length - 1] : null,
    averageGap: count > 1 ? (prev - 2) / (count - 1) : 0,
    twinPrimePairs: twins,
    gapCounts: counts,
  };
}

/* -------------------------------------------------------------------------- */
/* Outil                                                                      */
/* -------------------------------------------------------------------------- */

export const openMathInputSchema = z.object({
  aufgabe: z.enum(["collatz", "collatz_rekord", "goldbach", "goldbach_zerlegungen", "primzahlluecken"]),
  n: z
    .union([z.number().int(), z.string().regex(/^\d{1,16}$/)])
    .optional()
    .describe("collatz: Startwert; goldbach_zerlegungen: die gerade Zahl"),
  grenze: z.number().int().optional().describe("collatz_rekord, goldbach, primzahlluecken: obere Schranke (≤ 10 000 000; collatz_rekord ≤ 1 000 000)"),
});
export type OpenMathInput = z.infer<typeof openMathInputSchema>;

const LIMITS =
  "Abgedeckt: Collatz-Folge (n ≤ 10^15), längste Folge bis zu einer Schranke (≤ 10^6), Goldbach-Prüfung " +
  "und -Zerlegungen (≤ 10^7), Primzahllücken und Primzahlzwillinge (≤ 10^7). Eine Prüfung bis zu einer Schranke " +
  "ist KEIN Beweis.";
const NOT_A_PROOF = "Numerische Prüfung bis zu einer Schranke — KEIN Beweis. Die Vermutung ist offen.";

export type OpenMathResult = { ok: true; [key: string]: unknown } | { ok: false; fehler: string; hinweis: string };

function need<T>(v: T | undefined, name: string): T {
  if (v === undefined) throw new OpenMathError(`${name} fehlt.`);
  return v;
}

export function solveOpenMath(raw: OpenMathInput): OpenMathResult {
  try {
    const input = openMathInputSchema.parse(raw);
    switch (input.aufgabe) {
      case "collatz": {
        const r = collatzSequence(need(input.n, "n"));
        // Die vollständige Folge nur, wenn sie kurz genug ist, um sie zu zeigen.
        const shown = r.values.length <= 200 ? r.values : [...r.values.slice(0, 40), "…", ...r.values.slice(-20)];
        return {
          ok: true,
          n: r.n,
          schritte: r.steps,
          maximum: r.max,
          maximum_bei_schritt: r.maxAt,
          stoppzeit: r.stoppingTime,
          ungerade_schritte: r.oddSteps,
          gerade_schritte: r.evenSteps,
          folge: shown,
          regel: "n gerade → n/2; n ungerade → 3n + 1; bis 1",
          hinweis: "Dass JEDE Startzahl bei 1 ankommt, ist die unbewiesene Collatz-Vermutung.",
          diagramme: [collatzChart(r)],
        };
      }
      case "collatz_rekord": {
        const g = need(input.grenze, "grenze");
        const r = collatzRecord(g);
        return { ok: true, grenze: g, n: r.n, schritte: r.steps, hinweis: NOT_A_PROOF };
      }
      case "goldbach": {
        const r = checkGoldbach(need(input.grenze, "grenze"));
        return {
          ok: true,
          grenze: r.limit,
          geprueft: r.checked,
          bestaetigt: r.verified,
          gegenbeispiel: r.counterexample,
          schwierigster_fall: r.hardest,
          beispiele: r.examples,
          hinweis: NOT_A_PROOF,
        };
      }
      case "goldbach_zerlegungen": {
        const even = Number(need(input.n, "n"));
        const parts = goldbachPartitions(even);
        return { ok: true, n: even, anzahl: parts.length, zerlegungen: parts.slice(0, 100), hinweis: NOT_A_PROOF };
      }
      case "primzahlluecken": {
        const r = findPrimeGaps(need(input.grenze, "grenze"));
        return {
          ok: true,
          grenze: r.limit,
          anzahl_primzahlen: r.primeCount,
          rekordluecken: r.recordGaps,
          groesste_luecke: r.maxGap,
          mittlere_luecke: Number(r.averageGap.toPrecision(8)),
          primzahlzwillinge: r.twinPrimePairs,
          hinweis: "Primzahlzwillings-Vermutung (unendlich viele Paare) ist offen; die Zählung bis zur Schranke beweist nichts.",
        };
      }
    }
  } catch (err) {
    if (err instanceof OpenMathError) return { ok: false, fehler: err.message, hinweis: LIMITS };
    if (err instanceof z.ZodError) return { ok: false, fehler: `Eingabe ungültig: ${err.issues[0]?.message ?? "?"}`, hinweis: LIMITS };
    throw err;
  }
}
