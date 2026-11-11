/**
 * Les résultats des solveurs, conservés pour « Als Video erklären ».
 *
 * Quand le tuteur appelle un solveur dans le chat (RDM, thermo, circuits…),
 * l'entrée et la sortie sont enregistrées (table `solver_result`). La vidéo
 * explicative peut alors s'appuyer sur ces chiffres CALCULÉS, et le validateur
 * (lib/video-script.ts) refuse tout nombre qui ne vient ni du cours ni d'eux.
 *
 * Module pur, testé dans tests/solver-results.test.ts.
 */

/** Taille maximale conservée par entrée ou sortie (caractères de JSON). */
export const MAX_SOLVER_JSON = 12_000;
/** Combien de calculs récents on donne au script d'une vidéo. */
export const MAX_SOLVER_RUNS = 8;
/** Sans conversation connue, on ne remonte pas plus loin (ms). */
export const SOLVER_WINDOW_MS = 2 * 60 * 60 * 1000;

export interface SolverRun {
  solver: string;
  input: unknown;
  output: unknown;
}

/** Un échec de solveur ({ ok: false }) n'est pas un résultat : on ne l'enregistre pas. */
export function isSolverResult(output: unknown): boolean {
  if (output === null || output === undefined) return false;
  if (typeof output === "object" && (output as { ok?: unknown }).ok === false) return false;
  return true;
}

/** JSON borné : un diagramme de 2 000 points ne doit pas remplir la base. */
export function boundedJson(value: unknown, max = MAX_SOLVER_JSON): string | null {
  let text: string;
  try {
    text = JSON.stringify(value) ?? "null";
  } catch {
    return null;
  }
  return text.length <= max ? text : null;
}

/** Prêt pour la base, ou null si le calcul n'est pas à garder. */
export function serializeSolverRun(run: SolverRun): { solver: string; input: string; output: string } | null {
  if (!isSolverResult(run.output)) return null;
  const output = boundedJson(compact(run.output));
  if (output === null) return null;
  return { solver: run.solver.slice(0, 60), input: boundedJson(run.input) ?? "{}", output };
}

/**
 * Retire ce qui ne sert pas à une explication : les longues séries de points
 * (courbes Q(x), M(x)) et les SVG. Les valeurs caractéristiques restent.
 */
export function compact(value: unknown, depth = 0): unknown {
  if (depth > 8) return undefined;
  if (typeof value === "string") return value.length > 600 || /^\s*<svg/i.test(value) ? undefined : value;
  if (Array.isArray(value)) {
    if (value.length > 24) return undefined;
    return value.map((v) => compact(v, depth + 1)).filter((v) => v !== undefined);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const c = compact(v, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  return value;
}

/* ── Les nombres qu'un solveur autorise ───────────────────────────────── */

/** Changements d'unité courants : N ↔ kN, mm ↔ m, cm ↔ m, Pa ↔ MPa, mm² ↔ m². */
const UNIT_FACTORS = [1, 1e3, 1e-3, 1e2, 1e-2, 1e6, 1e-6];

function trim(n: string): string {
  if (!n.includes(".")) return n.replace(/^(-?)0+(?=\d)/, "$1");
  return n.replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Les écritures permises d'une valeur calculée : la valeur, ses arrondis
 * (0 à 4 décimales, 2 à 4 chiffres significatifs) et ses conversions d'unité.
 * « 4166,67 N » autorise donc « 4,17 kN » — mais pas « 5 kN ».
 */
export function numberForms(value: number): string[] {
  if (!Number.isFinite(value)) return [];
  const forms = new Set<string>();
  for (const f of UNIT_FACTORS) {
    const v = Math.abs(value * f);
    if (v !== 0 && (v < 1e-6 || v >= 1e12)) continue;
    for (let d = 0; d <= 4; d++) forms.add(trim(v.toFixed(d)));
    for (let s = 2; s <= 4; s++) forms.add(trim(Number(v.toPrecision(s)).toFixed(6)));
  }
  return [...forms];
}

/** Tous les nombres d'une valeur JSON : les nombres eux-mêmes, et ceux écrits dans les textes. */
export function collectNumbers(value: unknown, extract: (text: string) => string[], out = new Set<string>(), depth = 0): Set<string> {
  if (depth > 10) return out;
  if (typeof value === "number") for (const f of numberForms(value)) out.add(f);
  else if (typeof value === "string") for (const n of extract(value)) for (const f of numberForms(Number(n))) out.add(f);
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, extract, out, depth + 1);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectNumbers(v, extract, out, depth + 1);
  return out;
}
