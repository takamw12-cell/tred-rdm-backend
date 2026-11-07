/**
 * Zahl mit Einheit → Basiseinheit des Lösers: "4,7 kΩ" → 4700, "250 mL" → 0,25.
 *
 * Gemeinsam für elektro-, werkstoff-, chemie- und wirtschaft-Löser; jede
 * Einheitentabelle gehört dem Löser selbst. Groß-/Kleinschreibung zählt
 * (mΩ ≠ MΩ) : zuerst exakter Treffer, sonst ein EINDEUTIGER Treffer ohne
 * Beachtung der Schreibweise ("kohm" → "kOhm"), sonst ein Fehler — lieber
 * nachfragen als um den Faktor 10⁹ danebenliegen.
 */
export type UnitTable = Record<string, number | ((v: number) => number)>;

const NUMBER = /^\s*([+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(.*?)\s*$/i;

export function parseQuantity(value: number | string, units: UnitTable, what: string, fail: (message: string) => Error): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw fail(`${what}: ungültiger Zahlenwert ${value}.`);
    return value;
  }
  const m = NUMBER.exec(String(value).replace(/[−–]/g, "-"));
  if (!m) throw fail(`${what}: Wert nicht lesbar: "${value}".`);
  const num = Number(m[1].replace(",", "."));
  const unit = m[2].replace(/\s+/g, "");
  if (!unit) return num;
  let f = units[unit];
  if (f === undefined) {
    const lower = unit.toLowerCase();
    const hits = Object.keys(units).filter((k) => k.toLowerCase() === lower);
    if (hits.length === 1) f = units[hits[0]];
  }
  if (f === undefined) {
    throw fail(`${what}: Einheit "${m[2]}" unbekannt oder unpassend. Möglich: ${Object.keys(units).filter(Boolean).slice(0, 12).join(", ")}.`);
  }
  return typeof f === "function" ? f(num) : num * f;
}

/** 10 signifikante Stellen, −0 → 0. */
export function sig(v: number, digits = 10): number {
  if (!Number.isFinite(v) || v === 0) return v;
  const r = Number(v.toPrecision(digits));
  return Object.is(r, -0) ? 0 : r;
}

/** Relative Probe: |a − b| ≤ tol · max(1, |a|, |b|). */
export function close(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

export const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
