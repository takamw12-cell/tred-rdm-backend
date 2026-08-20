import { create, all, type MathJsInstance } from "mathjs";

/**
 * Deterministic arithmetic for the tutor.
 *
 * A language model *writes* numbers; it does not compute them. That is exactly
 * how a solution ends up saying "R3 sinkt, also sinkt U₋" while the arithmetic
 * says the opposite. Every number the tutor states should therefore come from
 * this evaluator, which actually computes it.
 *
 * The instance is locked down: expression parsing stays available, but the
 * functions that would let a crafted expression reach the host (import,
 * createUnit, evaluate, parse, simplify, derivative) are removed, as
 * recommended by mathjs for untrusted input.
 */
const math: MathJsInstance = create(all, { number: "number" });

// Captured BEFORE locking the namespace: this reference keeps working for us,
// while the same names become unreachable from inside an expression.
const limitedEvaluate = math.evaluate;
const limitedFormat = math.format;

const forbidden = [
  "import",
  "createUnit",
  "evaluate",
  "parse",
  "simplify",
  "derivative",
  "resolve",
];
math.import(
  Object.fromEntries(
    forbidden.map((name) => [
      name,
      () => {
        throw new Error(`Funktion "${name}" ist nicht verfügbar.`);
      },
    ]),
  ),
  { override: true },
);

const MAX_EXPRESSION_LENGTH = 500;

export interface CalculationResult {
  expression: string;
  /** Formatted result, or null when the expression could not be evaluated. */
  value: string | null;
  error?: string;
}

/**
 * Evaluates a single arithmetic expression. Units are supported
 * ("15 V * 1200 / (1200 ohm + 1200 ohm)" style inputs are accepted by mathjs),
 * as are the usual functions: sqrt, sin, cos, tan, log, exp, abs, ^.
 */
export function calculate(expression: string): CalculationResult {
  const expr = String(expression ?? "").trim();

  if (expr.length === 0) {
    return { expression: expr, value: null, error: "Leerer Ausdruck." };
  }
  if (expr.length > MAX_EXPRESSION_LENGTH) {
    return { expression: expr, value: null, error: "Ausdruck zu lang." };
  }

  try {
    // Fresh scope per call: no state can leak between calculations.
    const result = limitedEvaluate(expr, {});
    if (result === undefined || typeof result === "function") {
      return { expression: expr, value: null, error: "Kein numerisches Ergebnis." };
    }
    return { expression: expr, value: limitedFormat(result, { precision: 10 }) };
  } catch (err) {
    return {
      expression: expr,
      value: null,
      error: err instanceof Error ? err.message : "Ungültiger Ausdruck.",
    };
  }
}
