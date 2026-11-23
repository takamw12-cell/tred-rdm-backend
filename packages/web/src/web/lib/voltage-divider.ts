/**
 * Le diviseur de tension (Spannungsteiler) de l'Atelier — les calculs.
 *
 *   U ──[R1]──┬──[R2]── masse        I  = U / (R1 + R2)
 *             └ U2                   U1 = I·R1,  U2 = I·R2 = U·R2 / (R1 + R2)
 *
 * Module pur : le simulateur (components/InteractiveCircuit.tsx) l'appelle à
 * chaque mouvement de curseur, et les tests vérifient les lois (maille, nœud).
 */

export interface DividerInput {
  /** Tension de la source, en volts. */
  u: number;
  /** Résistances, en ohms (strictement positives). */
  r1: number;
  r2: number;
}

export interface DividerState extends DividerInput {
  /** Courant de la maille, en ampères. */
  i: number;
  u1: number;
  u2: number;
  /** Puissances dissipées, en watts. */
  p1: number;
  p2: number;
  /** Part de la tension sur R2 (0 à 1). */
  ratio: number;
}

export const DIVIDER_LIMITS = { u: [1, 24], r: [10, 10_000] } as const;

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function solveDivider(input: DividerInput): DividerState {
  const u = clamp(input.u, DIVIDER_LIMITS.u);
  const r1 = clamp(input.r1, DIVIDER_LIMITS.r);
  const r2 = clamp(input.r2, DIVIDER_LIMITS.r);
  const i = u / (r1 + r2);
  return { u, r1, r2, i, u1: i * r1, u2: i * r2, p1: i * i * r1, p2: i * i * r2, ratio: r2 / (r1 + r2) };
}

/**
 * Les curseurs des résistances sont logarithmiques : de 10 Ω à 10 kΩ, chaque
 * tiers de la course vaut une décade. `t` va de 0 à 1.
 */
export function sliderToOhms(t: number): number {
  const [lo, hi] = DIVIDER_LIMITS.r;
  const raw = lo * (hi / lo) ** Math.min(1, Math.max(0, t));
  // Deux chiffres significatifs : 47 Ω, 220 Ω, 4,7 kΩ — des valeurs que l'on lit.
  const mag = 10 ** (Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / mag) * mag;
}

export function ohmsToSlider(ohms: number): number {
  const [lo, hi] = DIVIDER_LIMITS.r;
  return Math.log(clamp(ohms, DIVIDER_LIMITS.r) / lo) / Math.log(hi / lo);
}

/** Un nombre à 3 chiffres significatifs, virgule ou point selon la langue. */
export function sig3(value: number, comma: boolean): string {
  const s = value === 0 ? "0" : String(Number(value.toPrecision(3)));
  return comma ? s.replace(".", ",") : s;
}

/** Une grandeur avec son préfixe (mA, kΩ, mW…) : la valeur et l'unité, séparées pour LaTeX. */
export function withPrefix(value: number, unit: string, comma: boolean): { value: string; unit: string } {
  const abs = Math.abs(value);
  const [factor, prefix] = abs >= 1000 ? [1e-3, "k"] : abs >= 1 || abs === 0 ? [1, ""] : abs >= 1e-3 ? [1e3, "m"] : [1e6, "µ"];
  return { value: sig3(value * factor, comma), unit: `${prefix}${unit}` };
}

/**
 * La vitesse des charges dessinées, en tours de maille par seconde. Le courant
 * varie de 0,05 mA à 1,2 A : une échelle logarithmique garde le mouvement
 * visible partout, et plus de courant va toujours plus vite.
 */
export function flowSpeed(i: number): number {
  const lo = Math.log10(DIVIDER_LIMITS.u[0] / (2 * DIVIDER_LIMITS.r[1]));
  const hi = Math.log10(DIVIDER_LIMITS.u[1] / (2 * DIVIDER_LIMITS.r[0]));
  const t = (Math.log10(Math.max(i, 1e-9)) - lo) / (hi - lo);
  return 0.04 + 0.5 * Math.min(1, Math.max(0, t));
}
