/**
 * Einheiten: Eingabe in beliebiger technischer Schreibweise, Rechnung in SI.
 *
 * Der häufigste Fehler in einer Aufgabe ist keine falsche Formel, sondern ein
 * Millimeter, der als Meter gerechnet wird — Faktor 1000, und das Ergebnis ist
 * unbrauchbar, ohne dass irgendetwas "kaputt" aussieht. Deshalb wird jede Zahl
 * VOR der Rechnung normalisiert und mit ihrer Einheit zurückgegeben.
 *
 * Intern gilt ausschließlich SI: Meter, Newton, Newtonmeter, Newton pro Meter,
 * Pascal.
 */

export type Quantity = "length" | "force" | "moment" | "lineLoad" | "stress" | "inertia";

export class UnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnitError";
  }
}

/** Faktor auf die SI-Einheit. */
const FACTORS: Record<Quantity, Record<string, number>> = {
  length: {
    mm: 1e-3,
    cm: 1e-2,
    dm: 1e-1,
    m: 1,
    km: 1e3,
  },
  force: {
    n: 1,
    kn: 1e3,
    mn: 1e6,
    // Kilopond kommt in älteren Aufgabensammlungen noch vor.
    kp: 9.80665,
  },
  moment: {
    nm: 1,
    "n*m": 1,
    "n·m": 1,
    knm: 1e3,
    "kn*m": 1e3,
    "kn·m": 1e3,
    nmm: 1e-3,
    "n*mm": 1e-3,
  },
  lineLoad: {
    "n/m": 1,
    "kn/m": 1e3,
    "n/mm": 1e3,
    "kn/mm": 1e6,
    "n/cm": 100,
  },
  stress: {
    pa: 1,
    kpa: 1e3,
    mpa: 1e6,
    gpa: 1e9,
    "n/mm2": 1e6,
    "n/mm^2": 1e6,
    "n/mm²": 1e6,
    "kn/cm2": 1e7,
    "kn/cm²": 1e7,
    bar: 1e5,
  },
  inertia: {
    m4: 1,
    "m^4": 1,
    "m⁴": 1,
    cm4: 1e-8,
    "cm^4": 1e-8,
    "cm⁴": 1e-8,
    mm4: 1e-12,
    "mm^4": 1e-12,
    "mm⁴": 1e-12,
  },
};

/** SI-Einheit je Größe, für die Rückgabe an den Studierenden. */
export const SI_UNIT: Record<Quantity, string> = {
  length: "m",
  force: "N",
  moment: "N·m",
  lineLoad: "N/m",
  stress: "Pa",
  inertia: "m⁴",
};

function normalizeUnitToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/²/g, "2")
    .replace(/⁴/g, "4")
    .replace(/\^/g, "");
}

/**
 * Wandelt einen Zahlenwert mit Einheit in SI um.
 *
 * Akzeptiert Zahl + Einheit getrennt oder als eine Zeichenkette
 * ("1,5 m", "12 kN", "6 kN/m"). Das Komma als Dezimaltrennzeichen wird
 * unterstützt — deutsche Aufgabenblätter schreiben 1,5 und nicht 1.5.
 */
export function toSI(value: number | string, quantity: Quantity, unit?: string): number {
  let magnitude: number;
  let unitToken = unit;

  if (typeof value === "string") {
    const text = value.trim().replace(/,/g, ".");
    const match = text.match(/^([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(.*)$/);
    if (!match) throw new UnitError(`Unlesbarer Zahlenwert: "${value}"`);
    magnitude = Number(match[1]);
    unitToken = unitToken ?? match[2];
  } else {
    magnitude = value;
  }

  if (!Number.isFinite(magnitude)) {
    throw new UnitError(`Unlesbarer Zahlenwert: "${String(value)}"`);
  }

  // Ohne Einheit gilt SI. Bewusst KEIN Raten: eine stillschweigend
  // angenommene Einheit ist gefährlicher als eine Fehlermeldung.
  if (!unitToken || unitToken.trim() === "") return magnitude;

  const token = normalizeUnitToken(unitToken);
  const table = FACTORS[quantity];
  const factor = table[token];

  if (factor === undefined) {
    const known = Object.keys(table).join(", ");
    throw new UnitError(
      `Unbekannte Einheit "${unitToken}" für ${quantity}. Bekannt: ${known}.`,
    );
  }

  return magnitude * factor;
}

/** Sichere Variante: liefert null statt zu werfen. */
export function tryToSI(
  value: number | string | null | undefined,
  quantity: Quantity,
  unit?: string,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return toSI(value, quantity, unit);
  } catch {
    return null;
  }
}

/**
 * Formatiert einen SI-Wert lesbar: wählt selbst kN statt N, kN·m statt N·m,
 * wenn die Zahl sonst unhandlich wird. Deutsches Dezimalkomma.
 */
export function formatSI(value: number, quantity: Quantity, digits = 2): string {
  const abs = Math.abs(value);

  const pick = (): [number, string] => {
    switch (quantity) {
      case "force":
        return abs >= 1000 ? [value / 1000, "kN"] : [value, "N"];
      case "moment":
        return abs >= 1000 ? [value / 1000, "kN·m"] : [value, "N·m"];
      case "lineLoad":
        return abs >= 1000 ? [value / 1000, "kN/m"] : [value, "N/m"];
      case "stress":
        if (abs >= 1e9) return [value / 1e9, "GPa"];
        if (abs >= 1e6) return [value / 1e6, "MPa"];
        if (abs >= 1e3) return [value / 1e3, "kPa"];
        return [value, "Pa"];
      case "length":
        if (abs > 0 && abs < 0.01) return [value * 1000, "mm"];
        if (abs > 0 && abs < 1) return [value * 100, "cm"];
        return [value, "m"];
      default:
        return [value, SI_UNIT[quantity]];
    }
  };

  const [scaled, unit] = pick();
  const text = scaled.toFixed(digits).replace(/\.?0+$/, "").replace(".", ",");
  return `${text} ${unit}`;
}
